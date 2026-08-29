import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export function safeRedirectTarget(location, base = 'https://example.vercel.app') {
  if (!location) return '(missing-location)';
  try {
    const target = new URL(location, base);
    return `${target.hostname}${target.pathname}`;
  } catch {
    return '(invalid-location)';
  }
}

export function isSsoProtectionRedirect(status, location) {
  if (!REDIRECT_STATUSES.has(Number(status)) || !location) return false;
  try {
    const target = new URL(location, 'https://example.vercel.app');
    return target.hostname === 'vercel.com' && target.pathname === '/sso-api';
  } catch {
    return false;
  }
}

export function protectionFailureMessage() {
  return [
    'deployment_protection_bypass_rejected:',
    'Vercel redirected the protected Preview to /sso-api even though an automation bypass secret was supplied.',
    'The request format matches Vercel Protection Bypass for Automation; rotate/regenerate the project bypass secret,',
    'update GitHub Actions secret VERCEL_AUTOMATION_BYPASS_SECRET, then rerun this smoke test.'
  ].join(' ');
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePreviewUrl(value) {
  return value.replace(/\/$/, '');
}

async function readText(response) {
  const text = await response.text();
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

async function requestPreview(previewUrl, bypassSecret, path, { method = 'GET', body } = {}) {
  let url = new URL(`${previewUrl}${path}`);
  let currentMethod = method;
  let currentBody = body;
  const redirectChain = [];

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const headers = {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true'
    };
    if (currentBody !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(url, {
      method: currentMethod,
      headers,
      body: currentBody === undefined ? undefined : JSON.stringify(currentBody),
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000)
    });

    const location = response.headers.get('location');
    if (isSsoProtectionRedirect(response.status, location)) {
      throw new Error(protectionFailureMessage());
    }

    if (REDIRECT_STATUSES.has(response.status) && location) {
      const safeTarget = safeRedirectTarget(location, url);
      redirectChain.push(`${response.status}->${safeTarget}`);
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error(`preview_redirect_loop: ${redirectChain.join(' | ')}`);
      }
      url = new URL(location, url);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      continue;
    }

    if (!response.ok) {
      const detail = await readText(response);
      throw new Error(`preview_http_${response.status}: ${detail}`);
    }

    return response.text();
  }

  throw new Error('preview_redirect_loop: redirect loop exhausted');
}

function isNonRetryablePreviewFailure(message) {
  return message.startsWith('deployment_protection_bypass_rejected:') || message.startsWith('preview_redirect_loop:');
}

async function waitForDeployment(previewUrl, bypassSecret, expectedCommit) {
  const deadline = Date.now() + 90_000;
  let lastError = 'deployment not checked';

  while (Date.now() < deadline) {
    try {
      const info = JSON.parse(await requestPreview(previewUrl, bypassSecret, '/build-info.json'));
      if (info.sourceCommit === expectedCommit) return info;
      lastError = `Preview is at ${info.sourceCommit}, expected ${expectedCommit}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNonRetryablePreviewFailure(message)) throw error;
      lastError = message;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(`Preview did not reach expected commit: ${lastError}`);
}

export async function runSmoke(env = process.env) {
  const previewUrl = normalizePreviewUrl(requiredEnv(env, 'PREVIEW_URL'));
  const bypassSecret = requiredEnv(env, 'VERCEL_AUTOMATION_BYPASS_SECRET');
  const expectedCommit = requiredEnv(env, 'EXPECTED_COMMIT');

  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error('EXPECTED_COMMIT must be a full 40-character Git SHA.');
  }

  const info = await waitForDeployment(previewUrl, bypassSecret, expectedCommit);
  const html = await requestPreview(previewUrl, bypassSecret, '/');
  assert.match(html, /矿井排水危机/, 'preview should contain the crisis title');
  assert.match(html, /御前问策/, 'preview should expose the LLM council entry point');
  assert.match(html, /召集群臣问策/, 'preview should expose the LLM council action');

  const court = JSON.parse(await requestPreview(previewUrl, bypassSecret, '/api/court', {
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSmoke();
}
