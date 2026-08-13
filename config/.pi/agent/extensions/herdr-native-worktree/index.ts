import { readFile, realpath, rm, writeFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  buildPiCommand,
  parentCheckout,
  parseGitWorktreePorcelain,
  parseHerdrWorktreeResult,
} from "./helpers.ts";

type ExecSignal = AbortSignal | undefined;

type SessionSnapshot = { file: string; cleanup: () => Promise<void> };

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "herdr_start_worktree",
    label: "Start Native Herdr Worktree",
    description: "Create or open a native Herdr worktree workspace and continue this Pi session there.",
    promptSnippet: "Continue the active Pi session in a native Herdr worktree workspace",
    promptGuidelines: [
      "Use herdr_start_worktree when work should continue in an isolated native Herdr worktree workspace.",
      "Always provide herdr_start_worktree a descriptive branch slug derived from the task.",
    ],
    parameters: Type.Object({
      branch: Type.String({ description: "Feature branch name." }),
      base: Type.Optional(Type.String({ description: "Git ref from which a new branch is created. Defaults to the source checkout's current branch." })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      return startWorktree(pi, ctx, signal, params.branch.trim(), params.base?.trim());
    },
  });

  pi.registerTool({
    name: "herdr_finish_worktree",
    label: "Finish Native Herdr Worktree",
    description: "Merge the current native Herdr worktree branch into its parent checkout, then continue this Pi session in the parent workspace. Requires clean checkouts and committed changes.",
    promptSnippet: "Safely merge a native Herdr worktree branch back into its parent checkout",
    promptGuidelines: [
      "Use herdr_finish_worktree only after changes are committed and the user has asked to merge or finish the worktree.",
      "Never bypass herdr_finish_worktree clean-checkout or merge-conflict safeguards.",
    ],
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "Target branch in the parent checkout. Defaults to the parent checkout's current branch." })),
      strategy: Type.Optional(StringEnum(["merge", "squash"] as const, { description: "Merge strategy. Defaults to merge (--no-ff)." })),
      deleteBranch: Type.Optional(Type.Boolean({ description: "Delete the feature branch after a successful merge. Defaults to true." })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      return finishWorktree(pi, ctx, signal, {
        target: params.target?.trim(),
        strategy: params.strategy ?? "merge",
        deleteBranch: params.deleteBranch ?? true,
      });
    },
  });
}

