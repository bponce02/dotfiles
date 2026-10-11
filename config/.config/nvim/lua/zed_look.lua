local M = {}

function M.apply()
  local path = vim.fn.expand("~/.config/zed/themes/noctalia.json")
  local file = io.open(path, "r")
  if not file then return end
  local raw = file:read("*a")
  file:close()
  local ok, theme = pcall(vim.json.decode, raw, { luanil = { object = true, array = true } })
  if not ok or type(theme) ~= "table" then return end
  local style
  for _, variant in ipairs(theme.themes or {}) do
    if variant.appearance == vim.o.background then style = variant.style break end
  end
  if not style then return end

  local function color(key, background)
    local value = style[key]
    if type(value) ~= "string" then return nil end
    if #value ~= 9 then return value end
    local base = background or style["editor.background"]
    local alpha = tonumber(value:sub(8, 9), 16) / 255
    local rgb = {}
    for i = 2, 6, 2 do
      local fg = tonumber(value:sub(i, i + 1), 16)
      local bg = tonumber(base:sub(i, i + 1), 16)
      rgb[#rgb + 1] = math.floor(fg * alpha + bg * (1 - alpha) + 0.5)
    end
    return string.format("#%02x%02x%02x", unpack(rgb))
  end

  local function set(group, fg, bg, extra)
    vim.api.nvim_set_hl(0, group, vim.tbl_extend("force", {
      fg = color(fg), bg = color(bg),
    }, extra or {}))
  end

  set("Normal", "editor.foreground", "editor.background")
  set("NormalNC", "editor.foreground", "editor.background")
  set("NormalFloat", "text", "elevated_surface.background")
  set("FloatBorder", "border", "elevated_surface.background")
  set("CursorLine", nil, "editor.active_line.background")
  set("LineNr", "editor.line_number")
  set("CursorLineNr", "editor.active_line_number")
  set("WinSeparator", "border", "panel.background")
  set("WinBar", "text.muted", "toolbar.background")
  set("WinBarNC", "text.muted", "toolbar.background")
  set("StatusLine", "text.muted", "status_bar.background")
  set("StatusLineNC", "text.muted", "status_bar.background")
  set("Visual", nil, "element.selected")
  set("NeoTreeNormal", "text", "panel.background")
  set("NeoTreeNormalNC", "text", "panel.background")
  set("NeoTreeEndOfBuffer", "panel.background", "panel.background")
  set("NeoTreeWinSeparator", "border", "panel.background")
  set("NeoTreeCursorLine", nil, "element.selected")
  set("NeoTreeRootName", "text")
  set("NeoTreeDirectoryName", "text")
  set("NeoTreeDirectoryIcon", "icon.muted")
  set("NeoTreeFileIcon", "icon.muted")
  set("NeoTreeIndentMarker", "border")
  set("NeoTreeExpander", "icon.muted")
  set("NeoTreeGitModified", "modified")
  set("NeoTreeGitUntracked", "created")
  set("NeoTreeGitAdded", "created")
  set("NeoTreeGitDeleted", "deleted")
  set("NeoTreeGitIgnored", "text.muted")
  set("BufferLineFill", nil, "tab_bar.background")
  set("BufferLineBackground", "text.muted", "tab.inactive_background")
  set("BufferLineBufferVisible", "text.muted", "tab.inactive_background")
  set("BufferLineBufferSelected", "text", "tab.active_background", { bold = false, italic = false })
  set("BufferLineIndicatorSelected", "text.accent", "tab.active_background")
  set("BufferLineModifiedSelected", "text.accent", "tab.active_background")
  set("BufferLineSeparator", "border", "tab.inactive_background")
  set("BufferLineSeparatorSelected", "border", "tab.active_background")
  set("BufferLineOffsetSeparator", "border", "panel.background")

  local syntax = style.syntax or {}
  local groups = {
    keyword = { "Keyword", "Statement", "Conditional", "Repeat", "Label", "Exception", "Include", "StorageClass", "PreProc", "@keyword" },
    ["function"] = { "Function", "@function", "@function.call", "@function.method", "@function.method.call" },
    string = { "String", "Character", "@string" },
    number = { "Number", "Float", "@number" },
    boolean = { "Boolean", "@boolean" },
    constant = { "Constant", "@constant" },
    comment = { "Comment", "@comment" },
    type = { "Type", "Structure", "Typedef", "@type", "@type.builtin" },
    variable = { "Identifier", "@variable", "@variable.parameter" },
    property = { "@property", "@variable.member" },
    operator = { "Operator", "@operator" },
    constructor = { "@constructor" },
    ["punctuation.bracket"] = { "@punctuation.bracket" },
    ["punctuation.delimiter"] = { "Delimiter", "@punctuation.delimiter" },
  }
  for name, names in pairs(groups) do
    local spec = syntax[name]
    if spec and spec.color then
      for _, group in ipairs(names) do
        vim.api.nvim_set_hl(0, group, {
          fg = spec.color:sub(1, 7), italic = spec.font_style == "italic",
          bold = (spec.font_weight or 400) >= 700,
        })
      end
    end
  end
end

return M
