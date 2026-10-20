# Neovim: LazyVim with personal configuration

The editor now uses LazyVim, with the existing Noctalia appearance and Neovim–Pi bridge layered on top. The pre-migration custom configuration is committed as `94ced4b`; the Pi bridge was already committed in `64e7ce7`. The experimental Zed ACP bridge has been removed.

## Configuration

Everything is under `config/.config/nvim`:

- `init.lua`: loads the LazyVim bootstrap.
- `lua/config/lazy.lua`: lazy.nvim bootstrap and LazyVim plugin imports.
- `lua/config/options.lua`: editor preferences, Neo-tree/Snacks selection, and Python LSP choice.
- `lua/config/keymaps.lua`: save shortcut and Pi bridge initialization after LazyVim's mappings.
- `lua/config/autocmds.lua`: full diagnostics on cursor pause.
- `lua/config/noctalia.lua`: colorscheme selection and palette hot reload.
- `lua/plugins/personal.lua`: existing explorer, tabs, breadcrumbs, project selection, and Git shortcuts.
- `lua/plugins/languages.lua`: quiet diagnostics, Python virtualenv resolution, and parsers.
- `lazyvim.json`: extras managed by `:LazyExtras`.
- `lazy-lock.json`: pinned plugin revisions, including LazyVim.

The old machine-local base16 plugin is explicitly disabled so it cannot override Noctalia when LazyVim imports the plugins directory.

## What LazyVim manages

LazyVim supplies completion/snippets, automatic tag closing, Mason, language-server setup, formatting integration, Git signs, diagnostics lists, command/search popups, and the statusline. It also provides its standard navigation, window, buffer, and code-action mappings.

Enabled language extras: Go, Python, JavaScript/TypeScript, Svelte, Tailwind, and JSON. The Prettier extra is available for manual formatting. TypeScript uses LazyVim's `vtsls` instead of the old `ts_ls`; Python uses `basedpyright` plus Ruff. Go retains gofumpt/staticcheck and golangci-lint through the Go extra.

Format-on-save remains **off** to preserve the previous behavior. Use `Space cf` to format explicitly, or `Space uf` to toggle autoformat. Python type-checking mode remains off, and a project `.venv/bin/python` is used when present. `:VenvSelect` is also available.

## Familiar shortcuts

- `Space e`: focus the explorer; close it when already inside it.
- `Space Space`: smart file finder.
- `Space /`: project search.
- `Space p`: project picker; selection opens the project tree.
- `Space sk`: search keybindings; `Space ?`: buffer-local shortcut help.
- `Space gg`: Lazygit.
- `Space gv`, `Space gV`, `Space gq`: project diff, current-file diff, close diff.
- `gd`, `gI`, `gr`, `K`: definition, implementation, references, documentation.
- `Ctrl+s`: save and leave insert mode.
- `Space aa`, `Space al`, `Space as`: add, review, and send questions to Pi. Run `/neovim` in the desired Pi session to connect it.

Completion follows LazyVim's Enter preset: `Ctrl+n`/`Ctrl+p` move through suggestions, `Enter` or `Ctrl+y` accepts, `Ctrl+Space` requests completion, and Tab handles snippet movement. Typing `>` closes Svelte/HTML tags. LSP tag-name completion and whole-block snippets are still different operations.

## Appearance

Noctalia reads the active dark/light variant from Zed's `~/.config/zed/themes/noctalia.json`. Syntax colors, sidebar, tabs, breadcrumbs, selection, and gutter follow that palette. Noctalia's built-in values remain the fallback when the Zed theme is unavailable; if Noctalia itself fails, Tokyo Night is used. Palette changes reload automatically.

The familiar 28-column Neo-tree, clickable tabs, Dropbar breadcrumbs, absolute line numbers, and no-wrap layout remain. Diagnostics use underlines and hover rather than inline text. LazyVim now supplies the statusline and floating command/search UI.

Font rendering and size still belong to the terminal; the existing Ghostty font configuration was not changed.

## Install and maintain

Link the entire tracked Neovim configuration using the repository's Stow setup, including the new `lua/config`, `lua/plugins`, and `lazyvim.json` files. Keep the existing `lua/pi_bridge.lua`, `lua/zed_look.lua`, and `colors/noctalia.lua` links.

Restart Neovim after migration. `:Lazy` manages plugins, `:Mason` manages language tools, and `:LazyExtras` manages optional features. Mason and Tree-sitter install the configured servers/tools/parsers automatically. Tree-sitter requires a C compiler and the `tree-sitter` CLI; the current machine has CLI 0.27.0.

The old configuration can be restored without deleting the modular files (the old entry point does not load them):

```sh
git restore --source=94ced4b -- config/.config/nvim/init.lua config/.config/nvim/lazy-lock.json
```

Restart Neovim and run `:Lazy restore` to restore the checkpoint's plugin revisions. This overwrites subsequent changes to those two files, so commit anything you want to keep first.

## Verification

From the dotfiles repository:

```sh
nvim --headless '+lua local ok, err = pcall(dofile, "tests/neovim-lazyvim.lua"); if not ok then print(err); vim.cmd.cquit() end' +qa
nvim --headless '+lua local ok, err = pcall(dofile, "tests/neovim-appearance.lua"); if not ok then print(err); vim.cmd.cquit() end' +qa
node --test tests/neovim-pi.test.ts
```

Checks cover LazyVim loading, language-server enablement, parsers, completion bindings, existing shortcuts, the Pi socket, both Noctalia palettes, and project selection. The Pi tests check actual Neovim question delivery and ensure responses never overwrite buffers.

A real Ghostty/Neovim window was also tested on an isolated X11 desktop: Svelte and Tailwind attached, Svelte supplied `count` completion, Ctrl+y accepted it, and typing `<script>` inserted `</script>`. Test edits were confined to unsaved buffers and discarded.
