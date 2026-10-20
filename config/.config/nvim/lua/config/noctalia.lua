local M = {}
local watchers = {}

function M.apply()
  if not pcall(vim.cmd.colorscheme, "noctalia") then
    vim.cmd.colorscheme("tokyonight")
  end
end

function M.setup()
  local group = vim.api.nvim_create_augroup("NoctaliaTheme", { clear = true })
  vim.api.nvim_create_autocmd("OptionSet", {
    group = group, pattern = "background", callback = M.apply,
  })
  local theme_path = vim.uv.fs_realpath(vim.fn.stdpath("config") .. "/colors/noctalia.lua")
  local paths = {
    ["~/.config/noctalia"] = "colors.json",
    ["~/.config/ghostty/themes"] = "noctalia",
    ["~/.local/state/noctalia"] = "settings.toml",
    ["~/.config/zed/themes"] = "noctalia.json",
  }
  if theme_path then paths[vim.fs.dirname(theme_path)] = "noctalia.lua" end
  for directory, file in pairs(paths) do
    local watcher = vim.uv.new_fs_event()
    if watcher then
      local ok = watcher:start(vim.fn.expand(directory), {}, vim.schedule_wrap(function(_, name)
        if name == file and vim.g.colors_name == "noctalia" then M.apply() end
      end))
      if ok then watchers[#watchers + 1] = watcher else watcher:close() end
    end
  end
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function()
      for _, watcher in ipairs(watchers) do
        watcher:stop()
        watcher:close()
      end
    end,
  })
end

return M
