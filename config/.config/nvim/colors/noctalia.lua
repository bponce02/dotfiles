-- Colorscheme from the noctalia shell's active community palette
-- (~/.local/state/noctalia/community-palettes/<name>.json, selected in
-- settings.toml — currently "Ayu Blue"). Picks the dark/light variant from
-- 'background'. Falls back to baked-in Ayu Blue values if files are missing.

local function read_file(path)
  local f = io.open(vim.fn.expand(path), "r")
  if not f then return nil end
  local content = f:read("*a")
  f:close()
  return content
end

-- Which palette is selected in noctalia?
local palette_name = "Ayu Blue"
local settings = read_file("~/.local/state/noctalia/settings.toml")
if settings then
  palette_name = settings:match('community_palette%s*=%s*"([^"]+)"') or palette_name
end

local palette
local raw = read_file("~/.local/state/noctalia/community-palettes/"
  .. palette_name:gsub(" ", "%%20") .. ".json")
if raw then
  local ok, decoded = pcall(vim.json.decode, raw)
  if ok then palette = decoded end
end

local variant = vim.o.background == "light" and "light" or "dark"
local p = palette and palette[variant]

-- Baked-in fallback: Ayu Blue dark
if not p then
  p = {
    mPrimary = "#39BAE6", mSecondary = "#AAD94C", mTertiary = "#E6B450",
    mError = "#D95757", mSurface = "#0B0E14", mOnSurface = "#D1D1C7",
    mSurfaceVariant = "#1E222A", mOnSurfaceVariant = "#8E959E",
    mOutline = "#565B66", mOnPrimary = "#0B0E14",
    terminal = {
      normal = { black = "#171B24", red = "#ED8274", green = "#87D96C",
        yellow = "#6DCBFA", blue = "#FACC6E", magenta = "#DABAFA",
        cyan = "#90E1C6", white = "#C7C7C7" },
      bright = { black = "#686868", red = "#F28779", green = "#D5FF80",
        yellow = "#73D0FF", blue = "#FFD173", magenta = "#DFBFFF",
        cyan = "#95E6CB", white = "#FFFFFF" },
      foreground = "#D1D1C7", background = "#1F2430",
      selectionFg = "#1F2430", selectionBg = "#409FFF", cursor = "#FFCC66",
    },
  }
end

local term = p.terminal or {}
local bg = p.mSurface or term.background
local fg = term.foreground or p.mOnSurface

-- Semantic colors (the terminal slots have odd names in this palette,
-- so syntax colors come from the material roles instead)
local blue = p.mPrimary
local green = p.mSecondary
local yellow = p.mTertiary
local red = p.mError
local magenta = (term.normal or {}).magenta or "#DABAFA"
local cyan = (term.normal or {}).cyan or "#90E1C6"

vim.cmd.highlight("clear")
vim.g.colors_name = "noctalia"

