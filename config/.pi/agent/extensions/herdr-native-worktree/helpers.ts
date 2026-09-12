import { basename } from "node:path";

export type HerdrWorktreeResult = {
  result?: {
    already_open?: boolean;
    root_pane?: { pane_id?: string };
    workspace?: { workspace_id?: string };
    tab?: { tab_id?: string; workspace_id?: string };
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
  tabId: string;
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
  const tabId = parsed.result?.tab?.tab_id;
  if (!paneId || !workspaceId || !path || !tabId) {
    throw new Error("Herdr worktree response omitted the workspace, tab, root pane, or checkout path");
  }
  return {
    paneId,
    workspaceId,
    path,
    tabId,
    branch: parsed.result?.worktree?.branch,
    alreadyOpen: parsed.result?.already_open ?? false,
  };
}

export function parseHerdrTabCreateResult(raw: string): { paneId: string; tabId: string; workspaceId: string } {
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
  const tabId = parsed.result?.tab?.tab_id;
  const workspaceId = parsed.result?.tab?.workspace_id;
  if (!paneId || !tabId || !workspaceId) {
    throw new Error("Herdr tab response omitted the workspace, tab, or root pane");
  }
  return { paneId, tabId, workspaceId };
}

export function parseHerdrTabCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { result?: { tabs?: unknown[] }; error?: { message?: string } };
    if (parsed.error) throw new Error(parsed.error.message ?? "unknown error");
    if (!Array.isArray(parsed.result?.tabs)) throw new Error("missing tabs");
    return parsed.result.tabs.length;
  } catch (error) {
    throw new Error(`Could not parse Herdr tab list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseHerdrTabPaneCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { result?: { tab?: { pane_count?: number } }; error?: { message?: string } };
    if (parsed.error) throw new Error(parsed.error.message ?? "unknown error");
    const count = parsed.result?.tab?.pane_count;
    if (!Number.isInteger(count) || count! < 1) throw new Error("missing pane count");
    return count!;
  } catch (error) {
    throw new Error(`Could not parse Herdr tab: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  environment: Record<string, string> = {},
): string {
  if (platform === "win32") {
    const env = Object.entries(environment)
      .map(([key, value]) => `$env:${key} = ${powershellQuote(value)}; `)
      .join("");
    const args = ["--session", sessionFile, message].map(powershellQuote).join(" ");
    return `${env}Set-Location -LiteralPath ${powershellQuote(checkoutPath)} -ErrorAction Stop; & pi ${args}`;
  }
  const command = [
    ...(Object.keys(environment).length > 0 ? ["env", ...Object.entries(environment).map(([key, value]) => `${key}=${value}`)] : []),
    "pi",
    "--session",
    sessionFile,
    message,
  ].map(posixShellQuote).join(" ");
  return `cd ${posixShellQuote(checkoutPath)} && exec ${command}`;
}
