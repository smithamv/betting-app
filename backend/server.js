const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const AdmZip = require('adm-zip');
const xlsx = require('xlsx');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();

    const csvMimes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
    const zipMimes = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'];

    if (csvMimes.includes(mime) || name.endsWith('.csv')) {
      return cb(null, true);
    }

    if (zipMimes.includes(mime) || name.endsWith('.zip')) {
      return cb(null, true);
    }

    return cb(new Error('Only CSV or ZIP files are allowed'));
  }
});

// Middleware
app.use(cors());
// Increase body size limits to support large payloads (questions with base64 images)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Optional: Postgres pool (configuration via DATABASE_URL)
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

// ==================== IN-MEMORY DATABASE ====================
let assessments = {}; // Stores all assessment sessions

// ==================== HELPER FUNCTIONS ====================

// Generate random code
function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Calculate skip penalty (5% rounded to nearest 10)
function calculateSkipPenalty(currentCoins) {
  const penalty = currentCoins * 0.05;
  return Math.round(penalty / 10) * 10;
}

// Determine persona based on knowledge and confidence
function getPersona(accuracy, avgConfidence) {
  const highKnowledge = accuracy >= 50;
  const highConfidence = avgConfidence >= 40;

  if (highKnowledge && highConfidence) {
    return {
      name: 'Campus Legend',
      emoji: '🎓',
      message: "You walked in, owned it, and walked out. Absolute main character energy!"
    };
  } else if (highKnowledge && !highConfidence) {
    return {
      name: 'Undercover Genius',
      emoji: '🥸',
      message: "Acing it while betting low? You're too humble - flex a little next time!"
    };
  } else if (!highKnowledge && highConfidence) {
    return {
      name: 'Main Character Syndrome',
      emoji: '📸',
      message: "Big bets, bigger dreams! Maybe hit the library before the next party?"
    };
  } else {
    return {
      name: 'Netflix & Cram',
      emoji: '📺',
      message: "Running on coffee and vibes. Time to recharge and review those notes!"
    };
  }
}

// Calculate knowledge score
function calculateKnowledgeScore(responses, totalQuestions) {
  let score = 0;
  let maxScore = totalQuestions * 3;

  responses.forEach(r => {
    if (r.skipped || r.noAnswer) {
      // No points for skip/no answer
      score += 0;
    } else if (r.correct) {
      if (r.confidenceLevel === 'high') score += 3;
      else score += 1;
    } else {
      if (r.confidenceLevel === 'high') score -= 2;
      else score -= 1;
    }
  });

  return Math.max(0, Math.round((score / maxScore) * 100));
}

// Validate CSV questions
function validateQuestions(records) {
  const errors = [];
  const parsedQuestions = [];
  let validCount = 0;

  const requiredColumns = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'multiple_correct'];

  records.forEach((record, index) => {
    const rowNum = index + 2;
    const rowErrors = [];

    requiredColumns.forEach(col => {
      if (!record[col] || record[col].trim() === '') {
        rowErrors.push(`Missing "${col}"`);
      }
    });

    const rawCorrect = record.correct_answer || record.correct_answers || '';
    if (rawCorrect) {
      const answers = rawCorrect.toString().toUpperCase().split(',').map(a => a.trim());
      const validOptions = ['A', 'B', 'C', 'D'];
      const invalidAnswers = answers.filter(a => !validOptions.includes(a));
      
      if (invalidAnswers.length > 0) {
        rowErrors.push(`Invalid correct_answer: "${invalidAnswers.join(', ')}"`);
      }
    }

    if (record.multiple_correct) {
      const mc = record.multiple_correct.toLowerCase().trim();
      if (mc !== 'yes' && mc !== 'no') {
        rowErrors.push(`Invalid multiple_correct: "${record.multiple_correct}"`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      validCount++;
      const correctAnswers = (record.correct_answer || record.correct_answers || '').toString().toUpperCase().split(',').map(a => a.trim());
      parsedQuestions.push({
        row: rowNum,
        question: record.question,
        option_a: record.option_a,
        option_b: record.option_b,
        option_c: record.option_c,
        option_d: record.option_d,
        correct_answers: correctAnswers,
        multiple_correct: record.multiple_correct.toLowerCase().trim() === 'yes'
      });
    }
  });

  return { valid: validCount, errors, parsedQuestions };
}

// ==================== CSV ENDPOINTS ====================

// Download CSV template
app.get('/api/template', (req, res) => {
  const template = `question,question_image,option_a,option_a_image,option_b,option_b_image,option_c,option_c_image,option_d,option_d_image,correct_answer,multiple_correct
"What is the capital of France?","images/q1.jpg","London","images/q1_a.jpg","Paris","images/q1_b.jpg","Berlin","","Madrid","","B","no"
"Which are primary colors?","","Red","","Green","","Blue","","Yellow","","A,C","yes"
"What is 5 + 7?","","10","","11","","12","","13","","C","no"`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="questions_template.csv"');
  res.send(template);
});

// Parse and validate CSV
app.post('/api/questions/preview', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const cleanContent = csvContent.replace(/^\uFEFF/, '');
      
      const records = parse(cleanContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true
      });

      if (records.length === 0) {
        return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
      }

      const validationResults = validateQuestions(records);
      
      res.json({
        success: true,
        totalRows: records.length,
        validQuestions: validationResults.valid,
        errors: validationResults.errors,
        parsedQuestions: validationResults.parsedQuestions
      });
    } catch (error) {
      console.error('CSV Parse Error:', error);
      res.status(400).json({ 
        error: 'Failed to parse CSV file', 
        details: error.message 
      });
    }
  });
});

