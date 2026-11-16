// DRAFT — placeholder until the kit lands. DO NOT SHIP AS-IS.
//
// This is the infra subagent's own draft of the make.fun dossier library,
// written from the competition rules (fps01-rules.md, "The dossier") so that
// main.ts can be tested end to end before the kit arrives. When the kit
// lands, REPLACE this file byte-for-byte with the kit's
// vendor/makefun-threejs.ts (unchanged) and revise main.ts to match the
// real buildDossier signature. Nothing in this draft is the kit's code.
//
// Draft contract (mirrors the make.fun dossier convention):
//   buildDossier(dir, caps): Uint8Array
//   dir  — the output directory holding game/ and screenshots/
//   caps — { text_max_bytes, screenshots: { max, max_bytes },
//            game: { max_files, max_bytes } }
// Returns the dossier as canonical JSON bytes (makefun/dossier/v1):
//   { images: [{ name, media, data(base64) }...], schema, text }
// where text is the "## Game" block plus the "## Source" sections, capped
// at caps.text_max_bytes UTF-8 bytes with the rules' cut rule.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';

export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
export const TEXT_MAX_BYTES = 163_840;
export const SCREENSHOT_MAX = 4;
export const SCREENSHOT_MAX_BYTES = 262_144;

export class DossierError extends Error {}

export type DossierCaps = {
  text_max_bytes: number;
  screenshots?: { max?: number; max_bytes?: number };
  game?: { max_files?: number; max_bytes?: number };
};

const SOURCE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.glsl', '.vert', '.frag', '.wgsl', '.json']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg']);

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isSource(rel: string): boolean {
  if (rel.split(sep).includes('vendor')) return false;
  const base = basename(rel);
  if (base.endsWith('.min.js') || base.endsWith('.min.mjs') || base.endsWith('.min.css')) return false;
  return SOURCE_EXT.has(extname(rel).toLowerCase());
}

/** Every file under `dir`, recursively, as posix-style relative paths, sorted. */
function walk(dir: string, base: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => byCodeUnit(a.name, b.name));
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = base === '' ? e.name : `${base}/${e.name}`;
    if (e.isSymbolicLink()) throw new DossierError(`buildDossier: ${rel} is a symlink, not a plain file`);
    if (e.isDirectory()) walk(full, rel, out);
    else if (e.isFile()) out.push(rel);
  }
}

/** Canonical JSON: object keys sorted by code unit, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(byCodeUnit);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Static import/export specifiers in a module's text (draft: line regex, kit uses AST). */
function staticSpecifiers(text: string): string[] {
  const found: string[] = [];
  const re = /(?:^|[;{}])\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|export\s+(?:\*\s+from|{[^}]*}\s+from)\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) found.push(m[1] ?? m[2]);
  return found;
}

