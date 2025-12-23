const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

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

  const requiredColumns = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'multiple_correct'];

  records.forEach((record, index) => {
    const rowNum = index + 2;
    const rowErrors = [];

    requiredColumns.forEach(col => {
      if (!record[col] || record[col].trim() === '') {
        rowErrors.push(`Missing "${col}"`);
      }
    });

    if (record.correct_answer) {
      const answers = record.correct_answer.toUpperCase().split(',').map(a => a.trim());
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
      const correctAnswers = record.correct_answer.toUpperCase().split(',').map(a => a.trim());
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
  const template = `question,option_a,option_b,option_c,option_d,correct_answer,multiple_correct
"What is the capital of France?","London","Paris","Berlin","Madrid","B","no"
"Which are primary colors?","Red","Green","Blue","Yellow","A,C","yes"
"What is 5 + 7?","10","11","12","13","C","no"`;
  
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

// ==================== ASSESSMENT ENDPOINTS ====================

// Create new assessment
app.post('/api/assessment/create', (req, res) => {
  try {
    const { name, questions, initialCoins, winMultiplier, timerSeconds } = req.body;

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No questions provided' });
    }

    const studentCode = generateCode(6);
    const teacherCode = `${studentCode}-TCH-${Math.floor(1000 + Math.random() * 9000)}`;

    const assessment = {
      id: uuidv4(),
      name: name || 'Assessment',
      studentCode,
      teacherCode,
      questions: questions.map((q, idx) => ({
        id: idx + 1,
        text: q.question,
        options: [
          { id: 'A', text: q.option_a },
          { id: 'B', text: q.option_b },
          { id: 'C', text: q.option_c },
          { id: 'D', text: q.option_d }
        ],
        correctAnswers: q.correct_answers,
        multipleCorrect: q.multiple_correct
      })),
      initialCoins: initialCoins || 1000,
      winMultiplier: winMultiplier || 2.0,
      timerSeconds: timerSeconds || 30,
      students: {},
      createdAt: new Date(),
      status: 'active'
    };

    assessments[studentCode] = assessment;
    assessments[teacherCode] = assessment; // Also index by teacher code

    res.json({
      success: true,
      studentCode,
      teacherCode,
      assessmentName: assessment.name,
      questionCount: assessment.questions.length,
      initialCoins: assessment.initialCoins,
      winMultiplier: assessment.winMultiplier,
      timerSeconds: assessment.timerSeconds
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

    const assessment = assessments[code.toUpperCase()];

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found. Check your code.' });
    }

    // Check if it's a teacher code
    if (code.toUpperCase().includes('-TCH-')) {
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
        timerSeconds: assessment.timerSeconds,
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
      joinedAt: new Date()
    };

    res.json({
      success: true,
      studentId,
      assessmentName: assessment.name,
      questionCount: assessment.questions.length,
      initialCoins: assessment.initialCoins,
      winMultiplier: assessment.winMultiplier,
      timerSeconds: assessment.timerSeconds,
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

  const isTeacher = code.includes('-TCH-');

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
        options: question.options,
        multipleCorrect: question.multipleCorrect
      },
      currentCoins: student.coins,
      timerSeconds: assessment.timerSeconds
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

      // Calculate results
      let coinsWon = 0;
      let coinsLost = 0;
      const betResults = {};
      let hasCorrectBet = false;

      Object.entries(bets || {}).forEach(([option, amount]) => {
        if (amount > 0) {
          const isCorrect = question.correctAnswers.includes(option);
          if (isCorrect) {
            hasCorrectBet = true;
            const winnings = Math.floor(amount * assessment.winMultiplier);
            coinsWon += winnings;
            betResults[option] = { amount, correct: true, winnings };
          } else {
            coinsLost += amount;
            betResults[option] = { amount, correct: false, winnings: -amount };
          }
        }
      });

      const netChange = coinsWon - coinsLost;
      student.coins = Math.max(0, student.coins + netChange);

      response = {
        ...response,
        skipped: false,
        noAnswer: false,
        bets,
        betResults,
        coinsWon,
        coinsLost,
        netChange,
        coinsAfter: student.coins,
        correct: hasCorrectBet,
        confidenceLevel,
        confidencePercent
      };
    }

    student.responses.push(response);
    student.currentQuestion++;

    const isLastQuestion = student.currentQuestion >= assessment.questions.length;

    res.json({
      success: true,
      results: {
        ...response,
        newTotal: student.coins,
        isLastQuestion
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
        timerSeconds: assessment.timerSeconds
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

    // Verify it's a teacher code
    if (!code.includes('-TCH-')) {
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
          timerSeconds: assessment.timerSeconds
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

    if (!code.includes('-TCH-')) {
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
    doc.text(`Timer: ${assessment.timerSeconds} seconds`);
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎲 Betting Assessment Server running on port ${PORT}`);
  console.log(`📋 Download template: /api/template`);
  console.log(`❤️  Health check: /api/health`);
});



const path = require("path");

// Serve the React build (production)
app.use(express.static(path.join(__dirname, "..", "frontend", "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "build", "index.html"));
});
