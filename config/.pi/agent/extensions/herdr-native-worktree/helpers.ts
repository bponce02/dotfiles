import { basename } from "node:path";

export type HerdrWorktreeResult = {
  result?: {
    already_open?: boolean;
    root_pane?: { pane_id?: string };
    workspace?: { workspace_id?: string };
    worktree?: { branch?: string; path?: string };
  };
  error?: { code?: string; message?: string };
};

export type GitWorktree = {
  path: string;
  branch?: string;
  bare?: boolean;
};

export function parseHerdrWorktreeResult(raw: string): {
  paneId: string;
  workspaceId: string;
  path: string;
  branch?: string;
  alreadyOpen: boolean;
} {
  let parsed: HerdrWorktreeResult;
  try {
    parsed = JSON.parse(raw) as HerdrWorktreeResult;
  } catch {
    throw new Error(`Herdr returned non-JSON output: ${raw}`);
  }
  if (parsed.error) {
    throw new Error(`${parsed.error.code ?? "herdr_error"}: ${parsed.error.message ?? "unknown error"}`);
  }
  const paneId = parsed.result?.root_pane?.pane_id;
  const workspaceId = parsed.result?.workspace?.workspace_id;
  const path = parsed.result?.worktree?.path;
  if (!paneId || !workspaceId || !path) {
    throw new Error("Herdr worktree response omitted the workspace, root pane, or checkout path");
  }
  return {
    paneId,
    workspaceId,
    path,
    branch: parsed.result?.worktree?.branch,
    alreadyOpen: parsed.result?.already_open ?? false,
  };
}

export function parseGitWorktreePorcelain(raw: string): GitWorktree[] {
  return raw
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((record) => {
      const entry: GitWorktree = { path: "" };
      for (const line of record.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") entry.path = value;
        else if (key === "branch") entry.branch = value.replace(/^refs\/heads\//, "");
        else if (key === "bare") entry.bare = true;
      }
      return entry;
    })
    .filter((entry) => entry.path);
}

export function parentCheckout(worktrees: GitWorktree[], currentPath: string): GitWorktree {
  const parent = worktrees.find((entry) => !entry.bare && entry.path !== currentPath && !entry.path.includes("/.herdr/worktrees/"))
    ?? worktrees.find((entry) => !entry.bare && entry.path !== currentPath);
  if (!parent) throw new Error("Could not identify the repository's parent checkout");
  return parent;
}

export function defaultBranchName(sourceCheckout: string): string {
  const project = basename(sourceCheckout).replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const suffix = Math.random().toString(16).slice(2, 6);
  return `worktree/${project}-${suffix}`;
}

export function posixShellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildPiCommand(
  sessionFile: string,
  checkoutPath: string,
  message: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const args = ["--session", sessionFile, message].map(powershellQuote).join(" ");
    return `Set-Location -LiteralPath ${powershellQuote(checkoutPath)} -ErrorAction Stop; & pi ${args}`;
  }
  const args = ["pi", "--session", sessionFile, message].map(posixShellQuote).join(" ");
  return `cd ${posixShellQuote(checkoutPath)} && exec ${args}`;
}
