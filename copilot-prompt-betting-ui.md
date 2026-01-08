# GitHub Copilot Prompt: Redesign Betting UI with Confidence Slider

## Overview
Redesign the betting/confidence UI in the Betting Assessment app to use a confidence slider instead of manual coin input. The new design should have a casino theme with a specific 4-color palette.

---

## Color Palette (STRICT - only use these 4 colors)

```javascript
const colors = {
  black: '#0a0a0a',    // App background
  gold: '#d4af37',     // Primary accent (buttons, highlights, selected states)
  white: '#ffffff',    // Text
  red: '#dc2626'       // Loss indicators, warnings, slider "wild guess" end
};
```

---

## Current State
The current betting UI in `BettingQuestion.js` (or similar component) uses:
- Manual coin input fields for each answer option
- Quick bet buttons (+100, +500, All In)
- Separate bet amounts per option

## New Design Requirements

### 1. Two-Step Flow
- **Step 1:** Student selects ONE answer (A, B, C, or D)
- **Step 2:** After selection, a confidence slider panel appears below

### 2. Confidence Slider
Replace all coin input fields with a single slider:

```jsx
// Slider properties
min={10}
max={100}
defaultValue={50}

// Bet calculation
const betAmount = Math.round((confidence / 100) * totalCoins);
const potentialWin = betAmount * 2; // or use multiplier from settings
```

**Slider Labels:**
- Left end: "Wild Guess" (in red color)
- Right end: "Absolutely Sure" (in gold color)

**Slider Styling:**
- Track gradient: `linear-gradient(90deg, ${colors.red} 0%, ${colors.gold} 100%)`
- Thumb: Gold circle with white border, box-shadow

### 3. Dynamic Confidence Label
Display a label that changes based on slider position:

```javascript
const getConfidenceLabel = () => {
  if (confidence < 30) return 'Wild Guess';
  if (confidence < 60) return 'Feeling Lucky';
  if (confidence < 85) return 'Confident';
  return 'Absolutely Sure';
};
```

### 4. Bet Summary Display
Show three values in a row:
| Bet | Win | Lose |
|-----|-----|------|
| {betAmount} (gold) | +{potentialWin} (gold) | -{betAmount} (red) |

### 5. Remove These Elements
- ❌ Quick bet buttons (+100, +500, etc.)
- ❌ Percentage buttons (25%, 50%, 75%, ALL IN)
- ❌ Individual bet input fields per option
- ❌ Multiple color gradients (purple, green, etc.)

---

## Component Structure

```
<GameScreen> or <BettingQuestion>
├── <Header>
│   ├── Coin Balance (gold chip icon + amount)
│   ├── Timer
│   └── Question Counter ("Hand 3 / 10")
│
├── <QuestionCard>
│   ├── Subject tag
│   └── Question text
│
├── <AnswerOptions> (2x2 grid)
│   └── <OptionButton> x 4
│       ├── Letter badge (A, B, C, D)
│       └── Answer text
│
├── <ConfidencePanel> (only visible when answer selected)
│   ├── Header: "Place Your Bet" + dynamic label
│   ├── <ConfidenceSlider>
│   │   ├── Range input (styled)
│   │   └── Labels: "Wild Guess" ←→ "Absolutely Sure"
│   ├── <BetSummary>
│   │   ├── Bet amount
│   │   ├── Potential win (gold)
│   │   └── Potential loss (red)
│   └── <SubmitButton> "Lock In Bet"
│
└── <PlaceholderPrompt> (when no answer selected)
    └── "Select your answer to place a bet"
```

---

## CSS Styling Guidelines

### Background & Containers
```css
/* App background */
background: #0a0a0a;

/* Card/Panel backgrounds */
background: rgba(255, 255, 255, 0.03);
border: 1px solid rgba(212, 175, 55, 0.3); /* gold with opacity */
border-radius: 12px or 16px;
```

### Answer Options
```css
/* Unselected */
background: rgba(255, 255, 255, 0.03);
border: 2px solid rgba(212, 175, 55, 0.3);
color: #ffffff;

/* Selected */
background: #d4af37;
border: 2px solid #d4af37;
color: #0a0a0a;
box-shadow: 0 6px 25px rgba(212, 175, 55, 0.25);
```

