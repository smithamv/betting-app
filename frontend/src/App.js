import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import BettingQuestion from './components/BettingQuestion';
import vijaiLogo from './assets/vijai_logo.svg';

const API_URL = '/api';

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==================== ENTRY SCREEN ====================
function EntryScreen({ onJoinAssessment, onCreateAssessment, onTeacherReport }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter a code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/assessment/check/${code}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      // If code corresponds to a teacher, open teacher report flow
      if (data.isTeacher) {
        onTeacherReport(code);
        return;
      }

      // Otherwise start student join flow
      onJoinAssessment(code);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entry-container">
      <div className="entry-card">
        <h1 className="brand-title">QUEST</h1>
        <p className="subtitle">Test your knowledge, bet on your confidence!</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder=" Enter assessment code e.g., MATH5A"
              maxLength={20}
            />
          </div>

          {error && <div className="error-box">❌ {error}</div>}

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? '⏳ Checking...' : '🚀 Join Assessment'}
          </button>
        </form>

        <div className="divider">
          <span>OR</span>
        </div>

        <button className="btn btn-secondary btn-large" onClick={onCreateAssessment}>
          📝 Create New Assessment
        </button>
      </div>
    </div>
  );
}

// ==================== QUESTION UPLOAD ====================
function QuestionUpload({ onQuestionsValidated }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadTemplate = async () => {
    try {
      const res = await fetch(`${API_URL}/template`);
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'questions_template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download template error:', err);
      alert('Unable to download template. Is the backend running?');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setPreview(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // If CSV, do a quick client-side header validation before sending
      const isZip = file.name && file.name.toLowerCase().endsWith('.zip');
      if (!isZip && file.name && file.name.toLowerCase().endsWith('.csv')) {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.onload = () => resolve(reader.result);
          reader.readAsText(file, 'utf-8');
        });

        const lines = text.split(/\r?\n/).filter(l => l && l.trim());
        if (lines.length === 0) throw new Error('CSV file is empty');
        const headerLine = lines[0];

        // simple CSV header parser that respects quoted fields
        const parseCsvLine = (line) => {
          const fields = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i+1] === '"') {
                cur += '"'; // escaped quote
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (ch === ',' && !inQuotes) {
              fields.push(cur);
              cur = '';
            } else {
              cur += ch;
            }
          }
          fields.push(cur);
          return fields.map(f => f.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        };

        const headerFields = parseCsvLine(headerLine).map(h => h.toLowerCase());
        const requiredBase = ['question','option_a','option_b','option_c','option_d','multiple_correct'];
        const hasCorrect = headerFields.includes('correct_answer') || headerFields.includes('correct_answers');
        if (!hasCorrect) {
          throw new Error('CSV missing required column: correct_answer or correct_answers');
        }
        const missing = requiredBase.filter(r => !headerFields.includes(r));
        if (missing.length > 0) {
          throw new Error('CSV missing required columns: ' + missing.join(', '));
        }
      }

      const formData = new FormData();
      formData.append('file', file);

      // choose endpoint based on file extension (recompute isZip after validation block)
      const isZip2 = file.name && file.name.toLowerCase().endsWith('.zip');
      const endpoint = isZip2 ? `${API_URL}/questions/upload_zip` : `${API_URL}/questions/preview`;

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (!text) {
        throw new Error('Server returned empty response. Make sure backend is running.');
      }

      let data;
      if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON response from server');
        }
      } else {
        // Likely an HTML error page (e.g., dev server served index.html)
        const snippet = text.substring(0, 1000);
        throw new Error('Server returned non-JSON response. Ensure backend is running and endpoint is available.\n' + snippet);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse file');
      }

      // Normalize preview shape: CSV preview returns { parsedQuestions, errors, validQuestions }
      // ZIP upload returns { questions: [ { question, question_image, option_a, option_a_image, ... } ] }
      if (isZip) {
        // map to expected parsedQuestions shape with image data
        const mapped = data.questions.map(q => ({
          question: q.question,
          question_image: q.question_image || null,
          option_a: q.option_a,
          option_a_image: q.option_a_image || null,
          option_b: q.option_b,
          option_b_image: q.option_b_image || null,
          option_c: q.option_c,
          option_c_image: q.option_c_image || null,
          option_d: q.option_d,
          option_d_image: q.option_d_image || null,
          correct_answers: Array.isArray(q.correct_answer) ? q.correct_answer : (q.correct_answer ? q.correct_answer.toString().split(',').map(s=>s.trim()) : []),
          multiple_correct: false
        }));

        setPreview({
          success: true,
          totalRows: mapped.length,
          validQuestions: mapped.length,
          errors: [],
          parsedQuestions: mapped,
          raw: data
        });
      } else {
        setPreview(data);
      }
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        setError('Cannot connect to server. Make sure backend is running.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (preview && preview.parsedQuestions.length > 0) {
      onQuestionsValidated(preview.parsedQuestions);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-card">
        <h1>📝 Create Assessment</h1>
        <p className="subtitle">Upload your questions to get started</p>

        <div className="template-section">
          <h3>Step 1: Download Template</h3>
          <p>Get the CSV template with sample questions</p>
          <button className="btn btn-secondary" onClick={downloadTemplate}>
            📥 Download Template
          </button>
        </div>

        <div className="upload-section">
          <h3>Step 2: Upload Your Questions</h3>
          <p className="muted">You can upload a CSV or a ZIP. For CSV include these columns exactly: <code>question,question_image,option_a,option_a_image,option_b,option_b_image,option_c,option_c_image,option_d,option_d_image,correct_answer,multiple_correct</code>. To upload images, send a ZIP with a <strong>questions.xlsx</strong> file and an <strong>images/</strong> folder — image filenames referenced in the sheet must appear in the <strong>images/</strong> folder.</p>
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".csv,.zip,application/zip"
              onChange={handleFileChange}
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="file-label">
              {file ? `📄 ${file.name}` : '📁 Choose CSV file...'}
            </label>
          </div>
          
          {file && !preview && (
            <button 
              className="btn btn-primary" 
              onClick={handlePreview}
              disabled={loading}
            >
              {loading ? '⏳ Parsing...' : '👁️ Preview Questions'}
            </button>
          )}
        </div>

        {error && <div className="error-box">❌ {error}</div>}

        {preview && (
          <div className="preview-section">
            <h3>Step 3: Review & Confirm</h3>
            
            <div className="preview-summary">
              <span className="valid">✅ {preview.validQuestions} valid</span>
              {preview.errors.length > 0 && (
                <span className="invalid">❌ {preview.errors.length} errors</span>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="errors-list">
                <h4>Errors Found:</h4>
                {preview.errors.map((err, idx) => (
                  <div key={idx} className="error-item">
                    <strong>Row {err.row}:</strong> {err.errors.join(', ')}
                  </div>
                ))}
              </div>
            )}

            {preview.parsedQuestions.length > 0 && (
              <div className="questions-preview">
                <h4>Questions to Load ({preview.parsedQuestions.length}):</h4>
                <div className="preview-table-wrapper">
                  <table className="preview-table">
                    <thead>
                        <tr>
                          <th>#</th>
                          <th>Question</th>
                          <th>Image</th>
                          <th>Correct</th>
                          <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                      {preview.parsedQuestions.map((q, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                            <td className="question-cell">{q.question}</td>
                            <td className="img-cell">
                              {q.question_image ? (
                                <img src={q.question_image} alt={`q${idx+1}`} style={{ maxWidth: 120, maxHeight: 80 }} />
                              ) : (
                                <span className="small muted">—</span>
                              )}
                            </td>
                            <td className="correct-cell">{(q.correct_answers || []).join(', ')}</td>
                            <td>{q.multiple_correct ? 'Multiple' : 'Single'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button 
                  className="btn btn-success btn-large" 
                  onClick={handleConfirm}
                >
                  ✅ Continue to Setup
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== ASSESSMENT SETUP ====================
function AssessmentSetup({ questions, onAssessmentCreated, onBack }) {
  const [name, setName] = useState('');
  const [initialCoins, setInitialCoins] = useState(1000);
  const [winMultiplier, setWinMultiplier] = useState(2.0);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(10);
  const [studentCode, setStudentCode] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // generate defaults when questions are loaded
    if (questions && questions.length > 0 && !studentCode) {
      const s = generateCode(6);
      const t = `${s}-TCH-${Math.floor(1000 + Math.random() * 9000)}`;
      setStudentCode(s);
      setTeacherCode(t);
    }
  }, [questions, studentCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // basic client-side validation
    const codeRegex = /^[A-Z0-9-]{3,40}$/;
    if (!studentCode || !codeRegex.test(studentCode)) {
      setError('Invalid student code. Use 3-40 letters/numbers/dashes.');
      setLoading(false);
      return;
    }
    if (!teacherCode || !codeRegex.test(teacherCode)) {
      setError('Invalid teacher code. Use 3-40 letters/numbers/dashes.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/assessment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          questions,
          initialCoins,
          winMultiplier,
          // send total duration in seconds
          totalDuration: (totalDurationMinutes || 0) * 60,
          studentCode,
          teacherCode
        })
      });

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (!text) throw new Error('Empty response from server. Is the backend running?');

      let data;
      if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON response from server');
        }
      } else {
        const snippet = text.substring(0, 1000);
        throw new Error('Server returned non-JSON response. Ensure backend is running and endpoint is available.\n' + snippet);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create assessment');
      }

      onAssessmentCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-container">
      <div className="setup-card">
        <h1>⚙️ Assessment Setup</h1>
        <p className="subtitle">Configure your assessment settings</p>

        <div className="questions-loaded">
          ✅ {questions.length} questions loaded
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Student Code (editable)</label>
            <input
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              maxLength={40}
            />
          </div>

          <div className="form-group">
            <label>Teacher Code (editable)</label>
            <input
              type="text"
              value={teacherCode}
              onChange={(e) => setTeacherCode(e.target.value.toUpperCase())}
              maxLength={40}
            />
          </div>
          <div className="form-group">
            <label>Assessment Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Math Quiz Week 5"
              required
            />
          </div>

          <div className="form-group">
            <label>Starting Coins per Student</label>
            <input
              type="number"
              value={initialCoins}
              onChange={(e) => setInitialCoins(parseInt(e.target.value, 10))}
              min="100"
              max="10000"
              step="100"
            />
          </div>

          <div className="form-group">
            <label>Win Multiplier</label>
            <select 
              value={winMultiplier} 
              onChange={(e) => setWinMultiplier(parseFloat(e.target.value))}
            >
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
              <option value={2.5}>2.5x</option>
              <option value={3.0}>3.0x</option>
            </select>
          </div>

          <div className="form-group">
            <label>Total Duration (minutes)</label>
            <input
              type="number"
              value={totalDurationMinutes}
              onChange={(e) => setTotalDurationMinutes(parseInt(e.target.value, 10) || 0)}
              min="1"
              max="1440"
              step="1"
            />
          </div>

          {error && <div className="error-box">❌ {error}</div>}

          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={loading}
          >
            {loading ? '⏳ Creating...' : '🚀 Create Assessment'}
          </button>
        </form>

        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '1rem' }}>
          ← Back to Upload
        </button>
      </div>
    </div>
  );
}

// ==================== CODES DISPLAY ====================
function CodesDisplay({ assessmentData, onDone }) {
  const [copied, setCopied] = useState(null);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="codes-container">
      <div className="codes-card">
        <h1>🎉 Assessment Created!</h1>
        <h2>{assessmentData.assessmentName}</h2>

        <div className="codes-info">
          <div className="code-box student-code">
            <h3>📢 Student Code</h3>
            <p className="code-hint">Share this with your students</p>
            <div className="code-display">
              <span className="code">{assessmentData.studentCode}</span>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(assessmentData.studentCode, 'student')}
              >
                {copied === 'student' ? '✅' : '📋'}
              </button>
            </div>
          </div>

          <div className="code-box teacher-code">
            <h3>🔐 Teacher Code</h3>
            <p className="code-hint">Keep this private - for viewing reports</p>
            <div className="code-display">
              <span className="code small">{assessmentData.teacherCode}</span>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(assessmentData.teacherCode, 'teacher')}
              >
                {copied === 'teacher' ? '✅' : '📋'}
              </button>
            </div>
          </div>
        </div>

        <div className="assessment-summary">
          <p>📝 {assessmentData.questionCount} questions</p>
          <p>💰 {assessmentData.initialCoins} starting coins</p>
          <p>✨ {assessmentData.winMultiplier}x multiplier</p>
          <p>⏱️ {Math.round((assessmentData.totalDuration || assessmentData.timerSeconds || 0) / 60)} minutes total</p>
        </div>

        <button className="btn btn-primary btn-large" onClick={onDone}>
          ✅ Done - Back to Home
        </button>
      </div>
    </div>
  );
}

