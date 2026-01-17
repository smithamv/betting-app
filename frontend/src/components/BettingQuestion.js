import React, { useState, useEffect } from 'react';
import './BettingQuestion.css';

export default function BettingQuestion({
  question,
  bets = {},
  remainingCoins = 0,
  currentCoins = 0,
  winMultiplier = 2,
  submitting = false,
  inputsDisabled = false,
  onBetChange,
  onBetsUpdate
}) {
  // Helper to compute payout and net
  const payoutFor = (amt) => Math.floor((Number(amt) || 0) * (winMultiplier || 2));

  const handleQuick = (optId, percent) => {
    const cc = Math.max(0, Number(currentCoins || 0));
    const current = Math.max(0, Number(bets[optId] || 0));
    // target is percent of total current coins (user requested behavior)
    // Use Math.round so percent mapping is symmetric and minimizes bias
    let target = Math.round((percent / 100) * cc);

    // build new bets object with target set for this option
    const newBets = { ...bets };
    newBets[optId] = target;

    // ensure numeric integers and non-negative
    Object.keys(newBets).forEach(k => { newBets[k] = Math.max(0, Math.floor(Number(newBets[k] || 0))); });

    const total = Object.values(newBets).reduce((s, v) => s + v, 0);
    if (total > cc) {
      // need to reduce other options proportionally (exclude optId)
      const others = Object.keys(newBets).filter(k => k !== optId);
      const sumOthers = others.reduce((s, k) => s + newBets[k], 0);
      let excess = total - cc;

      if (sumOthers > 0) {
        // proportional reduction
        others.forEach(k => {
          const reduction = Math.floor((newBets[k] / sumOthers) * excess);
          newBets[k] = Math.max(0, newBets[k] - reduction);
        });

        // correct any remaining excess by decrementing largest others
        let newTotal = Object.values(newBets).reduce((s, v) => s + v, 0);
        while (newTotal > cc) {
          let maxKey = others.reduce((a, b) => (newBets[a] >= newBets[b] ? a : b));
          if (!maxKey || newBets[maxKey] <= 0) break;
          newBets[maxKey] = Math.max(0, newBets[maxKey] - 1);
          newTotal--;
        }
      } else {
        // no other bets to reduce; clamp the option to cc
        newBets[optId] = Math.min(newBets[optId], cc);
      }
    }

    if (onBetsUpdate) {
      onBetsUpdate(newBets);
    } else if (onBetChange) {
      Object.entries(newBets).forEach(([k, v]) => onBetChange(k, v));
    }
  };

  const handleAll = (optId) => {
    const cc = Math.max(0, Number(currentCoins || 0));
    const newBets = { ...bets, [optId]: cc };
    // other bets need to be reduced to fit cc
    Object.keys(newBets).forEach(k => { newBets[k] = Math.max(0, Math.floor(Number(newBets[k] || 0))); });
    const total = Object.values(newBets).reduce((s, v) => s + v, 0);
    if (total > cc) {
      const others = Object.keys(newBets).filter(k => k !== optId);
      others.forEach(k => { newBets[k] = 0; });
      // ensure option is not more than cc
      newBets[optId] = Math.min(newBets[optId], cc);
    }

    if (onBetsUpdate) onBetsUpdate(newBets);
    else if (onBetChange) Object.entries(newBets).forEach(([k, v]) => onBetChange(k, v));
  };

  const handleInput = (optId, raw) => {
    const current = Math.max(0, Number(bets[optId] || 0));
    const maxBet = Math.max(0, Number(currentCoins || 0));
    // Allow empty string while editing so user can delete the default '0'
    if (raw === '' || raw === null) {
      if (onBetsUpdate) onBetsUpdate({ ...bets, [optId]: '' });
      else if (onBetChange) onBetChange(optId, '');
      return;
    }
    let val = Math.floor(Number(raw) || 0);
    if (val < 0) val = 0;
    if (val > maxBet) val = maxBet;
    if (onBetsUpdate) onBetsUpdate({ ...bets, [optId]: val });
    else if (onBetChange) onBetChange(optId, val);
  };

  return (
    <div className="betting-question bq-vertical-list">
      {question.options.map((opt) => {
        const rawVal = bets[opt.id];
        const amt = rawVal === '' ? '' : Number(rawVal || 0);
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
