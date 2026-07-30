import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public');
const output = resolve(root, 'dist');
const sourceCommit = process.env.SOURCE_COMMIT || 'unknown';
const sourceBranch = process.env.SOURCE_BRANCH || 'unknown';

if (sourceCommit !== 'unknown' && !/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  throw new Error('SOURCE_COMMIT must be a 7-40 character hexadecimal Git commit SHA.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await writeFile(
  resolve(output, 'build-info.json'),
  `${JSON.stringify({ sourceCommit, sourceBranch, builtAt: new Date().toISOString() }, null, 2)}\n`
);

const files = await readdir(output, { recursive: true });
const textFiles = files.filter((file) => ['.html', '.js', '.css', '.json'].includes(extname(file)));
const builtText = (await Promise.all(
  textFiles.map((file) => readFile(resolve(output, file), 'utf8'))
)).join('\n');

for (const requiredText of ['矿井排水危机', '颁布工程令', '规则审计', 'build-info.json', sourceCommit]) {
  if (!builtText.includes(requiredText)) {
    throw new Error(`Production build contract failed: missing “${requiredText}”`);
  }
}

console.log(`Built dist/ with ${textFiles.length} verified text assets from ${sourceBranch} @ ${sourceCommit}.`);
