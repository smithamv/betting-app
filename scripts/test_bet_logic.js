function applyBets({ studentCoins, bets, correctAnswers, winMultiplier }) {
  const totalBet = Object.values(bets || {}).reduce((s, v) => s + (v || 0), 0);
  if (totalBet > studentCoins) {
    return { error: 'Insufficient coins' };
  }
  const previous = studentCoins;
  studentCoins = Math.max(0, studentCoins - totalBet);
  let coinsReturned = 0;
  let coinsLost = 0;
  const betResults = {};
  Object.entries(bets || {}).forEach(([option, amount]) => {
    amount = Number(amount || 0);
    if (amount > 0) {
      const isCorrect = (correctAnswers || []).includes(option);
      if (isCorrect) {
        const payout = Math.floor(amount * winMultiplier);
        coinsReturned += payout;
        studentCoins += payout;
        betResults[option] = { amount, correct: true, payout, profit: payout - amount };
      } else {
        coinsLost += amount;
        betResults[option] = { amount, correct: false, lost: amount };
      }
    }
  });
  const netChange = studentCoins - previous;
  return { previous, totalBet, coinsReturned, coinsLost, netChange, coinsAfter: studentCoins, betResults };
}

const scenarios = [
  { studentCoins:1000, bets:{A:100}, correctAnswers:['A'], winMultiplier:1.5 },
  { studentCoins:1000, bets:{A:1000}, correctAnswers:['A'], winMultiplier:1.5 },
  { studentCoins:1000, bets:{A:500,B:500}, correctAnswers:['A'], winMultiplier:1.5 },
  { studentCoins:1000, bets:{A:500,B:300}, correctAnswers:['A','B'], winMultiplier:2.0 }
];

scenarios.forEach((s, i) => {
  console.log('Scenario', i+1);
  console.log(JSON.stringify(applyBets(s), null, 2));
  console.log('---');
});
