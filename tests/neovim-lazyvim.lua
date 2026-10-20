vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy" })
require("lazy").load({ plugins = { "nvim-lspconfig", "blink.cmp", "nvim-ts-autotag" } })

local config = require("lazy.core.config")
assert(config.plugins.LazyVim, "LazyVim is missing")
assert(not config.plugins["base16-nvim"], "Legacy theme must not override Noctalia")
assert(vim.g.lazyvim_python_lsp == "basedpyright")
assert(vim.g.autoformat == false)
assert(vim.g.colors_name == "noctalia")
assert(package.loaded.pi_bridge, "Pi bridge did not load")
assert(vim.uv.fs_stat("/tmp/pi-neovim-" .. vim.uv.getuid() .. "/" .. vim.fn.getpid() .. ".sock"))

for _, key in ipairs({ " aa", " al", " as", " e", " p", "  ", " /", " sk", " gg", " gv", " gV", " gq", " ?" }) do
  assert(vim.fn.maparg(key, "n") ~= "", "Missing mapping: " .. key)
end
assert(vim.fn.maparg("<C-s>", "i") ~= "")
assert(vim.fn.maparg(" aa", "x") ~= "")

for _, name in ipairs({ "svelte", "vtsls", "gopls", "basedpyright", "ruff", "tailwindcss" }) do
  assert(vim.lsp.is_enabled(name), "Disabled language server: " .. name)
end
assert(not vim.lsp.is_enabled("ts_ls"), "Duplicate TypeScript server enabled")
for _, language in ipairs({ "svelte", "typescript", "javascript", "go", "python", "html", "css" }) do
  assert(vim.treesitter.language.add(language), "Missing parser: " .. language)
end

local snacks = require("lazy.core.plugin").values(config.plugins["snacks.nvim"], "opts", false)
local projects = snacks.dashboard.sections[3]().dirs()
for i = 2, #projects do
  local previous = vim.uv.fs_stat(projects[i - 1]).mtime.sec
  local current = vim.uv.fs_stat(projects[i]).mtime.sec
  assert(previous >= current, "Dashboard projects must be newest first")
end

local blink = require("blink.cmp.config")
assert(blink.keymap.preset == "enter")
assert(blink.keymap["<C-y>"][1] == "select_and_accept")
assert(vim.diagnostic.config().virtual_text == false)
print("PASS: LazyVim, language servers, parsers, completion, shortcuts, and Pi bridge")