local hl = {
  Normal = { fg = fg, bg = bg },
  NormalFloat = { fg = fg, bg = p.mSurface },
  FloatBorder = { fg = p.mOutline, bg = p.mSurface },
  FloatTitle = { fg = blue, bg = p.mSurface, bold = true },
  Cursor = { fg = bg, bg = term.cursor or yellow },
  CursorLine = { bg = p.mSurfaceVariant },
  CursorColumn = { link = "CursorLine" },
  ColorColumn = { link = "CursorLine" },
  Visual = { fg = term.selectionFg or bg, bg = term.selectionBg or blue },
  Search = { fg = bg, bg = yellow },
  IncSearch = { fg = bg, bg = red },
  CurSearch = { link = "IncSearch" },
  MatchParen = { fg = yellow, bold = true, underline = true },

  LineNr = { fg = p.mOutline },
  CursorLineNr = { fg = yellow, bold = true },
  SignColumn = { fg = p.mOutline, bg = "NONE" },
  Folded = { fg = p.mOnSurfaceVariant, bg = p.mSurfaceVariant },
  FoldColumn = { fg = p.mOutline },
  WinSeparator = { fg = p.mOutline },
  EndOfBuffer = { fg = bg },
  NonText = { fg = p.mOutline },
  Whitespace = { fg = p.mSurfaceVariant },

  StatusLine = { fg = p.mOnSurface, bg = p.mSurfaceVariant },
  StatusLineNC = { fg = p.mOnSurfaceVariant, bg = p.mSurface },
  TabLine = { fg = p.mOnSurfaceVariant, bg = p.mSurface },
  TabLineSel = { fg = p.mOnSurface, bg = p.mSurfaceVariant, bold = true },
  TabLineFill = { bg = p.mSurface },
  WinBar = { fg = p.mOnSurface, bold = true },
  WinBarNC = { fg = p.mOnSurfaceVariant },

  Pmenu = { fg = fg, bg = p.mSurface },
  PmenuSel = { fg = p.mOnPrimary or bg, bg = blue },
  PmenuSbar = { bg = p.mSurfaceVariant },
  PmenuThumb = { bg = p.mOutline },
  WildMenu = { link = "PmenuSel" },

  Title = { fg = blue, bold = true },
  Directory = { fg = blue },
  Question = { fg = green },
  MoreMsg = { fg = green },
  ModeMsg = { fg = fg, bold = true },
  ErrorMsg = { fg = red },
  WarningMsg = { fg = yellow },

  -- ayu-style syntax: orange/yellow keywords, blue functions, green strings
  Comment = { fg = p.mOutline, italic = true },
  Constant = { fg = magenta },
  String = { fg = green },
  Character = { fg = green },
  Number = { fg = magenta },
  Boolean = { fg = magenta },
  Float = { fg = magenta },
  Identifier = { fg = fg },
  Function = { fg = blue },
  Statement = { fg = yellow },
  Keyword = { fg = yellow },
  Conditional = { fg = yellow },
  Repeat = { fg = yellow },
  Label = { fg = yellow },
  Operator = { fg = yellow },
  Exception = { fg = red },
  PreProc = { fg = yellow },
  Include = { fg = yellow },
  Define = { fg = yellow },
  Macro = { fg = yellow },
  Type = { fg = cyan },
  StorageClass = { fg = cyan },
  Structure = { fg = cyan },
  Typedef = { fg = cyan },
  Special = { fg = cyan },
  SpecialChar = { fg = cyan },
  Tag = { fg = blue },
  Delimiter = { fg = p.mOnSurfaceVariant },
  SpecialComment = { fg = p.mOutline, bold = true },
  Debug = { fg = red },
  Underlined = { underline = true },
  Error = { fg = red },
  Todo = { fg = bg, bg = yellow, bold = true },
  Added = { fg = green },
  Removed = { fg = red },
  Changed = { fg = blue },

  DiffAdd = { fg = green, bg = "NONE" },
  DiffDelete = { fg = red, bg = "NONE" },
  DiffChange = { fg = blue, bg = "NONE" },
  DiffText = { fg = bg, bg = blue },

  DiagnosticError = { fg = red },
  DiagnosticWarn = { fg = yellow },
  DiagnosticInfo = { fg = blue },
  DiagnosticHint = { fg = cyan },
  DiagnosticOk = { fg = green },
  DiagnosticUnderlineError = { undercurl = true, sp = red },
  DiagnosticUnderlineWarn = { undercurl = true, sp = yellow },
  DiagnosticUnderlineInfo = { undercurl = true, sp = blue },
  DiagnosticUnderlineHint = { undercurl = true, sp = cyan },

  ["@variable"] = { fg = fg },
  ["@property"] = { fg = cyan },
  ["@constructor"] = { fg = blue },
  ["@tag.attribute"] = { fg = cyan },
  ["@markup.heading"] = { fg = blue, bold = true },
  ["@markup.link"] = { fg = blue, underline = true },
  ["@markup.raw"] = { fg = green },

  NeoTreeNormal = { fg = fg, bg = p.mSurface },
  NeoTreeNormalNC = { link = "NeoTreeNormal" },
  NeoTreeGitAdded = { fg = green },
  NeoTreeGitModified = { fg = blue },
  NeoTreeGitDeleted = { fg = red },
  NeoTreeGitUntracked = { fg = yellow },
  NeoTreeRootName = { fg = blue, bold = true },
  NeoTreeDirectoryIcon = { fg = blue },
  NeoTreeDirectoryName = { fg = blue },

  SnacksDashboardHeader = { fg = blue },
  SnacksDashboardIcon = { fg = yellow },
  SnacksDashboardDesc = { fg = fg },
  SnacksDashboardKey = { fg = yellow, bold = true },
  SnacksDashboardTitle = { fg = blue, bold = true },
  SnacksDashboardFooter = { fg = p.mOutline },
  SnacksDashboardSpecial = { fg = p.mOutline },
  SnacksDashboardDir = { fg = p.mOnSurfaceVariant },
}

for group, spec in pairs(hl) do
  vim.api.nvim_set_hl(0, group, spec)
end

-- Terminal colors, in the palette's own slot order
local order = { "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white" }
for i, name in ipairs(order) do
  vim.g["terminal_color_" .. (i - 1)] = (term.normal or {})[name]
  vim.g["terminal_color_" .. (i + 7)] = (term.bright or {})[name]
end

require("zed_look").apply()