### Slider Styling
```css
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, #dc2626 0%, #d4af37 100%);
  outline: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #d4af37;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.5);
  border: 3px solid #ffffff;
}
```

### Submit Button
```css
background: #d4af37;
color: #0a0a0a;
border: none;
border-radius: 10px;
padding: 18px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 1px;
box-shadow: 0 6px 25px rgba(212, 175, 55, 0.3);
```

---

## Casino Theme Elements

Add these decorative touches:

1. **Card suit symbols** as subtle decorations:
   ```jsx
   <span style={{ color: colors.gold }}>♠</span>
   <span style={{ color: colors.red }}>♦</span>
   <span style={{ color: colors.gold }}>♣</span>
   <span style={{ color: colors.red }}>♥</span>
   ```

2. **Coin chip** for balance display:
   - Gold circular badge with "$" symbol
   - White border
   - Subtle float animation

3. **Terminology:**
   - "Your Stack" instead of "Balance"
   - "Hand 3 / 10" instead of "Question 3 / 10"
   - "Lock In Bet" instead of "Submit"
   - "Deal Again" instead of "Next Question"

---

## State Management

```javascript
const [selectedAnswer, setSelectedAnswer] = useState(null);
const [confidence, setConfidence] = useState(50);
const [betPlaced, setBetPlaced] = useState(false);

// Derived values
const betAmount = Math.round((confidence / 100) * totalCoins);
const potentialWin = betAmount * multiplier;

// Reset when moving to next question
const resetForNextQuestion = () => {
  setSelectedAnswer(null);
  setConfidence(50);
  setBetPlaced(false);
};
```

---

## Animation Suggestions

```css
/* Confidence panel slide in */
@keyframes fadeSlide {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Coin chip float */
@keyframes chipFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* Timer pulse when low */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Files to Modify

1. **`src/components/BettingQuestion.js`** (or `GameScreen.js`)
   - Replace bet input logic with confidence slider
   - Update state management
   - Add two-step flow

2. **`src/App.css`** (or component-specific CSS)
   - Update color variables to new palette
   - Add slider styles
   - Update button styles

3. **Any result/outcome components**
   - Update to use gold for wins, red for losses
   - Keep black background theme

---

## Testing Checklist

- [ ] Selecting an answer shows the confidence panel
- [ ] Slider moves smoothly from 10-100%
- [ ] Bet amount updates in real-time as slider moves
- [ ] "Wild Guess" shows at low confidence, "Absolutely Sure" at high
- [ ] Submit button is disabled until answer is selected
- [ ] Timer turns red and pulses when under 10 seconds
- [ ] Only 4 colors used throughout (black, gold, white, red)
- [ ] Works on mobile (slider is touch-friendly)

---

## Example Implementation

Here's a reference implementation of the confidence slider section:

```jsx
{selectedAnswer && !betPlaced && (
  <div className="confidence-panel">
    <div className="confidence-header">
      <span>Place Your Bet</span>
      <span className="confidence-label">{getConfidenceLabel()}</span>
    </div>
    
    <div className="slider-container">
      <input
        type="range"
        min="10"
        max="100"
        value={confidence}
        onChange={(e) => setConfidence(parseInt(e.target.value))}
        className="confidence-slider"
      />
      <div className="slider-labels">
        <span className="label-low">Wild Guess</span>
        <span className="label-high">Absolutely Sure</span>
      </div>
    </div>
    
    <div className="bet-summary">
      <div className="summary-item">
        <span className="label">Bet</span>
        <span className="value gold">{betAmount}</span>
      </div>
      <div className="summary-item">
        <span className="label">Win</span>
        <span className="value gold">+{potentialWin}</span>
      </div>
      <div className="summary-item">
        <span className="label">Lose</span>
        <span className="value red">-{betAmount}</span>
      </div>
    </div>
    
    <button className="submit-btn" onClick={handlePlaceBet}>
      Lock In Bet
    </button>
  </div>
)}
```

---

## Notes for Copilot

- Keep existing API integration intact
- Preserve timer functionality
- Maintain session/student state management
- The confidence percentage should map directly to bet amount (e.g., 50% confidence = bet 50% of available coins)
- Ensure the persona calculation logic still works (it uses bet percentage to determine confidence level for the 4 personas)
