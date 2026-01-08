import React, { useState, useEffect } from 'react';
import './BettingQuestion.css';

export default function BettingQuestion({
  question,
  remainingCoins = 0,
  winMultiplier = 2,
  submitting = false,
  inputsDisabled = false,
  onPlaceBet,
  onSkip
}) {
  const [selected, setSelected] = useState(null);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    setSelected(null);
    const start = Math.min(Math.max(Math.round((remainingCoins || 0) / 2), 0), remainingCoins || 0);
    setConfidence(start);
  }, [question, remainingCoins]);

  const percent = remainingCoins > 0 ? Math.round((confidence / remainingCoins) * 100) : 0;
  const getConfidenceLabel = () => {
    if (percent < 30) return 'Wild Guess';
    if (percent < 60) return 'Feeling Lucky';
    if (percent < 85) return 'Confident';
    return 'Absolutely Sure';
  };

  const betAmount = Math.round(confidence);
  const potentialWin = Math.round(betAmount * (winMultiplier || 2));

  return (
    <div className="betting-question">
      <div className="options-grid">
        {question.options.map(opt => (
          <button
            key={opt.id}
            className={`option-btn ${selected === opt.id ? 'selected' : ''}`}
            onClick={() => setSelected(opt.id)}
            disabled={inputsDisabled}
          >
            <div className="letter">{opt.id}</div>
            <div className="opt-text">{opt.text && opt.text.trim() ? opt.text : `Option ${opt.id}`}</div>
          </button>
        ))}
      </div>

      {!selected ? (
        <div className="placeholder">Select your answer to place a bet</div>
      ) : (
        <div className="confidence-panel" role="region">
          <div className="confidence-header">
            <span className="place-title">Place Your Bet</span>
            <span className="confidence-label">{getConfidenceLabel()}</span>
          </div>

          <div className="slider-container">
            <input
              className="confidence-slider"
              type="range"
              min={0}
              max={remainingCoins}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={remainingCoins}
            />
            <div className="slider-labels">
              <span className="label-low">Wild Guess</span>
              <span className="label-high">Absolutely Sure</span>
            </div>
          </div>

          <div className="bet-summary">
            <div className="summary-item"><div className="label">Bet</div><div className="value gold">{betAmount}</div></div>
            <div className="summary-item"><div className="label">Win</div><div className="value gold">+{potentialWin}</div></div>
            <div className="summary-item"><div className="label">Lose</div><div className="value red">-{betAmount}</div></div>
          </div>

          <div className="confidence-actions">
            <button className="submit-btn" onClick={() => onPlaceBet(selected, betAmount)} disabled={submitting || inputsDisabled || betAmount <= 0}>
              {submitting ? '⏳ Locking...' : 'Lock In Bet'}
            </button>
            <button className="btn-skip-small" onClick={() => onSkip()} disabled={inputsDisabled || submitting}>Deal Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
