import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/restyle-result-report-fonts.py');

let work: string | undefined;

afterEach(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

it('rewrites Gulim and headline faces to Noto Sans CJK KR', () => {
  work = mkdtempSync(join(tmpdir(), 'web-picker-report-fonts-'));
  const src = join(work, 'in.docx');
  const dest = join(work, 'out.docx');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:r><w:rPr><w:rFonts w:ascii="HY헤드라인M" w:eastAsia="HY헤드라인M" w:cs="굴림"/></w:rPr><w:t>제목</w:t></w:r>
  <w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="맑은 고딕"/></w:rPr><w:t>본문</w:t></w:r>
</w:document>`;
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const zip = spawnSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1], 'w')
z.writestr('word/document.xml', sys.argv[2])
z.writestr('word/fontTable.xml', '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:fonts>')
z.close()
`, src, document], { encoding: 'utf8' });
  expect(zip.status, zip.stderr).toBe(0);

  execFileSync('python3', [SCRIPT, src, dest], { encoding: 'utf8' });
  const out = execFileSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode()
print(xml)
`, dest], { encoding: 'utf8' });

  expect(out).toContain('Noto Sans CJK KR');
  expect(out).toContain('<w:b/>');
  expect(out).not.toContain('굴림');
  expect(out).not.toContain('HY헤드라인M');
  expect(out).not.toContain('맑은 고딕');
});
