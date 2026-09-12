import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPiCommand,
  parentCheckout,
  parseGitWorktreePorcelain,
  parseHerdrTabCount,
  parseHerdrTabCreateResult,
  parseHerdrTabPaneCount,
  parseHerdrWorktreeResult,
} from "./helpers.ts";

test("parses native Herdr worktree create/open responses", () => {
  const parsed = parseHerdrWorktreeResult(JSON.stringify({
    result: {
      already_open: false,
      root_pane: { pane_id: "w2:p1" },
      workspace: { workspace_id: "w2" },
      tab: { tab_id: "w2:t1", workspace_id: "w2" },
      worktree: { branch: "feature/native", path: "/repo-feature" },
    },
  }));
  assert.deepEqual(parsed, {
    paneId: "w2:p1",
    workspaceId: "w2",
    path: "/repo-feature",
    tabId: "w2:t1",
    branch: "feature/native",
    alreadyOpen: false,
  });
});

test("rejects incomplete Herdr responses", () => {
  assert.throws(() => parseHerdrWorktreeResult('{"result":{}}'), /omitted/);
  assert.throws(
    () => parseHerdrWorktreeResult('{"error":{"code":"bad","message":"nope"}}'),
    /bad: nope/,
  );
});

test("parses native Herdr tab responses", () => {
  assert.deepEqual(parseHerdrTabCreateResult(JSON.stringify({
    result: {
      root_pane: { pane_id: "w1:p2" },
      tab: { tab_id: "w1:t2", workspace_id: "w1" },
    },
  })), { paneId: "w1:p2", tabId: "w1:t2", workspaceId: "w1" });
  assert.equal(parseHerdrTabCount(JSON.stringify({ result: { tabs: [{}, {}] } })), 2);
  assert.equal(parseHerdrTabPaneCount(JSON.stringify({ result: { tab: { pane_count: 3 } } })), 3);
});

test("parses git worktree porcelain and finds a parent checkout", () => {
  const worktrees = parseGitWorktreePorcelain([
    "worktree /repo",
    "HEAD abc",
    "branch refs/heads/dev",
    "",
    "worktree /home/me/.herdr/worktrees/repo/worktree-feature",
    "HEAD def",
    "branch refs/heads/feature/native",
    "",
  ].join("\n"));
  assert.deepEqual(worktrees, [
    { path: "/repo", branch: "dev" },
    { path: "/home/me/.herdr/worktrees/repo/worktree-feature", branch: "feature/native" },
  ]);
  assert.equal(parentCheckout(worktrees, worktrees[1].path).path, "/repo");
});

test("builds quoted POSIX and PowerShell Pi handoff commands", () => {
  assert.equal(
    buildPiCommand("/tmp/it's.jsonl", "/tmp/work tree", "Continue", "linux"),
    "cd '/tmp/work tree' && exec 'pi' '--session' '/tmp/it'\"'\"'s.jsonl' 'Continue'",
  );
  assert.equal(
    buildPiCommand("C:\\it's.jsonl", "C:\\work tree", "Continue", "win32"),
    "Set-Location -LiteralPath 'C:\\work tree' -ErrorAction Stop; & pi '--session' 'C:\\it''s.jsonl' 'Continue'",
  );
  assert.equal(
    buildPiCommand("/tmp/s.jsonl", "/repo", "Continue", "linux", { PI_HERDR_RETURN_TAB_ID: "w1:t2" }),
    "cd '/repo' && exec 'env' 'PI_HERDR_RETURN_TAB_ID=w1:t2' 'pi' '--session' '/tmp/s.jsonl' 'Continue'",
  );
});
