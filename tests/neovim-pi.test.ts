import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import extension, { connect, prompt } from "../config/.pi/agent/extensions/neovim/index.ts";
import { initTheme, theme } from "../config/.pi/agent/extensions/neovim/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { visibleWidth } from "../config/.pi/agent/extensions/neovim/node_modules/@earendil-works/pi-tui/dist/index.js";

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(20); }
  assert.fail("Timed out waiting for condition");
}

test("ignores full buffers from older editors", () => {
  const text = prompt({
    type: "questions", id: 1, cwd: "/project",
    targets: [{ path: "/project/example.py", start_line: 1, end_line: 1, question: "Why?", lines: ["selected"] }],
    buffers: [{ path: "/project/example.py", lines: ["selected", "private unselected code"] }],
  });
  assert.ok(text.includes("selected"));
  assert.ok(!text.includes("private unselected code"));
  assert.ok(!text.includes('"buffers"'));
});

test("rejects malformed questions", () => {
  assert.throws(() => prompt({ type: "questions", id: 1, targets: [] }));
  assert.throws(() => prompt({ type: "questions", id: 1, cwd: "/", targets: [null], buffers: [] }));
});

test("real Neovim sends only annotated lines, retains failed questions, and never applies replies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-nvim-test-"));
  const rpc = join(dir, "rpc.sock");
  const child = spawn("nvim", ["--headless", "-u", "NONE", "--listen", rpc,
    "--cmd", `set rtp+=${resolve("config/.config/nvim")}`,
    "+lua vim.g.mapleader=' '; require('pi_bridge').setup()"], { stdio: "ignore" });
  const path = `/tmp/pi-neovim-${process.getuid!()}/${child.pid}.sock`;
  const lua = (code: string) => execFileSync("nvim", ["--server", rpc, "--remote-expr", `luaeval(${JSON.stringify(code)})`], { encoding: "utf8" }).trim();
  const commands = new Map<string, any>();
  const events = new Map<string, any>();
  const messages: string[] = [];
  const cards: any[] = [];
  let renderer: any;
  const statuses: unknown[] = [];
  let fail = false;
  extension({
    registerCommand: (name: string, command: any) => commands.set(name, command),
    on: (name: string, handler: any) => events.set(name, handler),
    registerMessageRenderer: (name: string, render: any) => {
      assert.equal(name, "neovim-questions");
      renderer = render;
    },
    sendMessage: (message: any, options: any) => {
      if (fail) throw new Error("test failure");
      assert.equal(options.deliverAs, "followUp");
      assert.equal(options.triggerTurn, true);
      assert.equal(message.customType, "neovim-questions");
      assert.equal(message.display, true);
      messages.push(message.content);
      cards.push(message);
    },
  } as any);
  const ctx = { hasUI: true, ui: {
    notify: () => {},
    setStatus: (_key: string, value: unknown) => statuses.push(value),
    select: async (_title: string, labels: string[]) => labels.find((label) => label.endsWith(`PID ${child.pid}`)),
  } };
  const command = commands.get("neovim").handler;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { const socket = await connect(path, () => {}); socket.destroy(); ready = true; break; }
      catch { await delay(30); }
    }
    assert.ok(ready);
    lua(`(function() vim.api.nvim_buf_set_name(0, '${dir}/sample.lua'); vim.api.nvim_buf_set_lines(0, 0, -1, false, {'before', 'unsaved target', 'after'}); vim.api.nvim_win_set_cursor(0, {2, 0}); vim.ui.input = function(_, cb) cb('Explain this line') end; require('pi_bridge').add(false); return true end)()`);
    lua("require('pi_bridge').send()");
    assert.equal(messages.length, 0);
    await command("", ctx);
    await until(() => statuses.some(Boolean));
    lua("require('pi_bridge').send()");
    await until(() => messages.length === 1);
    await delay(60);
    const snapshot = JSON.parse(messages[0].slice(messages[0].indexOf('{')));
    assert.equal(snapshot.targets[0].start_line, 2);
    assert.deepEqual(snapshot.targets[0].lines, ["unsaved target"]);
    assert.equal(snapshot.targets[0].path, `${dir}/sample.lua`);
    assert.equal(snapshot.buffers, undefined);
    assert.ok(!messages[0].includes('"before"'));
    assert.ok(!messages[0].includes('"after"'));
    assert.match(messages[0], /Do not edit or save files/);
    initTheme("dark", false);
    for (const width of [40, 100]) {
      const rendered = renderer(cards[0], { expanded: false, outputPad: 1 }, theme).render(width);
      assert.ok(rendered.every((line: string) => visibleWidth(line) <= width));
      const text = rendered.join("\n");
      assert.match(text, /Neovim/);
      assert.match(text, /Explain this line/);
      assert.ok(!text.includes("Do not edit or save files"));
      assert.ok(!text.includes('"targets"'));
    }
    const longCard = structuredClone(cards[0]);
    longCard.details.targets[0].lines = Array.from({ length: 20 }, (_, i) => `line_${i}`);
    const collapsed = renderer(longCard, { expanded: false, outputPad: 1 }, theme).render(100).join("\n");
    const expanded = renderer(longCard, { expanded: true, outputPad: 1 }, theme).render(100).join("\n");
    assert.match(collapsed, /8 more lines/);
    assert.ok(!collapsed.includes("line_19"));
    assert.match(expanded, /line_19/);
    lua("require('pi_bridge').send()");
    await delay(50);
    assert.equal(messages.length, 1, "acknowledged questions cleared");

    fail = true;
    lua("require('pi_bridge').add(false)");
    lua("require('pi_bridge').send()");
    await delay(80);
    fail = false;
    lua("require('pi_bridge').send()");
    await until(() => messages.length === 2);
    await delay(60);

    lua(`(function() vim.cmd('normal! ggVj'); require('pi_bridge').add(true); return true end)()`);
    lua("require('pi_bridge').send()");
    await until(() => messages.length === 3);
    const visual = JSON.parse(messages[2].slice(messages[2].indexOf('{')));
    assert.deepEqual(visual.targets[0].lines, ["before", "unsaved target"]);
    assert.equal(visual.buffers, undefined);
    assert.ok(!messages[2].includes('"after"'));
    await delay(60);

    const other = await connect(path, () => {});
    other.write('{"type":"assign"}\n');
    await until(() => statuses.at(-1) === undefined);
    other.write('{"type":"response","edits":[{"lines":["BAD"]}]}\n');
    await delay(60);
    assert.equal(lua("vim.api.nvim_buf_get_lines(0, 1, 2, false)[1]"), "unsaved target");
    other.destroy();

    await command("", ctx);
    await until(() => Boolean(statuses.at(-1)));
    await events.get("session_start")({}, ctx);
    await delay(60);
    assert.equal(statuses.at(-1), undefined);
    lua("require('pi_bridge').add(false)");
    lua("require('pi_bridge').send()");
    assert.equal(messages.length, 3);
    await command("", ctx);
    await until(() => Boolean(statuses.at(-1)));
    lua("require('pi_bridge').send()");
    await until(() => messages.length === 4);
    await command("disconnect", ctx);
    assert.equal(statuses.at(-1), undefined);
    assert.equal(lua("vim.fn.maparg('<Space>ar', 'n')"), "");
  } finally {
    events.get("session_shutdown")();
    child.kill("SIGTERM");
    await new Promise<void>((done) => { if (child.exitCode !== null) done(); else child.once("exit", () => done()); });
    rmSync(dir, { recursive: true, force: true });
  }
});
