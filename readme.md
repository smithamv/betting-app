# 🎲 Betting Assessment v3.0

A gamified classroom assessment where students bet virtual coins on their answers. Features fun personas, detailed reports, and timed questions!

## 🆕 New Features

- **Timer per question** - Configurable countdown with auto-submit
- **Skip option** - Students can skip with 5% penalty
- **No answer penalty** - Same penalty if timer runs out
- **Student Personas** - Fun feedback based on performance:
  - 🎓 Campus Legend (High knowledge + High confidence)
  - 🥸 Undercover Genius (High knowledge + Low confidence)
  - 📸 Main Character Syndrome (Low knowledge + High confidence)
  - 📺 Netflix & Cram (Low knowledge + Low confidence)
- **Detailed Reports** - For both students and teachers
- **PDF Downloads** - Export reports as PDF
- **Secret Teacher Code** - Access reports without login

---

## 🚀 Quick Start

### Windows
```
Double-click START.bat
```

### Mac/Linux
```bash
chmod +x START.sh
./START.sh
```

### Manual
```bash
# Terminal 1 - Backend
cd backend && npm install && npm start

# Terminal 2 - Frontend (Mac/Linux)
cd frontend && npm install && PORT=3002 npm start

# Terminal 2 - Frontend (Windows)
cd frontend && npm install && npm start
```

**URLs:**
- Frontend: http://localhost:3002
- Backend: http://localhost:3001

---

## 📋 How It Works

### Teacher Flow

1. Open app → Click "Create New Assessment"
2. Download CSV template → Fill with your questions
3. Upload CSV → Preview and validate
4. Configure: Name, Starting Coins, Multiplier, Timer
5. Get two codes:
   - **Student Code** (e.g., `MATH5A`) - Share with class
   - **Teacher Code** (e.g., `MATH5A-TCH-7392`) - Keep private
6. Later: Enter teacher code to view reports

### Student Flow

1. Open app → Enter student code
2. Enter your name → Start assessment
3. For each question:
   - See question + countdown timer
   - Place bets on answer options
   - Click "Lock In Bets" OR "Skip"
   - If timer runs out → auto-submit
4. After all questions → See personal report with persona

---

## 📝 CSV Format

```csv
question,option_a,option_b,option_c,option_d,correct_answer,multiple_correct
"What is 2 + 2?","3","4","5","6","B","no"
"Which are prime?","2","4","7","9","A,C","yes"
```

| Column | Description |
|--------|-------------|
| question | Question text |
| option_a to option_d | Four answer choices |
| correct_answer | Letter(s): A, B, C, D or combinations like "A,C" |
| multiple_correct | "yes" or "no" |

---

## 🎮 Game Mechanics

### Betting
- Bet coins on one or multiple options
- Correct bet: Coins × Win Multiplier
- Wrong bet: Lose the coins

### Skip
- Click "Skip" to skip a question
- Penalty: 5% of current coins (rounded to nearest 10)
- Example: 1000 coins → 50 coin penalty

### Timer
- Countdown per question (configurable)
- Auto-submits current bets when time runs out
- If no bets placed → Same penalty as skip

### Knowledge Score
- High confidence correct: +3 points
- Low confidence correct: +1 point
- High confidence wrong: -2 points
- Low confidence wrong: -1 point
- Skip: 0 points

---

## 📊 Reports

### Student Report
- Fun persona with emoji and message
- Final coins and rank
- Knowledge score
- Accuracy percentage
- Confidence analysis
- Topics to review

### Teacher Report
- Class overview and averages
- Student leaderboard with personas
- Question analysis
- Misconception alerts (many students confident but wrong)
- Students needing help

---

## 🎭 Personas

| Knowledge | Confidence | Persona |
|-----------|------------|---------|
| High (≥50%) | High (≥40%) | 🎓 Campus Legend |
| High (≥50%) | Low (<40%) | 🥸 Undercover Genius |
| Low (<50%) | High (≥40%) | 📸 Main Character Syndrome |
| Low (<50%) | Low (<40%) | 📺 Netflix & Cram |

---

## 🛠️ Technical Details

### Backend (Port 3001)
- Node.js + Express
- In-memory storage
- PDF generation with PDFKit

### Frontend (Port 3002)
- React 18
- Single-page application

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/template | GET | Download CSV template |
| /api/questions/preview | POST | Validate CSV |
| /api/assessment/create | POST | Create assessment |
| /api/assessment/join | POST | Student joins |
| /api/assessment/check/:code | GET | Check code type |
| /api/assessment/:code/student/:id/question | GET | Get question |
| /api/assessment/:code/student/:id/submit | POST | Submit answer |
| /api/assessment/:code/student/:id/report | GET | Student report |
| /api/assessment/:code/teacher/report | GET | Teacher report |
| /api/assessment/:code/student/:id/pdf | GET | Student PDF |
| /api/assessment/:code/teacher/pdf | GET | Teacher PDF |

---

## ❓ Troubleshooting

### Backend won't start
- Check if port 3001 is in use
- Run `npm install` in backend folder

### CSV upload fails
- Ensure file is .csv format
- Check column headers match exactly
- No empty required fields

### Timer not working
- Refresh the page
- Check browser console for errors

---

Built with ❤️ for gamified learning
