import test from 'node:test';
import assert from 'node:assert/strict';
import { isSsoProtectionRedirect, protectionFailureMessage } from '../scripts/smoke-preview.mjs';

test('detects Vercel SSO redirect as a rejected automation bypass', () => {
  assert.equal(
    isSsoProtectionRedirect(302, 'https://vercel.com/sso-api?url=https%3A%2F%2Fpreview.vercel.app'),
    true
  );
});

test('does not misclassify normal deployment redirects', () => {
  assert.equal(isSsoProtectionRedirect(302, 'https://preview-abc.vercel.app/'), false);
  assert.equal(isSsoProtectionRedirect(200, 'https://vercel.com/sso-api'), false);
});

test('failure diagnostic is actionable without echoing a secret', () => {
  const message = protectionFailureMessage();
  assert.match(message, /rotate\/regenerate/i);
  assert.match(message, /VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.doesNotMatch(message, /Bearer|x-vercel-protection-bypass:/i);
});