async function startWorktree(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  signal: ExecSignal,
  requestedBranch: string,
  base?: string,
) {
  assertHerdr();
  if (!requestedBranch) throw new Error("branch must not be empty");
  const currentSession = requireSessionFile(ctx);
  const source = await realpath(ctx.cwd);
  const snapshot = await createSessionSnapshot(ctx.sessionManager);
  let createdWorkspace: string | undefined;
  let newSessionFile: string | undefined;
  let replacementStarted = false;

  ctx.ui.setStatus("herdr-worktree", "creating native worktree");
  try {
    const worktrees = parseGitWorktreePorcelain(
      await git(pi, source, ["worktree", "list", "--porcelain"], signal),
    );
    const existing = worktrees.find((entry) => entry.branch === requestedBranch && entry.path !== source);
    const args = existing
      ? ["worktree", "open", "--cwd", source, "--path", existing.path, "--focus"]
      : ["worktree", "create", "--cwd", source, "--branch", requestedBranch];
    if (!existing && base) args.push("--base", base);
    if (!existing) args.push("--focus");
    const opened = parseHerdrWorktreeResult(await herdr(pi, args, signal, 300_000));
    if (opened.alreadyOpen) {
      throw new Error(`Worktree workspace ${opened.workspaceId} is already open; refusing to replace its pane contents`);
    }
    createdWorkspace = opened.workspaceId;
    newSessionFile = await forkSessionFile(snapshot.file, opened.path);
    const command = buildPiCommand(
      newSessionFile,
      opened.path,
      `Moved to native Herdr worktree ${opened.path}. Continue.`,
    );
    await herdr(pi, ["pane", "run", opened.paneId, command], signal, 10_000);
    replacementStarted = true;
    await scheduleSessionCleanup(pi, currentSession, process.pid);
    ctx.ui.setStatus("herdr-worktree", undefined);
    ctx.shutdown();
    return {
      content: [{ type: "text" as const, text: `Started replacement Pi in native Herdr worktree ${opened.path}\nWorkspace: ${opened.workspaceId}\nBranch: ${opened.branch ?? requestedBranch}` }],
      details: { ...opened, oldSessionFile: currentSession, newSessionFile },
      terminate: true,
    };
  } catch (error) {
    ctx.ui.setStatus("herdr-worktree", undefined);
    if (createdWorkspace && !replacementStarted) {
      await herdr(pi, ["workspace", "close", createdWorkspace], undefined, 10_000).catch(() => undefined);
    }
    if (newSessionFile) await rm(newSessionFile, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await snapshot.cleanup().catch(() => undefined);
  }
}

async function finishWorktree(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  signal: ExecSignal,
  options: { target?: string; strategy: "merge" | "squash"; deleteBranch: boolean },
) {
  assertHerdr();
  const currentSession = requireSessionFile(ctx);
  const currentPath = await realpath(ctx.cwd);
  const worktreesRaw = await git(pi, currentPath, ["worktree", "list", "--porcelain"], signal);
  const worktrees = parseGitWorktreePorcelain(worktreesRaw);
  const current = worktrees.find((entry) => entry.path === currentPath);
  if (!current?.branch) throw new Error("Current checkout is detached or not a Git worktree");
  const parent = parentCheckout(worktrees, currentPath);
  if (!parent.branch) throw new Error("Parent checkout is detached");
  const target = options.target ?? parent.branch;
  if (parent.branch !== target) {
    throw new Error(`Parent checkout is on ${parent.branch}; expected target ${target}. Switch it explicitly before finishing.`);
  }
  await assertClean(pi, currentPath, "feature worktree", signal);
  await assertClean(pi, parent.path, "parent checkout", signal);

  const ahead = Number((await git(pi, parent.path, ["rev-list", "--count", `${target}..${current.branch}`], signal)).trim());
  if (!Number.isFinite(ahead) || ahead < 1) throw new Error(`${current.branch} has no commits to merge into ${target}`);

  ctx.ui.setStatus("herdr-worktree", `merging ${current.branch} into ${target}`);
  const mergeArgs = options.strategy === "squash"
    ? ["merge", "--squash", current.branch]
    : ["merge", "--no-ff", current.branch, "-m", `Merge branch '${current.branch}'`];
  try {
    await git(pi, parent.path, mergeArgs, signal);
    if (options.strategy === "squash") {
      await git(pi, parent.path, ["commit", "-m", `Squash merge branch '${current.branch}'`], signal);
    }
  } catch (error) {
    ctx.ui.setStatus("herdr-worktree", undefined);
    throw new Error(`Merge did not complete; both workspaces were preserved. ${errorMessage(error)}`);
  }

  const snapshot = await createSessionSnapshot(ctx.sessionManager);
  let newSessionFile: string | undefined;
  try {
    const parentWorkspace = parseHerdrWorktreeResult(
      await herdr(pi, ["worktree", "open", "--cwd", parent.path, "--path", parent.path, "--focus"], signal, 10_000),
    );
    newSessionFile = await forkSessionFile(snapshot.file, parent.path);
    await herdr(pi, ["pane", "run", parentWorkspace.paneId, buildPiCommand(
      newSessionFile,
      parent.path,
      `Merged ${current.branch} into ${target}. Continue in the parent checkout.`,
    )], signal, 10_000);
    await scheduleFinishCleanup(pi, currentSession, process.env.HERDR_WORKSPACE_ID!, current.branch, parent.path, options.deleteBranch, process.pid);
    ctx.ui.setStatus("herdr-worktree", undefined);
    ctx.shutdown();
    return {
      content: [{ type: "text" as const, text: `Merged ${current.branch} into ${target}; replacement Pi started in ${parent.path}.` }],
      details: { featureBranch: current.branch, target, parentPath: parent.path, strategy: options.strategy },
      terminate: true,
    };
  } catch (error) {
    ctx.ui.setStatus("herdr-worktree", undefined);
    if (newSessionFile) await rm(newSessionFile, { force: true }).catch(() => undefined);
    throw new Error(`Merge succeeded but session handoff failed; the worktree was preserved. ${errorMessage(error)}`);
  } finally {
    await snapshot.cleanup().catch(() => undefined);
  }
}

function assertHerdr(): void {
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_WORKSPACE_ID) {
    throw new Error("This tool must run inside a Herdr-managed workspace");
  }
}

