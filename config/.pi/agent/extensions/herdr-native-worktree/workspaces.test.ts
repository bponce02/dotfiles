import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { mainCheckout, parentCheckout } from "./helpers.ts";
import { ensureParentWorkspace, preserveParentWorkspace, resolveCheckouts, selectParentTarget } from "./workspaces.ts";

const exec = promisify(execFile);
const git = async (cwd: string, args: string[]) => (await exec("git", args, { cwd })).stdout;
const parent = { workspaceId: "w1", paneId: "w1:p1", tabId: "w1:t1", path: "/repo", alreadyOpen: true };
const tabResponse = JSON.stringify({ result: { tab: { tab_id: "w1:t2", workspace_id: "w1" }, root_pane: { pane_id: "w1:p2" } } });

async function repository(root: string, name: string) {
  const path = join(root, name);
  await mkdir(path);
  await git(path, ["init", "--initial-branch=main"]);
  await git(path, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Initial"]);
  return path;
}

test("resolves root, nested cwd, linked checkout and a worktree container through Git", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "herdr-parent-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = await repository(root, "repo");
  const container = join(root, "worktrees");
  await mkdir(container);
  const feature = join(container, "feature");
  await git(repo, ["worktree", "add", "-b", "feature", feature]);
  await git(repo, ["worktree", "add", "-b", "other", join(container, "other")]);
  const nested = join(feature, "nested");
  await mkdir(nested);
  for (const [cwd, expected] of [[repo, repo], [feature, feature], [nested, feature], [container, repo]]) {
    const resolved = await resolveCheckouts(cwd, git);
    assert.equal(resolved.source, expected);
    assert.equal(mainCheckout(resolved.worktrees).path, repo);
  }
  const unrelated = await repository(root, "unrelated");
  await git(unrelated, ["worktree", "add", "-b", "foreign", join(container, "foreign")]);
  await assert.rejects(resolveCheckouts(container, git), /unique repository/);
});

test("does not guess a repository for an empty non-Git folder", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "herdr-empty-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(resolveCheckouts(root, git), /unique repository/);
});

test("main checkout is Git's first record, not a path-name heuristic", () => {
  const trees = [{ path: "/home/me/.herdr/worktrees/main", branch: "main" }, { path: "/elsewhere/feature", branch: "feature" }];
  assert.equal(parentCheckout(trees, trees[1].path), trees[0]);
  assert.throws(() => parentCheckout(trees, trees[0].path), /Already in/);
  assert.throws(() => mainCheckout([{ path: "/bare", bare: true }, trees[1]]), /no main working checkout/);
  assert.throws(() => mainCheckout([]), /no main working checkout/);
});

function openResponse() {
  return JSON.stringify({ result: {
    workspace: { workspace_id: "w1" }, tab: { tab_id: "w1:t1" }, root_pane: { pane_id: "w1:p1" },
    worktree: { path: "/repo", branch: "main" }, already_open: true,
  } });
}

test("ensures and validates native parent membership before handing off", async () => {
  const calls: string[][] = [];
  const result = await ensureParentWorkspace(async (args) => {
    calls.push(args);
    if (args[0] === "worktree") return openResponse();
    return JSON.stringify({ result: { workspace: { worktree: { checkout_path: "/repo", repo_root: "/repo", is_linked_worktree: false } } } });
  }, "/repo");
  assert.equal(result.workspaceId, "w1");
  assert.deepEqual(calls, [
    ["worktree", "open", "--cwd", "/repo", "--path", "/repo", "--no-focus"],
    ["workspace", "get", "w1"],
  ]);
});

for (const membership of [undefined, { checkout_path: "/feature", repo_root: "/repo", is_linked_worktree: true }, { checkout_path: "/wrong", repo_root: "/wrong", is_linked_worktree: false }]) {
  test(`rejects invalid parent membership: ${JSON.stringify(membership)}`, async () => {
    await assert.rejects(ensureParentWorkspace(async (args) => args[0] === "worktree" ? openResponse()
      : JSON.stringify({ result: { workspace: { worktree: membership } } }), "/repo"), /main checkout/);
  });
}

test("keeps the sole parent alive with a shell tab before the source process exits", async () => {
  const calls: string[][] = [];
  assert.equal(await preserveParentWorkspace(async (args) => { calls.push(args); return tabResponse; }, parent, "w1", 1, 1), 2);
  assert.deepEqual(calls, [["tab", "create", "--workspace", "w1", "--cwd", "/repo", "--no-focus"]]);
});

test("does not add anchors when siblings remain or the source is not the parent", async () => {
  const unexpected = async () => { throw new Error("Unexpected command"); };
  assert.equal(await preserveParentWorkspace(unexpected, parent, "w1", 2, 1), 2);
  assert.equal(await preserveParentWorkspace(unexpected, parent, "w1", 1, 2), 1);
  assert.equal(await preserveParentWorkspace(unexpected, parent, "w2", 1, 1), 1);
});

test("finish uses a new tab in an existing parent instead of any remembered agent pane", async () => {
  const calls: string[][] = [];
  const target = await selectParentTarget(async (args) => { calls.push(args); return tabResponse; }, parent);
  assert.deepEqual(target, { workspaceId: "w1", tabId: "w1:t2", paneId: "w1:p2" });
  assert.deepEqual(calls, [["tab", "create", "--workspace", "w1", "--cwd", "/repo", "--no-focus"]]);
});

test("finish can use the new shell when a missing parent has just been reopened", async () => {
  const target = await selectParentTarget(async () => { throw new Error("Unexpected command"); }, { ...parent, alreadyOpen: false });
  assert.deepEqual(target, { workspaceId: "w1", tabId: "w1:t1", paneId: "w1:p1" });
});
