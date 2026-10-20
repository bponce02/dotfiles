local function open_project(directory)
  vim.fn.chdir(directory)
  vim.cmd.enew()
  vim.cmd.Neotree("focus")
end

local function project_directories()
  local directories = {}
  for _, root in ipairs({ "~/Documents/GitHub", "~/Documents" }) do
    root = vim.fn.expand(root)
    if vim.fn.isdirectory(root) == 1 then
      for name, kind in vim.fs.dir(root) do
        local path = root .. "/" .. name
        if kind == "directory" and not name:match("^%.") and not name:match("__worktrees$") and vim.uv.fs_stat(path .. "/.git") then
          directories[#directories + 1] = path
        end
      end
    end
  end
  table.sort(directories, function(a, b)
    local sa, sb = vim.uv.fs_stat(a), vim.uv.fs_stat(b)
    local ta, tb = sa and sa.mtime.sec or 0, sb and sb.mtime.sec or 0
    if ta == tb then return a < b end
    return ta > tb
  end)
  return directories
end

return {
  { "RRethy/base16-nvim", enabled = false },
  {
    "LazyVim/LazyVim",
    opts = { colorscheme = function() require("config.noctalia").apply() end },
    init = function() require("config.noctalia").setup() end,
  },
  {
    "folke/which-key.nvim",
    opts = {
      preset = "helix",
      delay = 0,
      spec = { { "<leader>a", group = "Pi", mode = { "n", "x" } } },
    },
    keys = {
      { "<leader>?", function() require("which-key").show({ global = false }) end, desc = "Buffer-local keymaps" },
    },
  },
  {
    "akinsho/bufferline.nvim",
    opts = {
      options = {
        separator_style = "thin",
        show_buffer_close_icons = false,
        show_close_icon = false,
        always_show_bufferline = true,
        diagnostics = false,
        indicator = { style = "none" },
        offsets = { { filetype = "neo-tree", text = "Project", text_align = "left", separator = true } },
      },
    },
  },
  {
    "Bekaboo/dropbar.nvim",
    event = "VeryLazy",
    opts = {
      sources = {
        treesitter = {
          valid_types = { "function", "method", "class", "interface", "struct", "enum", "type", "namespace", "module" },
        },
      },
    },
  },
  {
    "nvim-neo-tree/neo-tree.nvim",
    dependencies = { "nvim-lua/plenary.nvim", "MunifTanjim/nui.nvim" },
    keys = {
      {
        "<leader>e",
        function()
          if vim.bo.filetype == "neo-tree" then
            vim.cmd.Neotree("close")
          else
            require("neo-tree.command").execute({ action = "focus", dir = LazyVim.root() })
          end
        end,
        desc = "Explorer",
      },
    },
    opts = {
      window = { width = 28 },
      enable_diagnostics = false,
      default_component_configs = {
        indent = { indent_size = 2, padding = 0, with_markers = true },
        icon = { folder_closed = "", folder_open = "" },
        git_status = { symbols = { added = "", modified = "", deleted = "", renamed = "", untracked = "", ignored = "", unstaged = "", staged = "", conflict = "!" } },
        name = { trailing_slash = false },
      },
      filesystem = {
        bind_to_cwd = true,
        components = {
          name = function(config, node, state)
            local item = require("neo-tree.sources.common.components").name(config, node, state)
            if node:get_depth() == 1 then item.text = vim.fn.fnamemodify(state.path, ":t") end
            return item
          end,
        },
        filtered_items = { hide_dotfiles = false, hide_gitignored = false, never_show = { ".git" } },
      },
    },
  },
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = {
      keymaps = {
        view = { { "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Git Diff View" } } },
        file_panel = { { "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Git Diff View" } } },
        file_history_panel = { { "n", "q", "<cmd>DiffviewClose<cr>", { desc = "Close Git Diff View" } } },
      },
    },
    keys = {
      { "<leader>gv", "<cmd>DiffviewOpen<cr>", desc = "Git Diff View" },
      { "<leader>gV", "<cmd>DiffviewOpen -- %<cr>", desc = "Git Diff Current File" },
      { "<leader>gq", "<cmd>DiffviewClose<cr>", desc = "Close Git Diff View" },
    },
  },
  {
    "NeogitOrg/neogit",
    cmd = "Neogit",
    dependencies = { "nvim-lua/plenary.nvim", "sindrets/diffview.nvim" },
    opts = { integrations = { diffview = true } },
  },
  {
    "folke/snacks.nvim",
    keys = {
      { "<leader>p", function() Snacks.picker.projects() end, desc = "Projects" },
      { "<leader><space>", function() Snacks.picker.smart() end, desc = "Smart Find Files" },
    },
    opts = {
      dashboard = {
        sections = {
          { section = "header" },
          { section = "keys", gap = 1, padding = 1 },
          function()
            return {
              icon = " ", title = "Projects", section = "projects", indent = 2,
              padding = 1, limit = 8, action = open_project, dirs = project_directories,
            }
          end,
          { icon = " ", title = "Recent Files", section = "recent_files", indent = 2, padding = 1 },
          { section = "startup" },
        },
      },
      picker = {
        sources = {
          projects = {
            dev = { "~/Documents/GitHub", "~/Documents" },
            confirm = function(picker, item)
              if not item then return end
              picker:close()
              open_project(item.file)
            end,
          },
        },
      },
    },
  },
}
