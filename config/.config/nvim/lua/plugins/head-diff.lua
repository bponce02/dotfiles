local split

local function style_split(window, side)
  vim.api.nvim_set_hl(0, "HeadDiffOld", { bg = "#24191d" })
  vim.api.nvim_set_hl(0, "HeadDiffNew", { bg = "#252317" })
  vim.api.nvim_set_hl(0, "HeadDiffFiller", { fg = "#30343b" })
  local mappings = {}
  for item in vim.wo[window].winhighlight:gmatch("[^,]+") do
    if not item:match("^Diff") then table.insert(mappings, item) end
  end
  for _, group in ipairs({ "DiffAdd", "DiffChange", "DiffText", "DiffTextAdd" }) do
    table.insert(mappings, group .. ":HeadDiff" .. side)
  end
  table.insert(mappings, "DiffDelete:HeadDiffFiller")
  vim.wo[window].winhighlight = table.concat(mappings, ",")
end

local function close_split()
  if not split then return end
  local current = split
  split = nil
  if vim.api.nvim_win_is_valid(current.reference) then
    vim.api.nvim_win_close(current.reference, true)
  end
  if vim.api.nvim_win_is_valid(current.original) then
    vim.api.nvim_set_current_win(current.original)
    vim.cmd("diffoff")
    vim.wo.winhighlight = current.winhighlight
    if current.foldenable ~= nil then vim.wo.foldenable = current.foldenable end
  end
end

local function prepare()
  local path = vim.api.nvim_buf_get_name(0)
  if path == "" or vim.bo.buftype ~= "" then
    vim.notify("Open a file to see its changes", vim.log.levels.INFO)
    return
  end
  local cwd = vim.fs.dirname(path)
  local head = vim.system({ "git", "rev-parse", "--verify", "HEAD" }, { cwd = cwd, text = true }):wait()
  if head.code ~= 0 then
    vim.notify("No Git HEAD available for this file", vim.log.levels.WARN)
    return
  end
  local ref = vim.system({ "git", "show", "HEAD:./" .. vim.fs.basename(path) }, { cwd = cwd, text = true }):wait()
  local diff = require("mini.diff")
  diff.enable(0)
  diff.set_ref_text(0, ref.code == 0 and ref.stdout or {})
  return diff, ref.code == 0 and ref.stdout or "", path
end

local function toggle_inline()
  close_split()
  local diff = prepare()
  if diff then diff.toggle_overlay(0) end
end

local function toggle_layout()
  if split then
    close_split()
    local diff = prepare()
    if diff and not diff.get_buf_data(0).overlay then diff.toggle_overlay(0) end
    return
  end
  local diff, text, path = prepare()
  if not diff then return end
  if diff.get_buf_data(0).overlay then diff.toggle_overlay(0) end
  local original = vim.api.nvim_get_current_win()
  local foldenable = vim.wo.foldenable
  local winhighlight = vim.wo.winhighlight
  local filetype = vim.bo.filetype
  local buffer = vim.api.nvim_create_buf(false, true)
  local lines = vim.split(text, "\n", { plain = true })
  if lines[#lines] == "" then table.remove(lines) end
  vim.api.nvim_buf_set_lines(buffer, 0, -1, false, lines)
  vim.api.nvim_buf_set_name(buffer, "head-diff://" .. buffer .. "/" .. path)
  vim.bo[buffer].filetype = filetype
  vim.bo[buffer].bufhidden = "wipe"
  vim.bo[buffer].modifiable = false
  vim.cmd("leftabove vsplit")
  local reference = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_buf(reference, buffer)
  vim.cmd("diffthis")
  vim.api.nvim_set_current_win(original)
  vim.cmd("diffthis")
  style_split(reference, "Old")
  style_split(original, "New")
  split = { original = original, reference = reference, foldenable = foldenable, winhighlight = winhighlight }
end

local saved_linematch = {}

local function toggle_filler()
  local options = vim.opt.diffopt:get()
  local enabled = vim.tbl_contains(options, "filler")
  for _, option in ipairs(options) do
    if option:match("^linematch:") then enabled = true end
  end
  if enabled then
    saved_linematch = {}
    local filtered = {}
    for _, option in ipairs(options) do
      if option:match("^linematch:") then
        table.insert(saved_linematch, option)
      elseif option ~= "filler" then
        table.insert(filtered, option)
      end
    end
    vim.opt.diffopt = filtered
  else
    vim.opt.diffopt:append("filler")
    for _, option in ipairs(saved_linematch) do vim.opt.diffopt:append(option) end
  end
  vim.cmd("diffupdate")
end

return {
  {
    "nvim-mini/mini.diff",
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      source = { name = "HEAD", attach = function() end },
      mappings = {
        apply = "",
        reset = "",
        textobject = "",
        goto_first = "",
        goto_prev = "",
        goto_next = "",
        goto_last = "",
      },
    },
    keys = {
      { "<leader>go", toggle_inline, desc = "Toggle Inline Diff (HEAD)" },
      { "<leader>gs", toggle_layout, desc = "Switch Split / Inline Diff (HEAD)" },
      { "<leader>gc", toggle_filler, desc = "Toggle Diff Filler" },
    },
  },
}
