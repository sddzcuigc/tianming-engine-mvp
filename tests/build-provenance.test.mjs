import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function readBuildInfo() {
  return JSON.parse(await readFile('dist/build-info.json', 'utf8'));
}

test('production build emits verifiable source provenance', async () => {
  const sourceCommit = '8f861ced47f99feb84abcf83479dd27bd9d42931';
  const sourceBranch = 'agent/bootstrap-minimal-slice';

  await execFileAsync(process.execPath, ['scripts/build.mjs'], {
    env: { ...process.env, SOURCE_COMMIT: sourceCommit, SOURCE_BRANCH: sourceBranch }
  });

  const info = await readBuildInfo();
  const index = await readFile('dist/index.html', 'utf8');
  const app = await readFile('dist/app.js', 'utf8');

  assert.equal(info.sourceCommit, sourceCommit);
  assert.equal(info.sourceBranch, sourceBranch);
  assert.match(info.builtAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(index, /build-provenance/);
  assert.match(app, /build-info\.json/);
});

test('production build reads Vercel Git metadata when explicit provenance is absent', async () => {
  const sourceCommit = '8f5a5a489f3f3c2176aefbaefe7ea092739fd675';
  const sourceBranch = 'agent/bootstrap-minimal-slice';

  await execFileAsync(process.execPath, ['scripts/build.mjs'], {
    env: {
      ...process.env,
      SOURCE_COMMIT: '',
      SOURCE_BRANCH: '',
      VERCEL_GIT_COMMIT_SHA: sourceCommit,
      VERCEL_GIT_COMMIT_REF: sourceBranch
    }
  });

  const info = await readBuildInfo();
  assert.equal(info.sourceCommit, sourceCommit);
  assert.equal(info.sourceBranch, sourceBranch);
});

test('production build rejects malformed commit provenance', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/build.mjs'], {
      env: { ...process.env, SOURCE_COMMIT: 'not-a-sha', SOURCE_BRANCH: 'test' }
    }),
    /commit provenance/
  );
});