function requireSessionFile(ctx: ExtensionContext): string {
  const file = ctx.sessionManager.getSessionFile();
  if (!file) throw new Error("The current Pi session is not persisted and cannot be transferred");
  return file;
}

async function assertClean(pi: ExtensionAPI, cwd: string, label: string, signal: ExecSignal): Promise<void> {
  const status = await git(pi, cwd, ["status", "--porcelain"], signal);
  if (status.trim()) throw new Error(`The ${label} is dirty; commit or discard changes before finishing`);
}

async function git(pi: ExtensionAPI, cwd: string, args: string[], signal: ExecSignal): Promise<string> {
  const result = await pi.exec("git", args, { cwd, signal, timeout: 120_000 });
  if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function herdr(pi: ExtensionAPI, args: string[], signal: ExecSignal, timeout: number): Promise<string> {
  const result = await pi.exec("herdr", args, { signal, timeout });
  if (result.code !== 0) throw new Error(`herdr ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim() || result.stderr.trim();
}

async function createSessionSnapshot(sessionManager: Pick<SessionManager, "getEntries" | "getHeader">): Promise<SessionSnapshot> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const header = sessionManager.getHeader();
  if (!header) throw new Error("Current Pi session has no valid header");
  const directory = await mkdtemp(join(tmpdir(), "pi-herdr-native-session-"));
  const file = join(directory, "session.jsonl");
  await writeFile(file, `${[header, ...sessionManager.getEntries()].map(JSON.stringify).join("\n")}\n`, "utf8");
  return { file, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

async function forkSessionFile(source: string, cwd: string): Promise<string> {
  const forked = SessionManager.forkFrom(source, cwd);
  const file = forked.getSessionFile();
  if (!file) throw new Error("Failed to fork the Pi session");
  const lines = (await readFile(file, "utf8")).trimEnd().split("\n");
  const header = JSON.parse(lines[0]);
  delete header.parentSession;
  lines[0] = JSON.stringify(header);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

async function scheduleSessionCleanup(
  pi: ExtensionAPI,
  oldSession: string,
  oldPid: number,
): Promise<void> {
  // The source workspace is the native parent of the worktree group. Keep it open;
  // only retire this Pi process's superseded session file after shutdown.
  const script = `while kill -0 ${oldPid} 2>/dev/null; do sleep 0.1; done; rm -f -- ${shellQuote(oldSession)}`;
  await detach(pi, script);
}

async function scheduleFinishCleanup(
  pi: ExtensionAPI,
  oldSession: string,
  oldWorkspace: string,
  branch: string,
  parentPath: string,
  deleteBranch: boolean,
  oldPid: number,
): Promise<void> {
  const deleteCommand = deleteBranch ? `; git -C ${shellQuote(parentPath)} branch -d ${shellQuote(branch)} >/dev/null 2>&1 || true` : "";
  const script = `while kill -0 ${oldPid} 2>/dev/null; do sleep 0.1; done; rm -f -- ${shellQuote(oldSession)}; herdr worktree remove --workspace ${shellQuote(oldWorkspace)} >/dev/null 2>&1 || true${deleteCommand}`;
  await detach(pi, script);
}

async function detach(pi: ExtensionAPI, script: string): Promise<void> {
  if (process.platform === "win32") throw new Error("Detached workspace cleanup is not implemented on Windows");
  const launcher = `setsid sh -c ${shellQuote(script)} >/dev/null 2>&1 < /dev/null &`;
  const result = await pi.exec("sh", ["-lc", launcher], { timeout: 5_000 });
  if (result.code !== 0) throw new Error(`Failed to schedule workspace cleanup: ${result.stderr || result.stdout}`);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
