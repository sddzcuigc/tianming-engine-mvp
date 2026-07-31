import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourtMessages, normalizeState, parseCourtPayload } from '../api/court.js';

test('court prompt keeps model advice outside deterministic settlement', () => {
  const messages = buildCourtMessages({ question: '先查什么？', state: normalizeState({ treasury: 88, turn: 2 }) });
  assert.match(messages[0].content, /不得修改国家状态数值/);
  assert.match(messages[0].content, /不得把未知事实当成已知/);
  assert.match(messages[1].content, /先查什么/);
  assert.match(messages[1].content, /"treasury":88/);
});

test('court response requires three named minister roles and strips code fences', () => {
  const raw = '```json\n' + JSON.stringify({
    ministers: [
      { id: 'works', position: '先测涌水量', reasoning: '没有扬程和流量就无法定泵。', unknowns: ['井深'], proposal: '两日测量' },
      { id: 'revenue', position: '先设预算上限', reasoning: '试制会挤占军械资金。', unknowns: ['可动用现银'], proposal: '设阶段拨款' },
      { id: 'censor', position: '先验地方奏报', reasoning: '四成减产可能混入瞒报。', unknowns: ['原始产量账'], proposal: '交叉核账' }
    ],
    synthesis: '争议不在要不要救矿，而在先补哪一类证据。'
  }) + '\n```';
  const parsed = parseCourtPayload(raw);
  assert.deepEqual(parsed.ministers.map((item) => item.name), ['工部尚书', '户部尚书', '御史大夫']);
  assert.match(parsed.synthesis, /证据/);
});

test('court response fails closed when a minister is missing', () => {
  assert.throws(() => parseCourtPayload(JSON.stringify({ ministers: [{ id: 'works' }], synthesis: '' })), /three ministers/);
});
