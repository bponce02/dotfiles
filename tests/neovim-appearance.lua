assert(vim.g.colors_name == "noctalia")
assert(vim.o.number and not vim.o.relativenumber)
assert(not vim.o.wrap and vim.o.cursorline)
assert(vim.o.laststatus == 3)
assert(vim.diagnostic.config().virtual_text == false)

local file = assert(io.open(vim.fn.expand("~/.config/zed/themes/noctalia.json"), "r"))
local themes = vim.json.decode(file:read("*a")).themes
file:close()
for _, appearance in ipairs({ "light", "dark" }) do
  vim.o.background = appearance
  vim.cmd.colorscheme("noctalia")
  local style
  for _, theme in ipairs(themes) do
    if theme.appearance == appearance then style = theme.style break end
  end
  for group, key in pairs({ Normal = "editor.background", NeoTreeNormal = "panel.background", WinBar = "toolbar.background" }) do
    assert(vim.api.nvim_get_hl(0, { name = group }).bg == tonumber(style[key]:sub(2), 16), group)
  end
  assert(vim.api.nvim_get_hl(0, { name = "Keyword" }).fg == tonumber(style.syntax.keyword.color:sub(2), 16))
end

assert(vim.treesitter.language.add("typescript"))
assert(package.loaded.bufferline)
assert(package.loaded.dropbar)
local projects = require("snacks.picker.config").get({ source = "projects" })
local closed = false
local picked = false
local original = Snacks.picker.files
Snacks.picker.files = function() picked = true end
local directory = vim.fn.tempname() .. " project"
vim.fn.mkdir(directory, "p")
projects.confirm({ close = function() closed = true end }, { file = directory })
assert(vim.wait(1500, function() return vim.bo.filetype == "neo-tree" end))
vim.wait(200, function() return false end)
assert(closed and not picked)
assert(vim.fn.getcwd() == directory)
assert(vim.api.nvim_win_get_width(0) == 28)
Snacks.picker.files = original
vim.fn.delete(directory, "d")
print("PASS: Zed palettes, layout, parsers, and project selection")
