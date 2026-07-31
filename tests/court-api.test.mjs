import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourtMessages, normalizeState, parseCourtPayload, resolveModelBackend } from '../api/court.js';

test('existing OPENAI_API_KEY goes directly to the OpenAI Responses API', () => {
  const backend = resolveModelBackend({ OPENAI_API_KEY: 'test-key' });
  assert.equal(backend.provider, 'openai');
  assert.equal(backend.transport, 'responses');
  assert.equal(backend.baseUrl, 'https://api.openai.com/v1');
  assert.equal(backend.model, 'gpt-5');
});

test('explicit compatible endpoint wins when LLM_BASE_URL is configured', () => {
  const backend = resolveModelBackend({
    LLM_BASE_URL: 'https://example.invalid/v1/',
    LLM_API_KEY: 'compatible-key',
    LLM_MODEL: 'custom-model'
  });
  assert.equal(backend.provider, 'openai-compatible');
  assert.equal(backend.transport, 'chat');
  assert.equal(backend.baseUrl, 'https://example.invalid/v1');
  assert.equal(backend.model, 'custom-model');
});

test('Vercel AI Gateway is only the fallback when no direct OpenAI key exists', () => {
  const backend = resolveModelBackend({ VERCEL_OIDC_TOKEN: 'oidc-token' });
  assert.equal(backend.provider, 'vercel-ai-gateway');
  assert.equal(backend.transport, 'chat');
  assert.equal(backend.baseUrl, 'https://ai-gateway.vercel.sh/v1');
  assert.equal(backend.model, 'openai/gpt-5.4-nano');
});

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
