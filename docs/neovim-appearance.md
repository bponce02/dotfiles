# Neovim appearance

Neovim reads the active dark/light variant from Zed's `~/.config/zed/themes/noctalia.json`. Syntax colors, sidebar, tabs, breadcrumbs, selection, and gutter follow that palette; Noctalia's original colors remain the fallback when the Zed theme is unavailable. Palette file changes reload automatically.

- Neo-tree: 28-column sidebar, compact Git-colored names, visible dotfiles, no diagnostic badges.
- Bufferline: clickable file tabs without close-button clutter.
- Dropbar: clickable path and function/type breadcrumbs.
- Tree-sitter: syntax-aware highlighting.
- Absolute line numbers, subtle current-line highlighting, no soft wrapping, and a minimal shared status line. Diagnostics keep underlines and their existing hover popup, but no inline text.
- Existing keybindings remain unchanged, including `<leader>e` for the tree and `<leader>p` for projects. Project selection opens the tree without another picker.

Font size and font rendering belong to the terminal. Ghostty's existing 12-point font is unchanged. Terminal cells cannot reproduce Zed's independent sidebar font sizing or pixel spacing exactly.

## Installation

Link `init.lua`, `colors/noctalia.lua`, `lua/zed_look.lua`, and `lazy-lock.json` from the repository's `config/.config/nvim` into `~/.config/nvim`. Keep the existing `lua/pi_bridge.lua` link. Lazy installs the plugins; the lockfile records their versions.

Tree-sitter requires a C compiler and the upstream `tree-sitter` CLI (0.26.1 or newer). This machine uses CLI 0.27.0 at `~/.local/bin/tree-sitter`. Install parsers on a new machine with:

```sh
nvim --headless '+lua require("nvim-treesitter").install({"typescript", "tsx", "javascript", "lua", "python", "go", "json", "bash", "markdown", "markdown_inline", "vim", "vimdoc"}):wait(300000)' +qa
```

Run appearance checks from the dotfiles repository:

```sh
nvim --headless '+luafile tests/neovim-appearance.lua' +qa
```

The pre-appearance configuration is checkpoint commit `64e7ce7`.
