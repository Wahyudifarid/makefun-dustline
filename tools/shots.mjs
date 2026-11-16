// DUSTLINE screenshot harness — takes the 4 entry screenshots in headless Chrome.
//
//   node tools/shots.mjs [--port 8901] [--shots 1,2,3,4]
//
// Serves game/ on localhost, loads game/index.html?shot=N for N = 1..4,
// waits for the scene to pose itself (window.__DUSTLINE_SHOT_READY), and
// writes screenshots/01-spawn.png, 02-firefight.png, 03-plant.png,
// 04-win.png. Gate limits enforced per shot: at most 256 KiB, long side at
// most 1280, short side at least 480; a shot that is too heavy is retaken
// at a smaller viewport until it fits.
//
// How it drives Chrome: the playwright npm package is NOT installed on this
// VM (checked: no playwright in any node_modules, global or project), and
// this run installs nothing, so the harness speaks the Chrome DevTools
// Protocol directly with Node's built-in WebSocket client over the cached
// chromium-1148 binary (~/.cache/ms-playwright/chromium-1148, with
// /opt/meta-chromium/chrome as fallback). Same browser, same shots; if the
// playwright package is installed later, swapping the transport is a small
// change. Node stdlib only otherwise (child_process, http, fs).
//
// Do NOT run for final screenshots until the game is playable: the harness
// refuses when STATUS.md does not contain "GAME PLAYABLE" unless --force
// is passed (test runs against a fixture use --force --game-dir ...).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, get as httpGet } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(join(here, '..'));
const GAME_DIR = join(ROOT, 'game');
const SHOTS_DIR = join(ROOT, 'screenshots');
const STATUS_FILE = join(ROOT, 'STATUS.md');

const SHOTS = [
  { n: 1, name: '01-spawn.png' },
  { n: 2, name: '02-firefight.png' },
  { n: 3, name: '03-plant.png' },
  { n: 4, name: '04-win.png' },
];

// Viewports tried in order until the PNG fits the 256 KiB gate.
const VIEWPORTS = [
  { w: 1280, h: 720 },
  { w: 1024, h: 576 },
  { w: 960, h: 540 },
  { w: 800, h: 480 },
];
const MAX_BYTES = 262_144;
const READY_TIMEOUT_MS = 15_000;
const SETTLE_MS = 1500;

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
};
const PORT = Number(argVal('port', '8901'));
const FORCE = args.includes('--force');
const GAME_OVERRIDE = argVal('game-dir', GAME_DIR);
const OUT_OVERRIDE = argVal('out-dir', SHOTS_DIR);
const onlyShots = argVal('shots', '1,2,3,4').split(',').map(Number);
const CHROME = existsSync(`${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`)
  ? `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`
  : '/opt/meta-chromium/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  process.stderr.write(`shots: ${msg}\n`);
  process.exit(1);
}

if (!FORCE) {
  let status = '';
  try {
    status = readFileSync(STATUS_FILE, 'utf8');
  } catch {
    fail('STATUS.md is missing and --force was not passed: the game is not declared playable yet; final screenshots stay pending.');
  }
  if (!status.includes('GAME PLAYABLE')) {
    fail('STATUS.md does not contain "GAME PLAYABLE" and --force was not passed: final screenshots stay pending.');
  }
}

// --- tiny static server for game/ (same rules as serve.ts) -----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
function serveGame(port, dir) {
  return new Promise((resolveListen) => {
    const root = resolve(dir);
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(join(root, path));
      if (!file.startsWith(root)) {
        res.writeHead(403); res.end(); return;
      }
      try {
        const st = statSync(file);
        if (!st.isFile()) { res.writeHead(404); res.end(); return; }
        const buf = readFileSync(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': buf.length });
        res.end(buf);
      } catch {
        res.writeHead(404); res.end();
      }
    });
    server.listen(port, () => resolveListen(server));
  });
}

// --- CDP helpers ------------------------------------------------------------
function httpJson(url) {
  return new Promise((resolvePromise, reject) => {
    httpGet(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolvePromise(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolvePromise, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP: ${msg.error.message}`));
        else resolvePromise(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolvePromise, reject) => this.pending.set(id, { resolvePromise, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page JS error: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

// --- main -------------------------------------------------------------------
const server = await serveGame(PORT, GAME_OVERRIDE);
process.stdout.write(`shots: serving ${GAME_OVERRIDE} at http://localhost:${PORT}/\n`);

const profile = join('/tmp', `fps01-shots-profile-${process.pid}`);
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT + 100}`,
], { stdio: 'ignore' });

let exitCode = 0;
try {
  // Chrome needs a moment to open its DevTools port; poll for it.
  let version = null;
  const chromeStarted = Date.now();
  while (Date.now() - chromeStarted < 20_000) {
    version = await httpJson(`http://localhost:${PORT + 100}/json/version`).catch(() => null);
    if (version) break;
    await sleep(250);
  }
  if (!version) fail('Chrome DevTools endpoint did not answer in 20 s; is chromium-1148 present?');
  const browser = new Cdp(version.webSocketDebuggerUrl);
  await browser.send('Target.setDiscoverTargets', { discover: true });

  mkdirSync(OUT_OVERRIDE, { recursive: true });

  for (const shot of SHOTS.filter((s) => onlyShots.includes(s.n))) {
    const url = `http://localhost:${PORT}/index.html?shot=${shot.n}`;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targets = await httpJson(`http://localhost:${PORT + 100}/json/list`);
    const target = targets.find((t) => t.id === targetId);
    if (!target) throw new Error(`no CDP target for shot ${shot.n}`);
    const pg = new Cdp(target.webSocketDebuggerUrl);
    await pg.send('Page.enable');
    await pg.send('Runtime.enable');
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await pg.send('Page.navigate', { url });

    // Wait for the game to pose the shot, then let it settle.
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < READY_TIMEOUT_MS) {
      try {
        ready = await pg.eval('window.__DUSTLINE_SHOT_READY === true');
        if (ready) break;
      } catch { /* page still loading */ }
      await sleep(250);
    }
    if (!ready) process.stdout.write(`shots: shot ${shot.n}: ready flag not seen in ${READY_TIMEOUT_MS} ms, capturing anyway\n`);
    await sleep(SETTLE_MS);

    const errors = pg.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    if (errors.length > 0) {
      process.stderr.write(`shots: shot ${shot.n}: ${errors.length} page exception(s): ${JSON.stringify(errors[0].params.exceptionDetails).slice(0, 500)}\n`);
    }

    let saved = null;
    for (const vp of VIEWPORTS) {
      await pg.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const shot64 = await pg.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot64.data, 'base64');
      if (buf.length <= MAX_BYTES) {
        saved = { buf, vp };
        break;
      }
      process.stdout.write(`shots: shot ${shot.n} at ${vp.w}x${vp.h} is ${buf.length} bytes, over the 256 KiB gate; retrying smaller\n`);
    }
    if (!saved) fail(`shot ${shot.n}: no viewport produced a PNG under 256 KiB`);
    const outPath = join(OUT_OVERRIDE, shot.name);
    writeFileSync(outPath, saved.buf);
    process.stdout.write(`shots: ${shot.name} — ${saved.vp.w}x${saved.vp.h}, ${saved.buf.length} bytes\n`);
    pg.close();
    await browser.send('Target.closeTarget', { targetId });
  }
  browser.close();
} catch (err) {
  process.stderr.write(`shots: FAILED: ${err.message}\n`);
  exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(exitCode);