/** Resolve a specifier to a game-relative path, or null when it cannot resolve. */
function resolveSpecifier(spec: string, fromRel: string, importMap: Map<string, string>): string | null {
  if (importMap.has(spec)) {
    const target = importMap.get(spec) as string;
    return target.startsWith('./') ? target.slice(2) : target.startsWith('/') ? null : target;
  }
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null; // bare, unmapped: skipped
  const fromDir = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')) : '';
  const parts: string[] = [];
  for (const seg of `${fromDir}/${spec}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const max = caps.text_max_bytes;
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(max)}`);
  }
  const maxImages = caps.screenshots?.max ?? SCREENSHOT_MAX;
  const maxImageBytes = caps.screenshots?.max_bytes ?? SCREENSHOT_MAX_BYTES;
  const gameDir = join(dir, 'game');
  const shotsDir = join(dir, 'screenshots');

  let gameStat;
  try {
    gameStat = statSync(gameDir);
  } catch {
    throw new DossierError('buildDossier: no game/ directory');
  }
  if (!gameStat.isDirectory()) throw new DossierError('buildDossier: game/ is not a directory');

  const rels: string[] = [];
  walk(gameDir, '', rels);
  if (caps.game?.max_files !== undefined && rels.length > caps.game.max_files) {
    throw new DossierError(`buildDossier: game/ holds ${rels.length} entries, over the ${caps.game.max_files} allowed`);
  }
  let gameBytes = 0;
  const files = rels.map((rel) => {
    const buf = readFileSync(join(gameDir, ...rel.split('/')));
    gameBytes += buf.length;
    return { rel, bytes: buf.length, buf };
  });
  if (caps.game?.max_bytes !== undefined && gameBytes > caps.game.max_bytes) {
    throw new DossierError(`buildDossier: game/ is ${gameBytes} bytes, over the ${caps.game.max_bytes} allowed`);
  }

  const index = files.find((f) => f.rel === 'index.html');
  if (!index) throw new DossierError('buildDossier: game/index.html is missing');
  if (index.bytes > 1_048_576) throw new DossierError('buildDossier: game/index.html is over 1 MiB');

  // Import map: the single "three" mapping in index.html.
  const indexText = index.buf.toString('utf8');
  const importMap = new Map<string, string>();
  const mapMatch = /<script\s+type="importmap"[^>]*>([\s\S]*?)<\/script>/i.exec(indexText);
  if (mapMatch) {
    try {
      const parsed = JSON.parse(mapMatch[1]) as { imports?: Record<string, string> };
      for (const [k, v] of Object.entries(parsed.imports ?? {})) importMap.set(k, v);
    } catch {
      throw new DossierError('buildDossier: game/index.html import map is not valid JSON');
    }
  }
  const threeTarget = importMap.get('three') ?? null;
  if (threeTarget === null) throw new DossierError('buildDossier: import map has no "three" mapping');
  const threeRel = threeTarget.startsWith('./') ? threeTarget.slice(2) : threeTarget;
  const threeFile = files.find((f) => f.rel === threeRel);
  if (!threeFile) throw new DossierError(`buildDossier: import map "three" target ${threeTarget} is not a file in game/`);

  // Source order: index.html first, then modules depth-first from its module
  // scripts' static imports, then the remaining source files by path.
  const sources = files.filter((f) => isSource(f.rel));
  const byRel = new Map(sources.map((f) => [f.rel, f]));
  const ordered: typeof sources = [];
  const seen = new Set<string>();
  const visit = (rel: string): void => {
    if (seen.has(rel) || !byRel.has(rel)) return;
    seen.add(rel);
    ordered.push(byRel.get(rel) as (typeof sources)[number]);
    const text = (byRel.get(rel) as (typeof sources)[number]).buf.toString('utf8');
    for (const spec of staticSpecifiers(text)) {
      const target = resolveSpecifier(spec, rel, importMap);
      if (target !== null) visit(target);
    }
  };
  visit('index.html');
  // Module scripts in index.html are the DFS entry points for the game code.
  const scriptSrc = /<script\s+[^>]*type="module"[^>]*\ssrc="([^"]+)"[^>]*>|<script\s+[^>]*\ssrc="([^"]+)"[^>]*type="module"[^>]*>/gi;
  let sm;
  while ((sm = scriptSrc.exec(indexText)) !== null) {
    const target = resolveSpecifier(sm[1] ?? sm[2], 'index.html', importMap);
    if (target !== null) visit(target);
  }
  for (const f of sources) {
    if (!seen.has(f.rel)) {
      seen.add(f.rel);
      ordered.push(f);
    }
  }
  // index.html first: visit() already put it first; the loop above appended the
  // rest in path order, and DFS order is preserved for the visited modules.
  const vendored = files.filter((f) => !isSource(f.rel));
  const sourceBytes = sources.reduce((n, f) => n + f.bytes, 0);
  const vendoredBytes = vendored.reduce((n, f) => n + f.bytes, 0);

  // Screenshots: PNG/JPEG files, names starting with '.' skipped, sorted.
  let shotNames: string[];
  try {
    shotNames = readdirSync(shotsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort(byCodeUnit);
  } catch {
    throw new DossierError('buildDossier: no screenshots/ directory: the first screenshot is the cover');
  }
  if (shotNames.length === 0) throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  if (shotNames.length > maxImages) {
    throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${maxImages} allowed`);
  }
  const images = shotNames.map((name) => {
    const buf = readFileSync(join(shotsDir, name));
    if (buf.length > maxImageBytes) {
      throw new DossierError(`buildDossier: screenshots/${name} is ${buf.length} bytes, over the ${maxImageBytes} allowed`);
    }
    const ext = extname(name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) throw new DossierError(`buildDossier: screenshots/${name} is not a PNG or JPEG`);
    return { name, media: ext === '.png' ? 'image/png' : 'image/jpeg', data: buf.toString('base64') };
  });

  // The Game block.
  const assetsByExt = new Map<string, { n: number; bytes: number }>();
  for (const f of vendored) {
    const ext = extname(f.rel).toLowerCase() || '(none)';
    const cur = assetsByExt.get(ext) ?? { n: 0, bytes: 0 };
    cur.n += 1;
    cur.bytes += f.bytes;
    assetsByExt.set(ext, cur);
  }
  const assetLines = [...assetsByExt.entries()]
    .sort((a, b) => byCodeUnit(a[0], b[0]))
    .map(([ext, v]) => `- ${ext}: ${v.n} file${v.n === 1 ? '' : 's'}, ${v.bytes} bytes`);
  const gameBlock = [
    '## Game',
    `three.js 0.187.0: game/${threeRel} (${threeFile.bytes} bytes)`,
    `import map "three" -> ${threeTarget}`,
    `source files: ${sources.length} (${sourceBytes} bytes)`,
    `vendored files: ${vendored.length} (${vendoredBytes} bytes)`,
    `assets by extension:`,
    ...assetLines,
    `total: ${files.length} files, ${gameBytes} bytes`,
    '',
  ].join('\n');

  // The Source sections, capped at max UTF-8 bytes with the cut rule.
  const header = (f: (typeof sources)[number]): string =>
    `### ${f.rel} (${f.buf.toString('utf8').split('\n').length} lines, ${f.bytes} bytes)\n`;
  let text = `${gameBlock}## Source\n`;
  let leftOutFiles = 0;
  let leftOutBytes = 0;
  let truncated = false;
  for (const f of ordered) {
    const body = f.buf.toString('utf8');
    const section = `${header(f)}${body}\n`;
    if (utf8Bytes(text) + utf8Bytes(section) <= max) {
      text += section;
      continue;
    }
    // First file that does not fit: show it from its first line up to the cap.
    const lines = body.split('\n');
    let kept = '';
    let hidden = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const candidate = kept === '' ? `${lines[i]}\n` : `${kept}${lines[i]}\n`;
      if (utf8Bytes(text) + utf8Bytes(header(f)) + utf8Bytes(candidate) > max) break;
      kept = candidate;
      hidden = lines.length - i - 1;
    }
    if (kept !== '') {
      text += `${header(f)}${kept}... ${hidden} line${hidden === 1 ? '' : 's'} hidden (cap ${max} bytes)\n`;
    } else {
      leftOutFiles += 1;
      leftOutBytes += f.bytes;
    }
    truncated = true;
    // Everything after the first cut file is left out whole.
    const rest = ordered.slice(ordered.indexOf(f) + 1);
    leftOutFiles += rest.length;
    leftOutBytes += rest.reduce((n, g) => n + g.bytes, 0);
    break;
  }
  if (truncated || leftOutFiles > 0) {
    text += `\n${leftOutFiles} whole file${leftOutFiles === 1 ? '' : 's'} and ${leftOutBytes} bytes of source left out.\n`;
  }

  const dossier = { images, schema: DOSSIER_SCHEMA, text };
  return new TextEncoder().encode(canonicalJson(dossier));
}