// ==================== STUDENT JOIN ====================
function StudentJoin({ code, onJoined }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/assessment/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, studentName: name.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join');
      }

      onJoined({
        studentId: data.studentId,
        studentName: name.trim(),
        ...data
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-container">
      <div className="join-card">
        <h1>🎮 Join Assessment</h1>
        <p className="code-badge">Code: {code}</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Enter Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John Smith"
              maxLength={50}
              required
            />
          </div>

          {error && <div className="error-box">❌ {error}</div>}

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? '⏳ Joining...' : '🚀 Start Assessment'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==================== GAME SCREEN ====================
function GameScreen({ code, studentId, studentName, sessionInfo, onComplete, assessmentData }) {
  const [questionData, setQuestionData] = useState(null);
  const [bets, setBets] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentCoins, setCurrentCoins] = useState(sessionInfo.initialCoins);
  const [remainingTime, setRemainingTime] = useState(sessionInfo.remainingTime || sessionInfo.totalDuration || sessionInfo.timerSeconds);
  const [lastActionTime, setLastActionTime] = useState(Date.now());
  const [flash, setFlash] = useState(false);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setBets({ A: 0, B: 0, C: 0, D: 0 });

    try {
      const response = await fetch(`${API_URL}/assessment/${code}/student/${studentId}/question`);
      const data = await response.json();

    // Debug: log loaded question payload (helps detect empty option text)
    console.debug('Loaded question payload:', data);

      if (data.complete) {
        // Show result pane with an error message instead of navigating away
        const msg = data.reason === 'no_coins' ? 'You have no coins left.' : (data.reason === 'time_up' ? 'Time is up.' : 'Assessment complete');
        setResult({ isLastQuestion: true, errorMessage: msg, newTotal: data.currentCoins || 0, correctAnswers: [] });
        setQuestionData(null);
        setCurrentCoins(data.currentCoins || 0);
        return;
      }

      setQuestionData(data);
      setCurrentCoins(data.currentCoins);
      
      // update global remaining time from server
      if (typeof data.remainingTime === 'number') setRemainingTime(data.remainingTime);
      setLastActionTime(Date.now());
      // flash to indicate new question loaded
      setFlash(true);
      setTimeout(() => {
        setFlash(false);
        // keep the previous result visible until a new result arrives from submission
      }, 700);
    } catch (err) {
      console.error('Failed to load question:', err);
    } finally {
      setLoading(false);
      // result clearing is handled after flash completes above
    }
  }, [code, studentId, onComplete]);

  useEffect(() => { loadQuestion(); }, [loadQuestion]);

  useEffect(() => {
    if (loading) return;

    if (remainingTime <= 0) {
      handleSubmit(true);
      return;
    }

    const timer = setInterval(() => setRemainingTime(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [remainingTime, questionData, loading]);

  const totalBet = Object.values(bets).reduce((s, v) => s + (v || 0), 0);
  const remainingCoins = currentCoins - totalBet;

  

  const handleBetChange = (option, amount) => {
    // Allow empty string while editing in child component
    if (amount === '' || amount === null) {
      setBets(prev => ({ ...prev, [option]: '' }));
      return;
    }

    const amtNum = Number(amount || 0);
    const maxForOption = currentCoins - totalBet + Number(bets[option] || 0);
    const newAmount = Math.max(0, Math.min(amtNum, maxForOption));
    setBets({ ...bets, [option]: newAmount });
  };

  const handleQuickBet = (option, amount) => {
    const maxBet = remainingCoins + bets[option];
    const newBet = amount === 'all' ? maxBet : Math.min(bets[option] + amount, maxBet);
    setBets({ ...bets, [option]: newBet });
  };

  const handleSkip = () => handleSubmit(false, true);

  const handleSubmit = async (isTimeout = false, isSkip = false) => {
    if (submitting) return;
    setSubmitting(true);

    const timeTaken = lastActionTime ? Math.round((Date.now() - lastActionTime) / 1000) : 0;
    const noAnswer = isTimeout && totalBet === 0;

    try {
      // sanitize bets: convert empty strings to 0 and ensure numbers
      const sanitizedBets = Object.fromEntries(Object.entries(bets || {}).map(([k, v]) => [k, Number(v) || 0]));
      const payloadBets = isSkip || noAnswer ? {} : sanitizedBets;

      const response = await fetch(`${API_URL}/assessment/${code}/student/${studentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bets: payloadBets, skipped: isSkip, noAnswer, timeTaken })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit');

      // Set result and current coins
      setResult(data.results);
      setCurrentCoins(data.results.newTotal);

      // If student has no coins left, mark error on results pane (do not auto-navigate)
      if (typeof data.results.newTotal === 'number' && data.results.newTotal <= 0) {
        setResult(prev => ({ ...(data.results || prev), errorMessage: 'You have no coins left.', isLastQuestion: true }));
        return;
      }

      if (!data.results.isLastQuestion) {
        // preload next question while result remains visible
        loadQuestion();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !result) return <div className="loading">Loading question...</div>;
  if (!questionData && !result) return <div className="loading">No question available</div>;

  const skipPenalty = Math.round((currentCoins * 0.05) / 10) * 10;

  // disable inputs only while submitting, loading, or when the result is the final one
  const inputsDisabled = submitting || loading || (result && result.isLastQuestion);

  return (
    <div className="game-container">
      <div className="game-header">
        <div className="player-info"><span className="name">{studentName}</span></div>
        <div className="coins-display">💰 {currentCoins}</div>
        <div className="progress">Q{questionData.questionNumber}/{questionData.totalQuestions}</div>
      </div>

      <div className="game-layout">
        {/* Left: Question column (hide entirely if final result) */}
        {!(result && result.isLastQuestion) && (
          <div className={`question-column ${flash ? 'flash' : ''}`}>
            <div className="question-card">
              {loading && result && (
                <div className="loading-overlay">Loading next question...</div>
              )}
              <div className={`timer ${remainingTime <= 10 ? 'warning' : ''} ${remainingTime <= 5 ? 'danger' : ''}`}>⏱️ {remainingTime}s</div>
              {questionData.question.question_image && (
                <div className="question-image-wrapper">
                  <img src={questionData.question.question_image} alt="question" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', marginBottom: 10 }} />
                </div>
              )}
              <h2 className="question-text">{questionData.question.text}</h2>
              {questionData.question.multipleCorrect && <div className="multi-hint">💡 Multiple correct answers possible!</div>}

              {/* BettingQuestion component replaces per-option inputs and quick-bets */}
              <div className="options-list">
                {/* render the new component */}
                <BettingQuestion
                  question={questionData.question}
                  bets={bets}
                  remainingCoins={remainingCoins}
                  currentCoins={currentCoins}
                  winMultiplier={(assessmentData && assessmentData.winMultiplier) || 2}
                  submitting={submitting}
                  inputsDisabled={inputsDisabled}
                  onBetChange={handleBetChange}
                  onBetsUpdate={(nb) => setBets(nb)}
                />
              </div>
              <div className="action-buttons" style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-large" onClick={() => handleSubmit(false, false)} disabled={submitting || inputsDisabled}>
                  {submitting ? '⏳ Submitting...' : '✅ Submit Bets'}
                </button>
                <button className="btn btn-skip" onClick={() => handleSkip()} disabled={submitting || inputsDisabled} style={{ marginTop: 8 }}>
                  ⏭️ Skip Question (-{skipPenalty} coins)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right: Result pane (keeps question visible) */}
        <div className="result-column">
          {result && (
            <div className="result-card">
              {result.errorMessage && (
                <div className="error-box">❌ {result.errorMessage}</div>
              )}
              {result.skipped ? (
                <div>
                  <h2 className="skipped">⏭️ Question Skipped</h2>
                  <div className="penalty-info">Penalty: -{result.penalty} coins</div>
                </div>
              ) : result.noAnswer ? (
                <div>
                  <h2 className="timeout">⏰ Time's Up!</h2>
                  <div className="penalty-info">No answer submitted - Penalty: -{result.penalty} coins</div>
                </div>
              ) : (
                <div>
                  <h2 className={result.netChange >= 0 ? 'win' : 'loss'}>{result.netChange >= 0 ? '🎉 You Won!' : '😢 Better Luck Next Time'}</h2>
                  <div className="bet-results">
                    {Object.entries(result.betResults || {}).map(([option, data]) => (
                      <div key={option} className={`bet-result ${data.correct ? 'correct' : 'wrong'}`}>
                        <span>Option {option}: {data.amount} coins</span>
                        <span>{data.correct ? `+${data.winnings}` : data.winnings}</span>
                      </div>
                    ))}
                  </div>
                  <div className="result-summary">
                    <div className="won">Won: +{result.coinsWon}</div>
                    <div className="lost">Lost: -{result.coinsLost}</div>
                    <div className={`net ${result.netChange >= 0 ? 'positive' : 'negative'}`}>Net: {result.netChange >= 0 ? '+' : ''}{result.netChange}</div>
                  </div>
                </div>
              )}

              <div className="correct-answers">Correct Answer(s): {result.correctAnswers.join(', ')}</div>
              <div className="new-total">💰 New Total: {result.newTotal} coins</div>
              <button className="btn btn-primary btn-large" onClick={result.isLastQuestion ? onComplete : () => setResult(null)}>
                {result.isLastQuestion ? '🏆 View Results' : '➡️ Hide Result'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== STUDENT REPORT ====================
function StudentReport({ code, studentId, onHome }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch(
          `${API_URL}/assessment/${code}/student/${studentId}/report`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load report');
        }

        setReport(data.report);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [code, studentId]);

  const downloadPDF = () => {
    window.open(`${API_URL}/assessment/${code}/student/${studentId}/pdf`, '_blank');
  };

  if (loading) return <div className="loading">Loading your report...</div>;
  if (error) return <div className="error-screen">❌ {error}</div>;
  if (!report) return <div className="loading">No report available</div>;

  return (
    <div className="report-container">
      <div className="report-card student-report">
        <div className="persona-section">
          <div className="persona-emoji">{report.persona.emoji}</div>
          <h1 className="persona-name">{report.persona.name}</h1>
          <p className="persona-message">"{report.persona.message}"</p>
        </div>

        <div className="report-header">
          <h2>{report.studentName}</h2>
          <p>{report.assessmentName}</p>
        </div>

        <div className="stats-grid">
          <div className="stat-box highlight">
            <span className="stat-value">💰 {report.finalCoins}</span>
            <span className="stat-label">Final Coins</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">#{report.rank}</span>
            <span className="stat-label">Rank</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{report.knowledgeScore}</span>
            <span className="stat-label">Knowledge Score</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{report.accuracy}%</span>
            <span className="stat-label">Accuracy</span>
          </div>
        </div>

        <div className="breakdown-section">
          <h3>📊 Performance Breakdown</h3>
          <div className="breakdown-bars">
            <div className="breakdown-item">
              <span className="label">Correct</span>
              <div className="bar-wrapper">
                <div 
                  className="bar correct" 
                  style={{ width: `${(report.correct / report.totalQuestions) * 100}%` }}
                ></div>
              </div>
              <span className="value">{report.correct}</span>
            </div>
            <div className="breakdown-item">
              <span className="label">Wrong</span>
              <div className="bar-wrapper">
                <div 
                  className="bar wrong" 
                  style={{ width: `${(report.wrong / report.totalQuestions) * 100}%` }}
                ></div>
              </div>
              <span className="value">{report.wrong}</span>
            </div>
            <div className="breakdown-item">
              <span className="label">Skipped</span>
              <div className="bar-wrapper">
                <div 
                  className="bar skipped" 
                  style={{ width: `${((report.skipped + report.noAnswer) / report.totalQuestions) * 100}%` }}
                ></div>
              </div>
              <span className="value">{report.skipped + report.noAnswer}</span>
            </div>
          </div>
        </div>

        <div className="confidence-section">
          <h3>🎯 Confidence Analysis</h3>
          <p>Average Confidence: <strong>{report.avgConfidence}%</strong></p>
          <p>Average Response Time: <strong>{report.avgTime}s</strong></p>
        </div>

        {report.wrongQuestions.length > 0 && (
          <div className="review-section">
            <h3>📚 Topics to Review</h3>
            <ul>
              {report.wrongQuestions.slice(0, 5).map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="report-actions">
          <button className="btn btn-primary" onClick={downloadPDF}>
            📄 Download PDF Report
          </button>
          <button className="btn btn-secondary" onClick={onHome}>
            🏠 Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== TEACHER REPORT ====================
function TeacherReport({ code, onHome }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch(`${API_URL}/assessment/${code}/teacher/report`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load report');
        }

        setReport(data.report);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [code]);

  const downloadPDF = () => {
    window.open(`${API_URL}/assessment/${code}/teacher/pdf`, '_blank');
  };

  if (loading) return <div className="loading">Loading teacher report...</div>;
  if (error) return <div className="error-screen">❌ {error}</div>;
  if (!report) return <div className="loading">No report available</div>;

  return (
    <div className="report-container">
      <div className="report-card teacher-report">
        <div className="report-header">
          <h1>📊 Teacher Report</h1>
          <h2>{report.assessmentName}</h2>
          <p>Date: {new Date(report.date).toLocaleDateString()}</p>
        </div>

        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            Students
          </button>
          <button 
            className={`tab ${activeTab === 'questions' ? 'active' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            Questions
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-value">{report.classStats.totalStudents}</span>
                <span className="stat-label">Total Students</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{report.classStats.completedStudents}</span>
                <span className="stat-label">Completed</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{report.classStats.avgAccuracy}%</span>
                <span className="stat-label">Avg Accuracy</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{report.classStats.avgKnowledgeScore}</span>
                <span className="stat-label">Avg Knowledge</span>
              </div>
            </div>

            <div className="settings-summary">
              <h3>⚙️ Assessment Settings</h3>
              <p>Initial Coins: {report.settings.initialCoins}</p>
              <p>Win Multiplier: {report.settings.winMultiplier}x</p>
              <p>Timer: {Math.round((report.settings.totalDuration || report.settings.timerSeconds || 0) / 60)} minutes</p>
            </div>

            {report.studentsNeedingHelp.length > 0 && (
              <div className="alert-section">
                <h3>⚠️ Students Needing Attention</h3>
                <ul>
                  {report.studentsNeedingHelp.map((name, idx) => (
                    <li key={idx}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'students' && (
          <div className="tab-content">
            <h3>🏆 Leaderboard</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Coins</th>
                  <th>Accuracy</th>
                  <th>Knowledge</th>
                  <th>Persona</th>
                </tr>
              </thead>
              <tbody>
                {report.studentStats.map((student, idx) => (
                  <tr key={student.id} className={!student.completed ? 'incomplete' : ''}>
                    <td>#{idx + 1}</td>
                    <td>{student.name} {!student.completed && '(In Progress)'}</td>
                    <td>💰 {student.coins}</td>
                    <td>{student.accuracy}%</td>
                    <td>{student.knowledgeScore}</td>
                    <td>{student.persona.emoji} {student.persona.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="tab-content">
            <h3>📝 Question Analysis</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {report.questionAnalysis.map((q) => (
                  <tr key={q.questionNumber} className={q.misconceptionAlert ? 'alert-row' : ''}>
                    <td>{q.questionNumber}</td>
                    <td className="question-cell">{q.questionText}</td>
                    <td>{q.correctAnswers.join(', ')}</td>
                    <td>{q.accuracy}%</td>
                    <td>{q.misconceptionAlert ? '⚠️ Misconception' : '✅'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="report-actions">
          <button className="btn btn-primary" onClick={downloadPDF}>
            📄 Download PDF Report
          </button>
          <button className="btn btn-secondary" onClick={onHome}>
            🏠 Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
function App() {
  const [screen, setScreen] = useState('entry');
  const [questions, setQuestions] = useState([]);
  const [assessmentData, setAssessmentData] = useState(null);
  const [studentCode, setStudentCode] = useState(null);
  const [teacherCode, setTeacherCode] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const publicFooterPath = (process.env.PUBLIC_URL || '') + '/powered_by.png';
  const [footerLogoSrc, setFooterLogoSrc] = useState(publicFooterPath);

  const handleHome = () => {
    setScreen('entry');
    setQuestions([]);
    setAssessmentData(null);
    setStudentCode(null);
    setTeacherCode(null);
    setStudentId(null);
    setStudentName(null);
    setSessionInfo(null);
  };

  return (
    <div className="app">
      <div className="content">
        {screen === 'entry' && (
          <EntryScreen
            onJoinAssessment={(code) => {
              setStudentCode(code);
              setScreen('studentJoin');
            }}
            onCreateAssessment={() => setScreen('upload')}
            onTeacherReport={(code) => {
              setTeacherCode(code);
              setScreen('teacherReport');
            }}
          />
        )}

        {screen === 'upload' && (
          <QuestionUpload
            onQuestionsValidated={(q) => {
              setQuestions(q);
              setScreen('setup');
            }}
          />
        )}

        {screen === 'setup' && (
          <AssessmentSetup
            questions={questions}
            onAssessmentCreated={(data) => {
              setAssessmentData(data);
              setScreen('codes');
            }}
            onBack={() => setScreen('upload')}
          />
        )}

        {screen === 'codes' && (
          <CodesDisplay
            assessmentData={assessmentData}
            onDone={handleHome}
          />
        )}

        {screen === 'studentJoin' && (
          <StudentJoin
            code={studentCode}
            onJoined={(data) => {
              setStudentId(data.studentId);
              setStudentName(data.studentName);
              setSessionInfo(data);
              setScreen('game');
            }}
          />
        )}

        {screen === 'game' && (
          <GameScreen
            code={studentCode}
            studentId={studentId}
            studentName={studentName}
            sessionInfo={sessionInfo}
            assessmentData={assessmentData}
            onComplete={() => setScreen('studentReport')}
          />
        )}

        {screen === 'studentReport' && (
          <StudentReport
            code={studentCode}
            studentId={studentId}
            onHome={handleHome}
          />
        )}

        {screen === 'teacherReport' && (
          <TeacherReport
            code={teacherCode}
            onHome={handleHome}
          />
        )}
      </div>

      {/* Global logo badge — use public footer image so both footers match */}
      {screen !== 'entry' && (
        <div className="powered-by">
          <img
            src={footerLogoSrc}
            alt="Powered by VIJAI"
            onError={() => {
              if (footerLogoSrc !== vijaiLogo) setFooterLogoSrc(vijaiLogo);
            }}
          />
        </div>
      )}

      {/* Footer logo on the entry (first) screen */}
      {screen === 'entry' && (
        <footer className="app-footer">
          <img
            src={footerLogoSrc}
            alt="Powered by VIJAI"
            onError={() => {
              if (footerLogoSrc !== vijaiLogo) setFooterLogoSrc(vijaiLogo);
            }}
          />
        </footer>
      )}
    </div>
  );
}

export default App;
