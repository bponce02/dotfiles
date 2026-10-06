import { access, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { parseGitWorktreePorcelain, parseHerdrTabCreateResult, parseHerdrWorktreeResult } from "./helpers.ts";
import type { GitWorktree } from "./helpers.ts";

type RunGit = (cwd: string, args: string[]) => Promise<string>;
export type RunHerdr = (args: string[]) => Promise<string>;

export async function resolveCheckouts(cwd: string, git: RunGit): Promise<{ source: string; worktrees: GitWorktree[] }> {
  const directory = await realpath(cwd);
  try {
    const source = (await git(directory, ["rev-parse", "--show-toplevel"])).trim();
    return { source, worktrees: parseGitWorktreePorcelain(await git(source, ["worktree", "list", "--porcelain"])) };
  } catch (error) {
    const repositories = new Map<string, GitWorktree[]>();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = join(directory, entry.name);
      try {
        await access(join(child, ".git"));
        const worktrees = parseGitWorktreePorcelain(await git(child, ["worktree", "list", "--porcelain"]));
        const parent = worktrees[0];
        if (parent && !parent.bare) repositories.set(parent.path, worktrees);
      } catch {
        continue;
      }
    }
    if (repositories.size !== 1) {
      throw new Error(`Cannot resolve a unique repository from ${directory}; open the repository checkout explicitly. ${error instanceof Error ? error.message : String(error)}`);
    }
    const [source, worktrees] = [...repositories][0];
    return { source, worktrees };
  }
}

export async function ensureParentWorkspace(run: RunHerdr, parentPath: string) {
  const parent = parseHerdrWorktreeResult(await run([
    "worktree", "open", "--cwd", parentPath, "--path", parentPath, "--no-focus",
  ]));
  const response = JSON.parse(await run(["workspace", "get", parent.workspaceId]));
  const membership = response.result?.workspace?.worktree;
  if (parent.path !== parentPath || membership?.is_linked_worktree !== false
    || membership.checkout_path !== parentPath || membership.repo_root !== parentPath) {
    throw new Error("Herdr did not attach the parent workspace to the repository's main checkout");
  }
  return parent;
}

export async function preserveParentWorkspace(
  run: RunHerdr,
  parent: Awaited<ReturnType<typeof ensureParentWorkspace>>,
  sourceWorkspace: string,
  tabCount: number,
  paneCount: number,
): Promise<number> {
  if (parent.workspaceId !== sourceWorkspace || tabCount > 1 || paneCount > 1) return tabCount;
  parseHerdrTabCreateResult(await run([
    "tab", "create", "--workspace", parent.workspaceId, "--cwd", parent.path, "--no-focus",
  ]));
  return tabCount + 1;
}

export async function selectParentTarget(
  run: RunHerdr,
  parent: Awaited<ReturnType<typeof ensureParentWorkspace>>,
) {
  if (!parent.alreadyOpen) {
    return { workspaceId: parent.workspaceId, tabId: parent.tabId, paneId: parent.paneId };
  }
  return parseHerdrTabCreateResult(await run([
    "tab", "create", "--workspace", parent.workspaceId, "--cwd", parent.path, "--no-focus",
  ]));
}
