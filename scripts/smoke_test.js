(async () => {
  const base = 'http://localhost:3001/api';
  const log = (label, obj) => console.log('\n== ' + label + ' ==\n', JSON.stringify(obj, null, 2));

  const ping = await fetch(base + '/health');
  if (!ping.ok) {
    console.error('Server health check failed:', ping.statusText);
    // smoke_test.js - small end-to-end script

    (async () => {
      try {
        const base = 'http://localhost:3001/api';
        const log = (label, obj) => console.log('\n== ' + label + ' ==\n', JSON.stringify(obj, null, 2));

        const ping = await fetch(base + '/health');
        if (!ping.ok) {
          console.error('Server health check failed:', ping.statusText);
          // smoke_test.js - small end-to-end script

          "use strict";

          (async () => {
            try {
              const base = 'http://localhost:3001/api';
              const log = (label, obj) => console.log('\n== ' + label + ' ==\n', JSON.stringify(obj, null, 2));

              const ping = await fetch(base + '/health');
              if (!ping.ok) {
                console.error('Server health check failed:', ping.statusText);
                process.exit(1);
              }
              console.log('Server health OK');

              const createPayload = {
                name: 'Smoke Test',
                questions: [
                  { question: '1+1?', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_answer: 'B', multiple_correct: 'no' },
                  { question: 'Capital of France?', option_a: 'Paris', option_b: 'London', option_c: 'Berlin', option_d: 'Rome', correct_answer: 'A', multiple_correct: 'no' }
                ],
                initialCoins: 1000,
                winMultiplier: 2.0,
                totalDuration: 120
              };

              const created = await fetch(base + '/assessment/create', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createPayload)
              });
              const createdJson = await created.json();
              log('create', createdJson);
              if (!created.ok) return;

              const code = createdJson.studentCode;

              const join = await fetch(base + '/assessment/join', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, studentName: 'Tester' })
              });
              const joinJson = await join.json();
              log('join', joinJson);
              if (!join.ok) return;

              const studentId = joinJson.studentId;

              const q1 = await fetch(`${base}/assessment/${code}/student/${studentId}/question`);
              const q1j = await q1.json();
              log('question1', q1j);

              await new Promise(r => setTimeout(r, 2000));
              const submit1 = await fetch(`${base}/assessment/${code}/student/${studentId}/submit`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bets: { B: 100 }, skipped: false, noAnswer: false, timeTaken: 2 })
              });
              const sub1j = await submit1.json();
              log('submit1', sub1j);

              const q2 = await fetch(`${base}/assessment/${code}/student/${studentId}/question`);
              const q2j = await q2.json();
              log('question2', q2j);

              await new Promise(r => setTimeout(r, 3000));
              const submit2 = await fetch(`${base}/assessment/${code}/student/${studentId}/submit`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bets: {}, skipped: true, noAnswer: false, timeTaken: 3 })
              });
              const sub2j = await submit2.json();
              log('submit2', sub2j);

              const report = await fetch(`${base}/assessment/${code}/student/${studentId}/report`);
              const reportJson = await report.json();
              log('report', reportJson);

              console.log('\nSmoke test finished');
            } catch (err) {
              console.error('Smoke test error:', err);
              process.exit(1);
            }
          })();
