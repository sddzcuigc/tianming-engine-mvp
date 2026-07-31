import assert from 'node:assert/strict';

const previewUrl = requiredEnv('PREVIEW_URL').replace(/\/$/, '');
const bypassSecret = requiredEnv('VERCEL_AUTOMATION_BYPASS_SECRET');
const expectedCommit = requiredEnv('EXPECTED_COMMIT');
const bypassHeaders = {
  'x-vercel-protection-bypass': bypassSecret,
  'x-vercel-set-bypass-cookie': 'true'
};

if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
  throw new Error('EXPECTED_COMMIT must be a full 40-character Git SHA.');
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function waitForDeployment() {
  const deadline = Date.now() + 8 * 60 * 1000;
  let lastError = 'deployment not checked';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${previewUrl}/build-info.json`, {
        headers: bypassHeaders,
        redirect: 'follow',
        cache: 'no-store'
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
      const info = JSON.parse(body);
      if (info.sourceCommit === expectedCommit) return info;
      lastError = `Preview is at ${info.sourceCommit}, expected ${expectedCommit}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  throw new Error(`Preview did not reach expected commit: ${lastError}`);
}

const info = await waitForDeployment();
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ extraHTTPHeaders: bypassHeaders });
  const page = await context.newPage();
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 60_000 });

  await assertPageText(page, 'h1', '矿井排水危机');
  await assertPageText(page, '#build-provenance', expectedCommit.slice(0, 12));

  for (const decisionId of ['investigate', 'prototype', 'ration']) {
    const decision = page.locator(`.decision[data-id="${decisionId}"]`);
    await decision.click();
    assert.equal(await page.locator('#issue-order').isEnabled(), true, `${decisionId}: issue button should enable`);
    await page.locator('#issue-order').click();
    assert.equal(await page.locator('#result-panel').isVisible(), true, `${decisionId}: result should be visible`);
    await assertPageText(page, '#result-panel', '规则审计');
    await assertPageText(page, '#turn-label', '第 2 回合');
    await page.locator('#reset').click();
    await assertPageText(page, '#turn-label', '第 1 回合');
    assert.equal(await page.locator('#result-panel').isHidden(), true, `${decisionId}: reset should hide result`);
    assert.equal(await page.locator('#issue-order').isDisabled(), true, `${decisionId}: reset should disable issue button`);
  }

  console.log(`Remote preview smoke passed for ${info.sourceBranch} @ ${info.sourceCommit}.`);
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}

async function assertPageText(page, selector, expected) {
  const text = await page.locator(selector).textContent();
  assert.match(text ?? '', new RegExp(escapeRegExp(expected)), `${selector} should contain ${expected}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
