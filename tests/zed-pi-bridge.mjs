import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createJiti } = require(process.env.PI_JITI || '/home/bponce/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti');
const piRoot = '/home/bponce/.local/lib/node_modules/@earendil-works/pi-coding-agent';
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': `${piRoot}/dist/index.js`,
  '@earendil-works/pi-tui': `${piRoot}/node_modules/@earendil-works/pi-tui/dist/index.js`,
} });
const repo = resolve(import.meta.dirname, '..');
const { default: extension, validate } = await jiti.import(`${repo}/config/.pi/agent/extensions/zed.ts`);
const temp = await mkdtemp(`${tmpdir()}/zed-pi-test-`);
const home = `${temp}/home`;
await mkdir(`${home}/.local/bin`, { recursive: true });
await symlink(`${repo}/config/.local/bin/pi-zed`, `${home}/.local/bin/pi-zed`);
const windowsPath = `${temp}/windows.json`;
const window = { id: 7, title: 'First project', app_id: 'dev.zed.Zed', pid: process.pid, is_focused: true };
await writeFile(windowsPath, JSON.stringify([window]));
await writeFile(`${home}/.local/bin/niri`, `#!/usr/bin/env python3\nfrom pathlib import Path\nprint(Path(${JSON.stringify(windowsPath)}).read_text())\n`, { mode: 0o700 });
const previousPath = process.env.PATH;
process.env.PATH = `${home}/.local/bin:${previousPath}`;
const file = `${temp}/file.py`;
await writeFile(file, 'saved line\n');
const key = createHash('sha256').update(temp).digest('hex').slice(0, 24);
const queuePath = `${home}/.local/state/pi-zed/${key}/queue.json`;
const commands = new Map();
const events = new Map();
const messages = [];
const renderers = new Map();
const notifications = [];
const choices = [];
const ctx = { cwd: '/not-the-zed-project', hasUI: true, ui: {
  notify: (...args) => notifications.push(args),
  setStatus() {},
  select: async (_title, labels) => { choices.push(...labels); return labels[0]; },
} };
extension({
  registerMessageRenderer: (name, renderer) => renderers.set(name, renderer),
  registerCommand: (name, command) => commands.set(name, command),
  on: (name, handler) => events.set(name, handler),
  sendMessage: (message, options) => messages.push({ message, options }),
});

function run(action, input = '', env = {}) {
  return new Promise((done, reject) => {
    const child = spawn('python3', [`${repo}/config/.local/bin/pi-zed`, action], {
      env: { ...process.env, HOME: home, ZED_WORKTREE_ROOT: temp, ZED_FILE: file, ZED_ROW: '1', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => output += data);
    child.stderr.on('data', (data) => output += data);
    child.on('error', reject);
    child.on('close', (code) => done({ code, output }));
    child.stdin.end(input);
  });
}

try {
  const themeModule = await jiti.import(`${piRoot}/dist/modes/interactive/theme/theme.js`);
  themeModule.initTheme('dark');
  const renderer = renderers.get('zed-questions');
  const preview = { details: { cwd: '/home/bponce/Documents/GitHub/litesuite', targets: [{
    path: '/home/bponce/Documents/GitHub/litesuite/src/frontend/index.html', cursor_row: 11,
    text: '      <h1> Time to rule the world!</h1>', source: 'saved file line', question: 'testing testing',
  }] } };
  const rendered = renderer(preview, { expanded: false, outputPad: 1 }, themeModule.theme).render(105).join('\n');
  assert.match(rendered, /src\/frontend\/index.html/);
  assert.match(rendered, /testing testing/);
  assert.doesNotMatch(rendered, /Questions from the Zed project explicitly/);
  const long = structuredClone(preview);
  long.details.targets[0].text = Array.from({ length: 15 }, (_, i) => `line ${i}`).join('\n');
  assert.match(renderer(long, { expanded: false, outputPad: 1 }, themeModule.theme).render(105).join('\n'), /3 more lines/);
  assert.doesNotMatch(renderer(long, { expanded: true, outputPad: 1 }, themeModule.theme).render(105).join('\n'), /more lines/);
  if (process.env.PI_ZED_RENDER_PREVIEW) await writeFile(process.env.PI_ZED_RENDER_PREVIEW, rendered + '\n');
  assert.equal((await run('add', 'Explain this\n', { ZED_SELECTED_TEXT: 'unsaved $(touch /tmp/should-not-run)\nsecond line' })).code, 0);
  let queued = JSON.parse(await readFile(queuePath, 'utf8'));
  assert.match(queued[0].text, /unsaved/);
  const missing = await run('send');
  assert.equal(missing.code, 1);
  assert.equal(JSON.parse(await readFile(queuePath, 'utf8')).length, 1);
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try { await commands.get('zed').handler('', ctx); } finally { process.env.HOME = previousHome; }
  assert.equal(choices.length, 1);
  assert.equal(choices[0], 'Zed window 7 · First project');
  assert.equal((await run('send')).code, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].options.deliverAs, 'followUp');
  assert.deepEqual(JSON.parse(await readFile(queuePath, 'utf8')), []);
  await writeFile(queuePath, JSON.stringify(queued));
  assert.equal((await run('send')).code, 0);
  assert.equal(messages.length, 1, 'retry must not duplicate a delivered batch');
  assert.throws(() => validate({ type: 'questions', id: 'a'.repeat(64), instance: 'wrong', cwd: temp, targets: queued }, 'expected'));
  assert.throws(() => validate({ type: 'questions', id: 'a'.repeat(64), instance: 'expected', cwd: 'relative', targets: queued }, 'expected'));
  const other = `${temp}/other-project`;
  await mkdir(other);
  await writeFile(windowsPath, JSON.stringify([{ ...window, title: 'Other project' }]));
  assert.equal((await run('add', 'After project switch\n', { ZED_WORKTREE_ROOT: other })).code, 0);
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 0);
  assert.equal(messages.length, 2, 'same window must deliver after switching projects');
  assert.equal(messages[1].message.details.cwd, other);
  await writeFile(windowsPath, JSON.stringify([{ ...window, is_focused: false }, { ...window, id: 8 }]));
  assert.equal((await run('add', 'Different window\n')).code, 0);
  assert.equal((await run('send')).code, 1, 'another window must not use the existing connection');
  assert.equal(JSON.parse(await readFile(queuePath, 'utf8')).length, 1);
  await writeFile(queuePath, '[]');
  await writeFile(windowsPath, JSON.stringify([{ ...window, is_focused: false }, { ...window, id: 8, is_focused: false }]));
  assert.match((await run('send')).output, /Cannot identify/);
  await writeFile(windowsPath, JSON.stringify([window]));
  assert.equal((await run('add', 'Saved line question\n')).code, 0);
  queued = JSON.parse(await readFile(queuePath, 'utf8'));
  assert.equal(queued[0].text, 'saved line');
  assert.equal((await run('list', '1\n')).code, 0);
  assert.deepEqual(JSON.parse(await readFile(queuePath, 'utf8')), []);
  await events.get('session_shutdown')();
  assert.equal((await run('add', 'Retain me\n')).code, 0);
  assert.equal((await run('send')).code, 1);
  assert.equal(JSON.parse(await readFile(queuePath, 'utf8')).length, 1);
  console.log('PASS: live window picker, project switching, window isolation, ambiguous-window rejection, selection capture, disk fallback, queue review, delivery, deduplication, validation, shutdown, and failed-send retention');
} finally {
  await events.get('session_shutdown')();
  process.env.PATH = previousPath;
  await rm(temp, { recursive: true, force: true });
}
