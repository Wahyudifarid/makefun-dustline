// DUSTLINE — threejs-fps-01 entry program (Node 22, standard library only).
//
// Copies this repository's game/ and screenshots/ to the output directory
// and writes output/dossier.json with buildDossier from the vendored
// make.fun library, as the competition rules require.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output; when it is
// unset the program writes to /output. Two runs write byte-identical output:
// files are copied in sorted order, symlinks are refused, and the dossier
// carries no timestamps. DRAFT: written before the kit landed, from the
// rules description; revise the buildDossier call once the kit's
// vendor/makefun-threejs.ts is in place.

import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps for this bounty (fps01-rules.md): text 160 KiB, at most 4
// screenshots of at most 256 KiB each, game/ at most 993 entries / 48 MiB.
const CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game: { max_files: 993, max_bytes: 50_331_648 },
};

/** Copy one directory tree into `to`, in sorted order, refusing symlinks. */
function copyTree(from: string, to: string): number {
  if (!existsSync(from)) {
    process.stderr.write(`dustline: missing directory ${from}\n`);
    process.exit(1);
  }
  if (!statSync(from).isDirectory()) {
    process.stderr.write(`dustline: ${from} is not a directory\n`);
    process.exit(1);
  }
  mkdirSync(to, { recursive: true });
  let count = 0;
  const entries = readdirSync(from, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isSymbolicLink() || lstatSync(src).isSymbolicLink()) {
      process.stderr.write(`dustline: refusing symlink ${src}\n`);
      process.exit(1);
    }
    if (entry.isDirectory()) {
      count += copyTree(src, dst);
    } else if (entry.isFile()) {
      copyFileSync(src, dst);
      count += 1;
    }
  }
  return count;
}

mkdirSync(out, { recursive: true });
// Clear the three paths this program owns, so a re-run cannot leave stale
// files behind and two runs produce identical bytes.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, name), { recursive: true, force: true });
}

const gameFiles = copyTree(join(here, 'game'), join(out, 'game'));
const shotFiles = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

// The dossier is written last: the gate rebuilds it from this output and
// compares the bytes, so it must come from the copied trees, not the repo.
const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `dustline: wrote ${out} — game/ (${gameFiles} files), screenshots/ (${shotFiles} images), dossier.json (${dossier.length} bytes)\n`,
);
