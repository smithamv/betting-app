import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import BettingQuestion from './components/BettingQuestion';

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
        <h1>🎲 Betting Assessment</h1>
        <p className="subtitle">Test your knowledge, bet on your confidence!</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Enter Assessment Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., MATH5A"
              maxLength={20}
              autoFocus
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

  const downloadTemplate = () => {
    window.open(`${API_URL}/template`, '_blank');
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setPreview(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) {
      setError('Please select a CSV file first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_URL}/questions/preview`, {
        method: 'POST',
        body: formData
      });

      const text = await response.text();
      if (!text) {
        throw new Error('Server returned empty response. Make sure backend is running.');
      }

      const data = JSON.parse(text);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse CSV');
      }

      setPreview(data);
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
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".csv"
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
                        <th>Correct</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.parsedQuestions.map((q, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className="question-cell">{q.question}</td>
                          <td className="correct-cell">{q.correct_answers.join(', ')}</td>
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

      const data = await response.json();

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
              onChange={(e) => setInitialCoins(parseInt(e.target.value))}
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
              <option value="1.5">1.5x</option>
              <option value="2.0">2.0x</option>
              <option value="2.5">2.5x</option>
              <option value="3.0">3.0x</option>
            </select>
          </div>

          <div className="form-group">
            <label>Total Duration (minutes)</label>
            <input
              type="number"
              value={totalDurationMinutes}
              onChange={(e) => setTotalDurationMinutes(parseInt(e.target.value) || 0)}
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
              autoFocus
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
        onComplete();
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
    const newAmount = Math.max(0, Math.min(amount, currentCoins - totalBet + bets[option]));
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
      const response = await fetch(`${API_URL}/assessment/${code}/student/${studentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bets: isSkip || noAnswer ? {} : bets, skipped: isSkip, noAnswer, timeTaken })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit');

      setResult(data.results);
      setCurrentCoins(data.results.newTotal);

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
              <h2 className="question-text">{questionData.question.text}</h2>
              {questionData.question.multipleCorrect && <div className="multi-hint">💡 Multiple correct answers possible!</div>}

              {/* BettingQuestion component replaces per-option inputs and quick-bets */}
              <div className="options-list">
                {/* render the new component */}
                <BettingQuestion
                  question={questionData.question}
                  remainingCoins={remainingCoins}
                  winMultiplier={(assessmentData && assessmentData.winMultiplier) || 2}
                  submitting={submitting}
                  inputsDisabled={inputsDisabled}
                  onPlaceBet={async (optionId, amount) => {
                    // construct bets object for a single-option bet and submit directly
                    const betsObj = { A:0, B:0, C:0, D:0 };
                    betsObj[optionId] = amount;
                    // submit using the same submit flow but with override
                    if (submitting) return;
                    setSubmitting(true);
                    try {
                      const timeTaken = lastActionTime ? Math.round((Date.now() - lastActionTime) / 1000) : 0;
                      const response = await fetch(`${API_URL}/assessment/${code}/student/${studentId}/submit`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bets: betsObj, skipped: false, noAnswer: false, timeTaken })
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error || 'Failed to submit');
                      setResult(data.results);
                      setCurrentCoins(data.results.newTotal);
                      if (!data.results.isLastQuestion) {
                        loadQuestion();
                      }
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  onSkip={() => handleSkip()}
                />
              </div>
            </div>
          </div>
        )}

        {/* Right: Result pane (keeps question visible) */}
        <div className="result-column">
          {result && (
            <div className="result-card">
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
  );
}

export default App;
