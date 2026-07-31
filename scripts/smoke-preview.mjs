import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const previewUrl = requiredEnv('PREVIEW_URL').replace(/\/$/, '');
const bypassSecret = requiredEnv('VERCEL_AUTOMATION_BYPASS_SECRET');
const expectedCommit = requiredEnv('EXPECTED_COMMIT');

if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
  throw new Error('EXPECTED_COMMIT must be a full 40-character Git SHA.');
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function curl(path, { method = 'GET', body } = {}) {
  const args = [
    '--fail-with-body',
    '--silent',
    '--show-error',
    '--location',
    '--connect-timeout', '20',
    '--max-time', '90',
    '--header', `x-vercel-protection-bypass: ${bypassSecret}`,
    '--header', 'x-vercel-set-bypass-cookie: true',
    '--request', method
  ];

  if (body !== undefined) {
    args.push('--header', 'content-type: application/json', '--data-binary', JSON.stringify(body));
  }

  args.push(`${previewUrl}${path}`);
  const { stdout } = await execFileAsync('curl', args, { maxBuffer: 2 * 1024 * 1024 });
  return stdout;
}

async function waitForDeployment() {
  const deadline = Date.now() + 4 * 60 * 1000;
  let lastError = 'deployment not checked';

  while (Date.now() < deadline) {
    try {
      const info = JSON.parse(await curl('/build-info.json'));
      if (info.sourceCommit === expectedCommit) return info;
      lastError = `Preview is at ${info.sourceCommit}, expected ${expectedCommit}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }

  throw new Error(`Preview did not reach expected commit: ${lastError}`);
}

const info = await waitForDeployment();
const html = await curl('/');
assert.match(html, /矿井排水危机/, 'preview should contain the crisis title');
assert.match(html, /御前问策/, 'preview should expose the LLM council entry point');
assert.match(html, /召集群臣问策/, 'preview should expose the LLM council action');

const court = JSON.parse(await curl('/api/court', {
  method: 'POST',
  body: {
    question: '如果朕想尽快恢复煤产，又不想把国库押在一台可能漏气的蒸汽泵上，现在最应该先查清什么？',
    state: { treasury: 100, coalSupply: 60, publicTrust: 72, knowledge: 0, turn: 1 }
  }
}));

assert.equal(court.ruleBoundary, 'advice_only', 'model must remain advice-only');
assert.equal(Array.isArray(court.ministers), true, 'court API should return ministers');
assert.equal(court.ministers.length, 3, 'court API should return exactly three ministers');
assert.deepEqual(court.ministers.map((item) => item.name), ['工部尚书', '户部尚书', '御史大夫']);
assert.ok(court.ministers.every((item) => item.position && item.reasoning && item.proposal), 'each minister should return substantive advice');
assert.ok(court.synthesis, 'court API should return a synthesis');
assert.ok(court.model, 'court API should expose the model used');

for (const minister of court.ministers) {
  assert.equal(Array.isArray(minister.unknowns), true, `${minister.name} should expose unknowns as an array`);
}

console.log(`Remote protected Preview + live LLM smoke passed for ${info.sourceBranch} @ ${info.sourceCommit} using ${court.model}.`);
