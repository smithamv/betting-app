const assert = require('assert');

// Simple tests to validate payout and penalty rounding behavior
function payout(amount, multiplier) {
  // backend uses Math.floor for payout
  return Math.floor(amount * multiplier);
}

function skipPenalty(currentCoins) {
  // front & backend round 5% penalty to nearest 10: Math.round((currentCoins * 0.05) / 10) * 10
  return Math.round((currentCoins * 0.05) / 10) * 10;
}

// Tests
try {
  assert.strictEqual(payout(100, 1.5), 150);
  assert.strictEqual(payout(1, 1.5), 1); // floor(1.5) -> 1
  assert.strictEqual(payout(3, 1.5), 4); // floor(4.5) -> 4

  assert.strictEqual(skipPenalty(1000), 50); // 5% = 50 -> nearest 10 = 50
  assert.strictEqual(skipPenalty(123), 10); // 5% = 6.15 -> /10 = 0.615 -> round 1 -> *10 = 10
  assert.strictEqual(skipPenalty(0), 0);

  console.log('All rounding policy tests passed');
  process.exit(0);
} catch (err) {
  console.error('Rounding policy tests failed', err);
  process.exit(2);
}
