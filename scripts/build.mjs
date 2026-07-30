import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public');
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const files = await readdir(output, { recursive: true });
const textFiles = files.filter((file) => ['.html', '.js', '.css'].includes(extname(file)));
const builtText = (await Promise.all(
  textFiles.map((file) => readFile(resolve(output, file), 'utf8'))
)).join('\n');

for (const requiredText of ['矿井排水危机', '颁布工程令', '规则审计']) {
  if (!builtText.includes(requiredText)) {
    throw new Error(`Production build contract failed: missing “${requiredText}”`);
  }
}

console.log(`Built dist/ with ${textFiles.length} verified text assets.`);