// ==================== ZIP IMAGE UPLOAD ====================
// Accepts a single ZIP file containing questions.xlsx and images/ folder.
app.post('/api/questions/upload_zip', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // simple size guard (e.g., 50MB)
  if (req.file.size > 50 * 1024 * 1024) {
    return res.status(400).json({ error: 'ZIP file too large (limit 50MB)' });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-'));

  try {
    // write zip to temp
    const zipPath = path.join(tmpDir, 'upload.zip');
    fs.writeFileSync(zipPath, req.file.buffer);

    // extract
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);

    // locate questions.xlsx
    const xlsxPath = path.join(tmpDir, 'questions.xlsx');
    if (!fs.existsSync(xlsxPath)) {
      throw new Error('questions.xlsx not found in ZIP root');
    }

    // parse workbook
    const workbook = xlsx.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const records = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    // required columns
    const required = [
      'question','question_image','option_a','option_a_image','option_b','option_b_image','option_c','option_c_image','option_d','option_d_image','multiple_correct'
    ];

    // validate columns present in header
    const header = Object.keys(records[0] || {});
    // allow either correct_answer or correct_answers
    const hasCorrectCol = header.includes('correct_answer') || header.includes('correct_answers');
    if (!hasCorrectCol) throw new Error('Missing required column: correct_answer or correct_answers');

    for (const col of required) {
      if (!header.includes(col)) {
        throw new Error(`Missing required column: ${col}`);
      }
    }

    // process each record, map images
    const processed = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      const mapImage = (filename) => {
        if (!filename || filename.toString().trim() === '') return null;
        const raw = filename.toString().trim();
        const fname = path.basename(raw.replace(/\\/g, '/'));
        const imagePath = path.join(tmpDir, 'images', fname);
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Missing image file for '${fname}' referenced on row ${rowNum}`);
        }
        // validate extension
        const ext = path.extname(fname).toLowerCase();
        if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
          throw new Error(`Invalid image format for ${fname} on row ${rowNum}`);
        }
        return imagePath;
      };

      const qImgPath = mapImage(row.question_image);
      const aImg = mapImage(row.option_a_image);
      const bImg = mapImage(row.option_b_image);
      const cImg = mapImage(row.option_c_image);
      const dImg = mapImage(row.option_d_image);

      // image processing helper
      const processImage = async (p) => {
        if (!p) return null;
        const img = sharp(p).rotate();
        const metadata = await img.metadata();
        // resize to fit within 1920x1080
        img.resize({ width: 1920, height: 1080, fit: 'inside' });
        // attempt compress to under 2MB with quality loop
        let buffer = await img.toBuffer();
        if (buffer.length <= 2 * 1024 * 1024) return `data:image/${metadata.format};base64,${buffer.toString('base64')}`;

        if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
          let quality = 90;
          while (buffer.length > 2 * 1024 * 1024 && quality >= 30) {
            buffer = await sharp(p).rotate().resize({ width: 1920, height: 1080, fit: 'inside' }).jpeg({ quality }).toBuffer();
            quality -= 10;
          }
        } else if (metadata.format === 'png') {
          // try png compression
          let quality = 9; // compression level
          while (buffer.length > 2 * 1024 * 1024 && quality >= 1) {
            buffer = await sharp(p).rotate().resize({ width: 1920, height: 1080, fit: 'inside' }).png({ compressionLevel: quality }).toBuffer();
            quality -= 2;
          }
        }

        if (buffer.length > 2 * 1024 * 1024) {
          throw new Error(`Unable to compress ${path.basename(p)} under 2MB`);
        }

        return `data:image/${metadata.format};base64,${buffer.toString('base64')}`;
      };

      // process images sequentially for this row
      const qImg = await processImage(qImgPath);
      const aImgB = await processImage(aImg);
      const bImgB = await processImage(bImg);
      const cImgB = await processImage(cImg);
      const dImgB = await processImage(dImg);

      const correctVal = row.correct_answer || row.correct_answers || '';

      processed.push({
        position: i + 1,
        question: row.question,
        question_image: qImg,
        option_a: row.option_a,
        option_a_image: aImgB,
        option_b: row.option_b,
        option_b_image: bImgB,
        option_c: row.option_c,
        option_c_image: cImgB,
        option_d: row.option_d,
        option_d_image: dImgB,
        correct_answer: correctVal
      });
    }

    // if Postgres pool available, persist to DB
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const insertText = `INSERT INTO questions
          (position, question, question_image, option_a, option_a_image, option_b, option_b_image, option_c, option_c_image, option_d, option_d_image, correct_answer)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id`;
        const inserted = [];
        for (const q of processed) {
          const vals = [q.position, q.question, q.question_image, q.option_a, q.option_a_image, q.option_b, q.option_b_image, q.option_c, q.option_c_image, q.option_d, q.option_d_image, q.correct_answer];
          const r = await client.query(insertText, vals);
          inserted.push(r.rows[0]);
        }
        await client.query('COMMIT');
        res.json({ success: true, questions: processed, inserted: inserted });
      } catch (dbErr) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error('DB insert error:', dbErr);
        res.status(500).json({ error: 'DB insert failed', details: dbErr.message });
      } finally {
        client.release();
      }
    } else {
      res.json({ success: true, questions: processed });
    }
  } catch (err) {
    console.error('ZIP Upload Error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    // cleanup
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

// ==================== ASSESSMENT ENDPOINTS ====================

// Create new assessment
app.post('/api/assessment/create', (req, res) => {
  try {
    const { name, questions, initialCoins, winMultiplier, timerSeconds, totalDuration } = req.body;
    let { studentCode, teacherCode } = req.body || {};

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No questions provided' });
    }

    function sanitize(code) {
      return String(code || '').trim().toUpperCase();
    }

    studentCode = sanitize(studentCode);
    teacherCode = sanitize(teacherCode);

    const codeRegex = /^[A-Z0-9-]{3,40}$/;

    // Validate or generate studentCode
    if (!studentCode) {
      studentCode = generateCode(6);
    } else {
      if (!codeRegex.test(studentCode)) {
        return res.status(400).json({ error: 'Invalid studentCode format' });
      }
      if (assessments[studentCode]) {
        return res.status(400).json({ error: 'studentCode already in use' });
      }
    }

    // Validate or generate teacherCode
    if (!teacherCode) {
      teacherCode = `${studentCode}-TCH-${Math.floor(1000 + Math.random() * 9000)}`;
    } else {
      if (!codeRegex.test(teacherCode)) {
        return res.status(400).json({ error: 'Invalid teacherCode format' });
      }
      if (assessments[teacherCode]) {
        return res.status(400).json({ error: 'teacherCode already in use' });
      }
    }

    const assessment = {
      id: uuidv4(),
      name: name || 'Assessment',
      studentCode,
      teacherCode,
      questions: questions.map((q, idx) => ({
        id: idx + 1,
        text: q.question,
        question_image: q.question_image || null,
        options: [
          { id: 'A', text: q.option_a, image: q.option_a_image || null },
          { id: 'B', text: q.option_b, image: q.option_b_image || null },
          { id: 'C', text: q.option_c, image: q.option_c_image || null },
          { id: 'D', text: q.option_d, image: q.option_d_image || null }
        ],
        correctAnswers: q.correct_answers,
        multipleCorrect: q.multiple_correct
      })),
      initialCoins: initialCoins || 1000,
      winMultiplier: winMultiplier || 2.0,
      // totalDuration is in seconds (sent from frontend). If not provided, fallback to per-question timerSeconds * question count
      totalDuration: typeof totalDuration === 'number' && totalDuration > 0
        ? totalDuration
        : (timerSeconds || 30) * (questions.length || 1),
      timerSeconds: timerSeconds || 30,
      students: {},
      createdAt: new Date(),
      status: 'active'
    };

    // Index by both codes (uppercase keys used throughout)
    assessments[studentCode] = assessment;
    assessments[teacherCode] = assessment;

    res.json({
      success: true,
      studentCode,
      teacherCode,
      assessmentName: assessment.name,
      questionCount: assessment.questions.length,
      initialCoins: assessment.initialCoins,
      winMultiplier: assessment.winMultiplier,
      timerSeconds: assessment.timerSeconds,
      totalDuration: assessment.totalDuration
    });
  } catch (error) {
    console.error('Create Assessment Error:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

// Join assessment (student)
app.post('/api/assessment/join', (req, res) => {
  try {
    const { code, studentName } = req.body;

    if (!code || !studentName) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const upper = String(code || '').toUpperCase();
    const assessment = assessments[upper];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found. Check your code.' });
    }

    // Check if it's the teacher code (exact match, case-insensitive)
    if (assessment.teacherCode && upper === String(assessment.teacherCode).toUpperCase()) {
      return res.status(400).json({ error: 'This is a teacher code. Students should use the short code.' });
    }

    // Check if name already exists
    const existingStudent = Object.values(assessment.students).find(
      s => s.name.toLowerCase() === studentName.toLowerCase()
    );

    if (existingStudent) {
      // Return existing student data (rejoin)
      return res.json({
        success: true,
        studentId: existingStudent.id,
        assessmentName: assessment.name,
        questionCount: assessment.questions.length,
        initialCoins: assessment.initialCoins,
        winMultiplier: assessment.winMultiplier,
        totalDuration: assessment.totalDuration,
        remainingTime: existingStudent.remainingTime,
        currentQuestion: existingStudent.currentQuestion,
        currentCoins: existingStudent.coins
      });
    }

    // Create new student
    const studentId = uuidv4();
    assessment.students[studentId] = {
      id: studentId,
      name: studentName.trim(),
      coins: assessment.initialCoins,
      currentQuestion: 0,
      responses: [],
      joinedAt: new Date(),
      // remainingTime in seconds for the whole assessment
      remainingTime: assessment.totalDuration
    };

    res.json({
      success: true,
      studentId,
      assessmentName: assessment.name,
      questionCount: assessment.questions.length,
      initialCoins: assessment.initialCoins,
      winMultiplier: assessment.winMultiplier,
      totalDuration: assessment.totalDuration,
      remainingTime: assessment.totalDuration,
      currentQuestion: 0,
      currentCoins: assessment.initialCoins
    });
  } catch (error) {
    console.error('Join Assessment Error:', error);
    res.status(500).json({ error: 'Failed to join assessment' });
  }
});

// Check code type (student or teacher)
app.get('/api/assessment/check/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = assessments[code];

  if (!assessment) {
    return res.status(404).json({ error: 'Assessment not found' });
  }

  // Consider it a teacher code if it exactly matches the stored teacherCode (case-insensitive)
  const isTeacher = !!(assessment.teacherCode && code === String(assessment.teacherCode).toUpperCase());

  res.json({
    success: true,
    isTeacher,
    assessmentName: assessment.name,
    questionCount: assessment.questions.length
  });
});

// Get current question for student
app.get('/api/assessment/:code/student/:studentId/question', (req, res) => {
  try {
    const { code, studentId } = req.params;
    const assessment = assessments[code.toUpperCase()];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const student = assessment.students[studentId];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    if (student.remainingTime <= 0) {
      return res.json({ complete: true, reason: 'time_up' });
    }

    // If student has no coins left, mark complete
    if (typeof student.coins === 'number' && student.coins <= 0) {
      student.currentQuestion = assessment.questions.length;
      return res.json({ complete: true, reason: 'no_coins', currentCoins: student.coins });
    }

    if (student.currentQuestion >= assessment.questions.length) {
      return res.json({ complete: true });
    }

    const question = assessment.questions[student.currentQuestion];

    res.json({
      questionNumber: student.currentQuestion + 1,
      totalQuestions: assessment.questions.length,
      question: {
        id: question.id,
        text: question.text,
        question_image: question.question_image || null,
        options: question.options,
        multipleCorrect: question.multipleCorrect
      },
      currentCoins: student.coins,
      remainingTime: student.remainingTime
    });
  } catch (error) {
    console.error('Get Question Error:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

// Submit answer (bet, skip, or timeout)
app.post('/api/assessment/:code/student/:studentId/submit', (req, res) => {
  try {
    const { code, studentId } = req.params;
    const { bets, skipped, noAnswer, timeTaken } = req.body;

    const assessment = assessments[code.toUpperCase()];
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const student = assessment.students[studentId];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const question = assessment.questions[student.currentQuestion];
    if (!question) {
      return res.status(400).json({ error: 'No more questions' });
    }

    // Deduct elapsed assessment time from student's remainingTime
    const elapsed = parseInt(timeTaken || 0, 10);
    student.remainingTime = Math.max(0, (student.remainingTime || assessment.totalDuration) - elapsed);

    // If time is up, finalize and return last-state
    if (student.remainingTime <= 0) {
      // mark as complete
      student.currentQuestion = assessment.questions.length;
      return res.json({
        success: true,
        results: {
          timeUp: true,
          isLastQuestion: true,
          newTotal: student.coins,
          remainingTime: 0
        }
      });
    }

    let response = {
      questionId: question.id,
      questionText: question.text,
      timeTaken: timeTaken || 0,
      correctAnswers: question.correctAnswers
    };

    if (skipped || noAnswer) {
      // Skip or no answer - apply 5% penalty
      const penalty = calculateSkipPenalty(student.coins);
      student.coins = Math.max(0, student.coins - penalty);
      
      response = {
        ...response,
        skipped: !!skipped,
        noAnswer: !!noAnswer,
        penalty,
        coinsAfter: student.coins,
        correct: false,
        confidenceLevel: 'none'
      };
    } else {
      // Process bets
      const totalBet = Object.values(bets || {}).reduce((sum, val) => sum + (val || 0), 0);
      
      if (totalBet > student.coins) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }

      // Calculate confidence level
      const confidencePercent = (totalBet / student.coins) * 100;
      const confidenceLevel = confidencePercent >= 40 ? 'high' : 'low';

      // Calculate results using deduct-then-pay model
      let coinsReturned = 0; // total returned to student (payouts for correct bets)
      let coinsLost = 0; // total stakes lost (wrong bets)
      const betResults = {};
      let hasCorrectBet = false;

      // Deduct all stakes up-front
      const previousCoins = student.coins;
      student.coins = Math.max(0, student.coins - totalBet);

      Object.entries(bets || {}).forEach(([option, amount]) => {
        amount = Number(amount || 0);
        if (amount > 0) {
          const isCorrect = question.correctAnswers.includes(option);
          if (isCorrect) {
            hasCorrectBet = true;
            // Payout is floored to integer coins to avoid fractional coin credits
            const payout = Math.floor(amount * assessment.winMultiplier); // includes stake + profit
            coinsReturned += payout;
            // add payout back to student's coins
            student.coins += payout;
            betResults[option] = { amount, correct: true, payout, profit: payout - amount };
          } else {
            coinsLost += amount;
            betResults[option] = { amount, correct: false, lost: amount };
          }
        }
      });

      const netChange = student.coins - previousCoins;

      response = {
        ...response,
        skipped: false,
        noAnswer: false,
        bets,
        betResults,
        coinsReturned,
        coinsLost,
        netChange,
        coinsAfter: student.coins,
        correct: hasCorrectBet,
        confidenceLevel,
        confidencePercent
      };
    }

    // push response and advance
    student.responses.push(response);
    student.currentQuestion++;

    // If coins are exhausted, treat assessment as complete
    let isLastQuestion = student.currentQuestion >= assessment.questions.length || student.remainingTime <= 0;
    if (typeof student.coins === 'number' && student.coins <= 0) {
      isLastQuestion = true;
      student.currentQuestion = assessment.questions.length;
    }

    res.json({
      success: true,
      results: {
        ...response,
        newTotal: student.coins,
        isLastQuestion,
        remainingTime: student.remainingTime
      }
    });
  } catch (error) {
    console.error('Submit Answer Error:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// Get student report
app.get('/api/assessment/:code/student/:studentId/report', (req, res) => {
  try {
    const { code, studentId } = req.params;
    const assessment = assessments[code.toUpperCase()];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const student = assessment.students[studentId];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Calculate stats
    const totalQuestions = assessment.questions.length;
    const answered = student.responses.filter(r => !r.skipped && !r.noAnswer).length;
    const correct = student.responses.filter(r => r.correct).length;
    const skipped = student.responses.filter(r => r.skipped).length;
    const noAnswer = student.responses.filter(r => r.noAnswer).length;
    const wrong = answered - correct;

    const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
    
    // Calculate average confidence
    const bettingResponses = student.responses.filter(r => !r.skipped && !r.noAnswer && r.confidencePercent !== undefined);
    const avgConfidence = bettingResponses.length > 0 
      ? bettingResponses.reduce((sum, r) => sum + r.confidencePercent, 0) / bettingResponses.length
      : 0;

    // Calculate average time
    const avgTime = student.responses.length > 0
      ? student.responses.reduce((sum, r) => sum + (r.timeTaken || 0), 0) / student.responses.length
      : 0;

    // Get persona
    const persona = getPersona(accuracy, avgConfidence);

    // Calculate knowledge score
    const knowledgeScore = calculateKnowledgeScore(student.responses, totalQuestions);

    // Get rank
    const allStudents = Object.values(assessment.students)
      .filter(s => s.responses.length === totalQuestions)
      .sort((a, b) => b.coins - a.coins);
    const rank = allStudents.findIndex(s => s.id === studentId) + 1;

    // Identify strengths and weaknesses
    const wrongQuestions = student.responses
      .filter(r => !r.correct)
      .map(r => r.questionText);

    res.json({
      success: true,
      report: {
        studentName: student.name,
        assessmentName: assessment.name,
        date: assessment.createdAt,
        
        // Core stats
        finalCoins: student.coins,
        initialCoins: assessment.initialCoins,
        rank: rank || '-',
        totalStudents: allStudents.length,
        
        // Performance
        totalQuestions,
        answered,
        correct,
        wrong,
        skipped,
        noAnswer,
        accuracy: Math.round(accuracy),
        avgConfidence: Math.round(avgConfidence),
        avgTime: Math.round(avgTime),
        knowledgeScore,
        
        // Persona
        persona,
        
        // Details
        responses: student.responses,
        wrongQuestions,
        
        // Settings
        winMultiplier: assessment.winMultiplier,
        totalDuration: assessment.totalDuration
      }
    });
  } catch (error) {
    console.error('Get Student Report Error:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Get teacher report
app.get('/api/assessment/:code/teacher/report', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const assessment = assessments[code];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Verify it's the teacher code (exact match)
    if (!(assessment.teacherCode && code === String(assessment.teacherCode).toUpperCase())) {
      return res.status(403).json({ error: 'Teacher code required for this report' });
    }

    const students = Object.values(assessment.students);
    const totalQuestions = assessment.questions.length;

    // Calculate class stats
    const completedStudents = students.filter(s => s.responses.length === totalQuestions);
    
    const classStats = {
      totalStudents: students.length,
      completedStudents: completedStudents.length,
      avgCoins: completedStudents.length > 0 
        ? Math.round(completedStudents.reduce((sum, s) => sum + s.coins, 0) / completedStudents.length)
        : 0,
      avgAccuracy: 0,
      avgKnowledgeScore: 0
    };

    // Calculate per-student stats
    const studentStats = students.map(student => {
      const answered = student.responses.filter(r => !r.skipped && !r.noAnswer).length;
      const correct = student.responses.filter(r => r.correct).length;
      const skipped = student.responses.filter(r => r.skipped).length;
      const noAnswer = student.responses.filter(r => r.noAnswer).length;
      const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
      
      const bettingResponses = student.responses.filter(r => !r.skipped && !r.noAnswer && r.confidencePercent !== undefined);
      const avgConfidence = bettingResponses.length > 0 
        ? bettingResponses.reduce((sum, r) => sum + r.confidencePercent, 0) / bettingResponses.length
        : 0;

      const knowledgeScore = calculateKnowledgeScore(student.responses, totalQuestions);
      const persona = getPersona(accuracy, avgConfidence);

      return {
        id: student.id,
        name: student.name,
        coins: student.coins,
        completed: student.responses.length === totalQuestions,
        questionsAnswered: student.responses.length,
        correct,
        wrong: answered - correct,
        skipped,
        noAnswer,
        accuracy: Math.round(accuracy),
        avgConfidence: Math.round(avgConfidence),
        knowledgeScore,
        persona,
        responses: student.responses
      };
    }).sort((a, b) => b.coins - a.coins);

    // Calculate class averages
    if (completedStudents.length > 0) {
      classStats.avgAccuracy = Math.round(
        studentStats.filter(s => s.completed).reduce((sum, s) => sum + s.accuracy, 0) / completedStudents.length
      );
      classStats.avgKnowledgeScore = Math.round(
        studentStats.filter(s => s.completed).reduce((sum, s) => sum + s.knowledgeScore, 0) / completedStudents.length
      );
    }

    // Question analysis
    const questionAnalysis = assessment.questions.map((q, idx) => {
      const questionResponses = students
        .map(s => s.responses[idx])
        .filter(r => r);

      const attempted = questionResponses.filter(r => !r.skipped && !r.noAnswer).length;
      const correct = questionResponses.filter(r => r.correct).length;
      const skipped = questionResponses.filter(r => r.skipped || r.noAnswer).length;
      
      // Find common wrong answers
      const wrongBets = {};
      questionResponses.forEach(r => {
        if (r.betResults) {
          Object.entries(r.betResults).forEach(([opt, data]) => {
            if (!data.correct && data.amount > 0) {
              wrongBets[opt] = (wrongBets[opt] || 0) + 1;
            }
          });
        }
      });

      // High confidence wrong answers (misconceptions)
      const highConfidenceWrong = questionResponses.filter(
        r => !r.correct && r.confidenceLevel === 'high'
      ).length;

      return {
        questionNumber: idx + 1,
        questionText: q.text,
        correctAnswers: q.correctAnswers,
        attempted,
        correct,
        skipped,
        accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        commonWrongAnswers: wrongBets,
        misconceptionAlert: highConfidenceWrong >= Math.ceil(students.length * 0.3) // 30%+ got it wrong with high confidence
      };
    });

    // Students needing help (low scores or high skip rates)
    const studentsNeedingHelp = studentStats.filter(
      s => s.completed && (s.knowledgeScore < 40 || s.skipped + s.noAnswer > totalQuestions * 0.3)
    );

    res.json({
      success: true,
      report: {
        assessmentName: assessment.name,
        date: assessment.createdAt,
        settings: {
          initialCoins: assessment.initialCoins,
          winMultiplier: assessment.winMultiplier,
          totalDuration: assessment.totalDuration
        },
        
        classStats,
        studentStats,
        questionAnalysis,
        studentsNeedingHelp: studentsNeedingHelp.map(s => s.name),
        
        // Raw data for detailed analysis
        questions: assessment.questions
      }
    });
  } catch (error) {
    console.error('Get Teacher Report Error:', error);
    res.status(500).json({ error: 'Failed to get teacher report' });
  }
});

// ==================== PDF GENERATION ====================

// Generate Student PDF Report
app.get('/api/assessment/:code/student/:studentId/pdf', (req, res) => {
  try {
    const { code, studentId } = req.params;
    const assessment = assessments[code.toUpperCase()];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const student = assessment.students[studentId];
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Calculate stats (same as report endpoint)
    const totalQuestions = assessment.questions.length;
    const answered = student.responses.filter(r => !r.skipped && !r.noAnswer).length;
    const correct = student.responses.filter(r => r.correct).length;
    const skipped = student.responses.filter(r => r.skipped).length;
    const noAnswer = student.responses.filter(r => r.noAnswer).length;
    const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
    
    const bettingResponses = student.responses.filter(r => !r.skipped && !r.noAnswer && r.confidencePercent !== undefined);
    const avgConfidence = bettingResponses.length > 0 
      ? bettingResponses.reduce((sum, r) => sum + r.confidencePercent, 0) / bettingResponses.length
      : 0;

    const persona = getPersona(accuracy, avgConfidence);
    const knowledgeScore = calculateKnowledgeScore(student.responses, totalQuestions);

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${student.name}_report.pdf"`);
    
    doc.pipe(res);

    // Title
    doc.fontSize(24).text('Assessment Report', { align: 'center' });
    doc.moveDown();

    // Persona section
    doc.fontSize(32).text(persona.emoji, { align: 'center' });
    doc.fontSize(20).text(persona.name, { align: 'center' });
    doc.fontSize(12).text(persona.message, { align: 'center', italic: true });
    doc.moveDown();

    // Student info
    doc.fontSize(14).text(`Student: ${student.name}`);
    doc.text(`Assessment: ${assessment.name}`);
    doc.text(`Date: ${new Date(assessment.createdAt).toLocaleDateString()}`);
    doc.moveDown();

    // Stats
    doc.fontSize(16).text('Performance Summary', { underline: true });
    doc.fontSize(12);
    doc.text(`Final Coins: ${student.coins} (Started: ${assessment.initialCoins})`);
    doc.text(`Knowledge Score: ${knowledgeScore}/100`);
    doc.text(`Accuracy: ${Math.round(accuracy)}%`);
    doc.text(`Average Confidence: ${Math.round(avgConfidence)}%`);
    doc.moveDown();

    doc.text(`Questions Answered: ${answered}/${totalQuestions}`);
    doc.text(`Correct: ${correct}`);
    doc.text(`Wrong: ${answered - correct}`);
    doc.text(`Skipped/No Answer: ${skipped + noAnswer}`);
    doc.moveDown();

    // Question breakdown
    doc.fontSize(16).text('Question Details', { underline: true });
    doc.fontSize(10);
    
    student.responses.forEach((r, idx) => {
      doc.moveDown(0.5);
      doc.text(`Q${idx + 1}: ${r.questionText.substring(0, 60)}...`);
      if (r.skipped) {
        doc.text(`   Result: SKIPPED (Penalty: -${r.penalty} coins)`);
      } else if (r.noAnswer) {
        doc.text(`   Result: NO ANSWER (Penalty: -${r.penalty} coins)`);
      } else {
        doc.text(`   Result: ${r.correct ? 'CORRECT' : 'WRONG'} | Net: ${r.netChange >= 0 ? '+' : ''}${r.netChange} coins`);
      }
    });

    doc.end();
  } catch (error) {
    console.error('Generate Student PDF Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Generate Teacher PDF Report
app.get('/api/assessment/:code/teacher/pdf', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const assessment = assessments[code];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    if (!(assessment.teacherCode && code === String(assessment.teacherCode).toUpperCase())) {
      return res.status(403).json({ error: 'Teacher code required' });
    }

    const students = Object.values(assessment.students);
    const totalQuestions = assessment.questions.length;

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${assessment.name}_teacher_report.pdf"`);
    
    doc.pipe(res);

    // Title
    doc.fontSize(24).text('Teacher Report', { align: 'center' });
    doc.fontSize(16).text(assessment.name, { align: 'center' });
    doc.fontSize(12).text(`Date: ${new Date(assessment.createdAt).toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Class overview
    doc.fontSize(16).text('Class Overview', { underline: true });
    doc.fontSize(12);
    doc.text(`Total Students: ${students.length}`);
    doc.text(`Total Questions: ${totalQuestions}`);
    doc.text(`Initial Coins: ${assessment.initialCoins}`);
    doc.text(`Win Multiplier: ${assessment.winMultiplier}x`);
    // totalDuration is in seconds
    const minutes = Math.round((assessment.totalDuration || assessment.timerSeconds) / 60);
    doc.text(`Total Duration: ${minutes} minutes`);
    doc.moveDown();

    // Leaderboard
    doc.fontSize(16).text('Student Rankings', { underline: true });
    doc.fontSize(10);
    
    const sortedStudents = [...students].sort((a, b) => b.coins - a.coins);
    sortedStudents.forEach((student, idx) => {
      const answered = student.responses.filter(r => !r.skipped && !r.noAnswer).length;
      const correct = student.responses.filter(r => r.correct).length;
      const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
      
      doc.text(`${idx + 1}. ${student.name} - ${student.coins} coins (${accuracy}% accuracy)`);
    });
    doc.moveDown();

    // Question analysis
    doc.addPage();
    doc.fontSize(16).text('Question Analysis', { underline: true });
    doc.fontSize(10);

    assessment.questions.forEach((q, idx) => {
      const responses = students.map(s => s.responses[idx]).filter(r => r);
      const attempted = responses.filter(r => !r.skipped && !r.noAnswer).length;
      const correct = responses.filter(r => r.correct).length;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

      doc.moveDown(0.5);
      doc.text(`Q${idx + 1}: ${q.text.substring(0, 70)}...`);
      doc.text(`   Correct Answer: ${q.correctAnswers.join(', ')} | Class Accuracy: ${accuracy}%`);
    });

    doc.end();
  } catch (error) {
    console.error('Generate Teacher PDF Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeAssessments: Object.keys(assessments).length / 2 // Divided by 2 because we store by both codes
  });
});

// Start server (Render-friendly)
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🎲 Betting Assessment Server running on port ${PORT}`);
  console.log(`📋 Download template: /api/template`);
  console.log(`❤️  Health check: /api/health`);

  if (pool) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Postgres DATABASE_URL detected and connection validated. ZIP uploads will persist to DB.');

      // Optionally run migrations automatically when AUTO_MIGRATE=1
      if (process.env.AUTO_MIGRATE === '1') {
        try {
          console.log('AUTO_MIGRATE=1 detected — running migrations before accepting traffic.');
          const { spawnSync } = require('child_process');
          const path = require('path');
          const localRunner = path.join(__dirname, 'scripts', 'run_migrations.js');
          const r = spawnSync(process.execPath, [localRunner], { stdio: 'inherit' });
          if (r.error || r.status !== 0) {
            console.error('Auto-migrate failed, see output above.');
          } else {
            console.log('Auto-migrate finished.');
          }
        } catch (mErr) {
          console.error('Auto-migrate error:', mErr.message);
        }
      }
    } catch (e) {
      console.error('❌ Postgres connection test failed:', e.message);
      console.log('Please verify DATABASE_URL and run migrations before using ZIP upload persistence.');
    }
  } else {
    console.log('⚠️  No DATABASE_URL configured — ZIP uploads will be processed but not persisted.');
    console.log('To enable DB persistence, set DATABASE_URL and run the migrations in backend/migrations.');
  }
});

// DB health endpoint
app.get('/api/db/health', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'no_database_configured' });
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('DB Health Check Failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});



// Serve the React build (production)
app.use(express.static(path.join(__dirname, "..", "frontend", "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "build", "index.html"));
});
