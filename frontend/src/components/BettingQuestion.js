import React, { useState, useEffect } from 'react';
import './BettingQuestion.css';

export default function BettingQuestion({
  question,
  bets = {},
  remainingCoins = 0,
  winMultiplier = 2,
  submitting = false,
  inputsDisabled = false,
  onBetChange
}) {
  // Helper to compute payout and net
  const payoutFor = (amt) => Math.floor((Number(amt) || 0) * (winMultiplier || 2));

  const handleQuick = (optId, percent) => {
    const current = Number(bets[optId] || 0);
    const maxBet = Math.max(0, remainingCoins + current);
    const val = Math.floor((percent / 100) * maxBet);
    const clamped = Math.max(0, Math.min(val, maxBet));
    if (onBetChange) onBetChange(optId, clamped);
  };

  const handleAll = (optId) => {
    const current = Number(bets[optId] || 0);
    const maxBet = Math.max(0, remainingCoins + current);
    if (onBetChange) onBetChange(optId, maxBet);
  };

  const handleInput = (optId, raw) => {
    const current = Number(bets[optId] || 0);
    const maxBet = Math.max(0, remainingCoins + current);
    // Allow empty string while editing so user can delete the default '0'
    if (raw === '' || raw === null) {
      if (onBetChange) onBetChange(optId, '');
      return;
    }
    let val = Math.floor(Number(raw) || 0);
    if (val < 0) val = 0;
    if (val > maxBet) val = maxBet;
    if (onBetChange) onBetChange(optId, val);
  };

  return (
    <div className="betting-question bq-vertical-list">
      {question.options.map((opt) => {
        const amt = Number(bets[opt.id] || 0);
        const payout = payoutFor(amt);
        const net = payout - amt;
        return (
          <div key={opt.id} className="bq-option-row">
            <div className="bq-option-main">
              <div className="bq-letter">{opt.id}</div>
              <div className="bq-opt-body">
                {opt.image ? (
                  <img src={opt.image} alt={`option-${opt.id}`} style={{ maxWidth: 120, maxHeight: 80, marginBottom: 6 }} />
                ) : null}
                <div className="bq-opt-text">{opt.text && opt.text.trim() ? opt.text : `Option ${opt.id}`}</div>
              </div>
            </div>

            <div className="bq-bet-controls">
              <input
                type="number"
                className="bq-bet-input"
                min={0}
                value={amt}
                onChange={(e) => handleInput(opt.id, e.target.value)}
                disabled={inputsDisabled || submitting}
              />

              <div className="bq-quick-buttons">
                <button className="bq-quick" onClick={() => handleQuick(opt.id, 25)} disabled={inputsDisabled || submitting}>25%</button>
                <button className="bq-quick" onClick={() => handleQuick(opt.id, 50)} disabled={inputsDisabled || submitting}>50%</button>
                <button className="bq-quick" onClick={() => handleQuick(opt.id, 75)} disabled={inputsDisabled || submitting}>75%</button>
                <button className="bq-quick" onClick={() => handleAll(opt.id)} disabled={inputsDisabled || submitting}>All</button>
              </div>

              <div className="bq-per-option-summary">
                <div className="bq-summary-line">Potential win: <span className="bq-value">{net >= 0 ? `+${net}` : net}</span></div>
                <div className="bq-summary-line">Potential loss: <span className="bq-value">-{amt}</span></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
