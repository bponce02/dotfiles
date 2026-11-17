import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';

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
const statuses = new Map();
const ctx = { cwd: temp, sessionManager: { getSessionId: () => 'test-session' }, hasUI: true, ui: {
  notify: (...args) => notifications.push(args),
  setStatus: (name, value) => statuses.set(name, value),
  select: async (_title, labels) => { choices.push(...labels); return labels[0]; },
} };
extension({
  getSessionName: () => 'First session',
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

function request(path, value) {
  return new Promise((done, reject) => {
    const client = createConnection(path);
    let output = '';
    client.setTimeout(2000, () => client.destroy(new Error('Timeout')));
    client.on('error', reject);
    client.on('connect', () => client.write(JSON.stringify(value) + '\n'));
    client.on('data', (data) => output += data);
    client.on('end', () => { try { done(JSON.parse(output)); } catch (error) { reject(error); } });
  });
}

const directory = `/tmp/pi-zed-${process.getuid()}`;
let instance;
const extra = [];
async function session(cwd, name) {
  const handlers = new Map();
  const sessionCommands = new Map();
  const received = [];
  const context = { ...ctx, cwd };
  extension({
    getSessionName: () => name,
    registerMessageRenderer() {},
    registerCommand: (name, command) => sessionCommands.set(name, command),
    on: (event, handler) => handlers.set(event, handler),
    sendMessage: (message) => received.push(message),
  });
  const stop = () => handlers.get('session_shutdown')();
  extra.push(stop);
  await handlers.get('session_start')({}, context);
  return { received, stop, context, bind: async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try { await sessionCommands.get('zed').handler('', context); }
    finally { process.env.HOME = previousHome; }
  }, restart: () => handlers.get('session_start')({}, context) };
}

try {
  await events.get('session_start')({}, ctx);
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
  const historical = structuredClone(preview);
  historical.details.targets[0].path = '';
  assert.match(renderer(historical, { expanded: false, outputPad: 1 }, themeModule.theme).render(105).join('\n'), /historical\/virtual selection/);
  const long = structuredClone(preview);
  long.details.targets[0].text = Array.from({ length: 15 }, (_, i) => `line ${i}`).join('\n');
  assert.match(renderer(long, { expanded: false, outputPad: 1 }, themeModule.theme).render(105).join('\n'), /3 more lines/);
  assert.doesNotMatch(renderer(long, { expanded: true, outputPad: 1 }, themeModule.theme).render(105).join('\n'), /more lines/);
  if (process.env.PI_ZED_RENDER_PREVIEW) await writeFile(process.env.PI_ZED_RENDER_PREVIEW, rendered + '\n');
  const historyAdd = await run('add', 'Explain commit abc123 file.py\n', {
    ZED_FILE: '', ZED_SELECTED_TEXT: 'historical line\nremoved code',
  });
  assert.equal(historyAdd.code, 0, historyAdd.output);
  const historyQueue = JSON.parse(await readFile(queuePath, 'utf8'));
  assert.equal(historyQueue[0].path, '');
  assert.equal(historyQueue[0].text, 'historical line\nremoved code');
  assert.match(historyQueue[0].source, /historical\/virtual/);
  assert.match((await run('list', '\n')).output, /historical\/virtual selection/);
  const noSelection = await run('add', 'Explain\n', { ZED_FILE: '', ZED_SELECTED_TEXT: '' });
  assert.equal(noSelection.code, 1);
  assert.match(noSelection.output, /Select text/);
  assert.deepEqual(JSON.parse(await readFile(queuePath, 'utf8')), historyQueue);
  await run('list', '1\n');
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
  assert.equal(statuses.get('zed'), 'Zed routing: Zed window 7 · First project');
  instance = JSON.parse((await run('instances')).output)[0].id;
  let endpoint;
  let info;
  for (const name of await readdir(directory)) {
    if (!name.startsWith('session-') || !name.endsWith('.sock')) continue;
    try {
      const found = await request(`${directory}/${name}`, { type: 'info' });
      if (found.cwd === temp) { endpoint = `${directory}/${name}`; info = found; break; }
    } catch {}
  }
  assert.ok(endpoint);
  const batch = { type: 'questions', id: 'a'.repeat(64), instance, token: info.token, cwd: temp, targets: queued };
  assert.equal((await request(endpoint, { ...batch, cwd: home })).type, 'error', 'receiver rechecks directory');
  assert.equal((await request(endpoint, { ...batch, token: 'expired' })).type, 'error', 'receiver rechecks registration');
  assert.equal((await request(endpoint, { ...batch, instance: '0'.repeat(24) })).type, 'error', 'unauthorized window');
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
  const absent = await run('send', '', { ZED_WORKTREE_ROOT: other });
  assert.equal(absent.code, 1);
  assert.match(absent.output, /another project/);
  assert.equal(messages.length, 1, 'must not fall back to the original project');
  const worktree = await session(other, 'Worktree session');
  assert.equal(statuses.get('zed'), 'Zed routing: Zed window 7 · Other project');
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 1, 'opening a session cannot bind it');
  await worktree.bind();
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 0);
  assert.equal(worktree.received.length, 1);
  assert.equal(worktree.received[0].details.cwd, other);
  assert.equal(messages.length, 1);

  process.env.HOME = home;
  try { await commands.get('zed').handler('', ctx); } finally { process.env.HOME = previousHome; }
  const duplicate = await session(temp, 'Second session');
  await run('add', 'Command binding survives another pane opening\n');
  const bound = await run('send');
  assert.equal(bound.code, 0, bound.output);
  assert.doesNotMatch(bound.output, /Multiple Pi sessions/);
  assert.equal(messages.length, 2);
  assert.equal(duplicate.received.length, 0);
  await duplicate.bind();
  await run('add', 'Command in second pane replaces destination\n');
  const rebound = await run('send');
  assert.equal(rebound.code, 0, rebound.output);
  assert.doesNotMatch(rebound.output, /Multiple Pi sessions/);
  assert.equal(messages.length, 2);
  assert.equal(duplicate.received.length, 1);
  process.env.HOME = home;
  try { await commands.get('zed').handler('', ctx); } finally { process.env.HOME = previousHome; }
  await run('add', 'Command takes destination back\n');
  assert.equal((await run('send')).code, 0);
  assert.equal(messages.length, 3);
  assert.equal(duplicate.received.length, 1);
  assert.equal((await request(endpoint, batch)).type, 'accepted');
  await duplicate.bind();
  assert.equal((await request(endpoint, batch)).type, 'error', 'replaced receiver rejects even direct deliveries');
  await duplicate.stop();
  await run('add', 'Closed destination must not fall back\n');
  const closed = await run('send', '1\n');
  assert.equal(closed.code, 1);
  assert.match(closed.output, /unavailable/);
  assert.equal(JSON.parse(await readFile(queuePath, 'utf8')).length, 1);
  await rm(`${directory}/route-${instance}.json`);
  assert.equal((await run('send', '1\n')).code, 1, 'sole live session is not an implicit destination');
  process.env.HOME = home;
  try { await commands.get('zed').handler('', ctx); } finally { process.env.HOME = previousHome; }
  assert.equal((await run('send')).code, 0);
  await events.get('session_start')({}, ctx);
  await run('add', 'Reload requires rebinding\n');
  assert.equal((await run('send')).code, 1);
  await writeFile(queuePath, '[]');

  worktree.context.cwd = temp;
  await worktree.restart();
  await run('add', 'Old worktree must not receive after moving\n', { ZED_WORKTREE_ROOT: other });
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 1);
  await worktree.stop();
  const replacement = await session(other, 'Herdr replacement');
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 1);
  await replacement.bind();
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: other })).code, 0);
  assert.equal(replacement.received.length, 1, 'replacement requires explicit /zed');

  const alias = `${temp}/alias`;
  await symlink(other, alias);
  await run('add', 'Canonical path\n', { ZED_WORKTREE_ROOT: alias });
  assert.equal((await run('send', '', { ZED_WORKTREE_ROOT: alias })).code, 0);
  assert.equal(replacement.received.length, 2);
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
  console.log('PASS: exact project/worktree routing, no-match retention, exclusive explicit binding, no fallback, session relocation/replacement, canonical paths, window isolation, capture, rendering, deduplication, and shutdown');
} finally {
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try { await commands.get('zed').handler('disconnect', ctx); } finally { process.env.HOME = previousHome; }
  if (instance) {
    for (const name of await readdir(directory)) {
      if (name === `route-${instance}.json` || name.startsWith(`route-${instance}-`)) await rm(`${directory}/${name}`, { force: true });
    }
  }
  for (const stop of extra) await stop();
  await events.get('session_shutdown')();
  process.env.PATH = previousPath;
  await rm(temp, { recursive: true, force: true });
}
