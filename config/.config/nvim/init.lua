vim.opt.termguicolors = true
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.softtabstop = 4
vim.opt.autoread = true
vim.opt.clipboard = "unnamedplus"

vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold", "InsertLeave" }, {
  group = vim.api.nvim_create_augroup("ReloadExternalChanges", { clear = true }),
  callback = function()
    if vim.fn.getcmdwintype() == "" and vim.api.nvim_get_mode().mode == "n" then
      vim.cmd("checktime")
    end
  end,
})

-- go-installed tools (gopls, golangci-lint)
vim.env.PATH = vim.fn.expand("~/go/bin") .. ":" .. vim.env.PATH

vim.diagnostic.config({
  virtual_text = true,
  severity_sort = true,
})

-- Show the full diagnostic in a float when the cursor rests on the line
vim.o.updatetime = 500
vim.api.nvim_create_autocmd("CursorHold", {
  callback = function()
    vim.diagnostic.open_float(nil, { focus = false, scope = "line" })
  end,
})

-- Theme: "noctalia" is generated from the noctalia shell's palette
-- (colors.json + the ghostty theme it writes); ayu is the fallback.
local function apply_theme()
  if not pcall(vim.cmd.colorscheme, "noctalia") then
    vim.g.ayucolor = vim.o.background == "light" and "light" or "dark"
    pcall(vim.cmd.colorscheme, "ayu")
  end
end
vim.api.nvim_create_autocmd("OptionSet", {
  pattern = "background",
  callback = apply_theme,
})

-- Hot-reload the theme when noctalia regenerates its palette files.
-- Watch the parent dirs: the files are replaced atomically on regen.
for dir, file in pairs({
  ["~/.config/noctalia"] = "colors.json",
  ["~/.config/ghostty/themes"] = "noctalia",
  ["~/.local/state/noctalia"] = "settings.toml",
  ["~/Documents/GitHub/dotfiles/config/.config/nvim/colors"] = "noctalia.lua",
}) do
  local w = vim.uv.new_fs_event()
  if w then
    w:start(vim.fn.expand(dir), {}, vim.schedule_wrap(function(_, fname)
      if fname == file and vim.g.colors_name == "noctalia" then
        apply_theme()
      end
    end))
  end
end

vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

require("pi_bridge").setup()

vim.keymap.set({ "n", "i", "v", "s", "x" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      preset = "helix",
      delay = 0,
      spec = {
        { "<leader>a", group = "Pi", mode = { "n", "x" } },
        { "<leader>g", group = "Git" },
        { "<leader>s", group = "Search" },
      },
    },
    keys = {
      {
        "<leader>?",
        function() require("which-key").show({ global = false }) end,
        desc = "Buffer-local keymaps",
      },
    },
  },
  {
    "ayu-theme/ayu-vim",
    lazy = false,
    priority = 1000,
    config = function()
      apply_theme()
    end,
  },
  {
    "nvim-neo-tree/neo-tree.nvim",
    branch = "v3.x",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-tree/nvim-web-devicons",
      "MunifTanjim/nui.nvim",
    },
    cmd = "Neotree",
    keys = {
      {
        "<leader>e",
        function()
          -- focus the tree from anywhere; close only when already inside it
          if vim.bo.filetype == "neo-tree" then
            vim.cmd("Neotree close")
          else
            vim.cmd("Neotree focus")
          end
        end,
        desc = "Explorer",
      },
    },
    opts = {
      filesystem = {
        follow_current_file = { enabled = true },
        use_libuv_file_watcher = true,
      },
    },
  },
  {
    "neovim/nvim-lspconfig",
    config = function()
      vim.lsp.config("gopls", {
        settings = {
          gopls = {
            staticcheck = true,
            gofumpt = true,
          },
        },
      })
      vim.lsp.enable("gopls")

      -- Global language server; project Python is used only for import resolution.
      vim.lsp.config("basedpyright", {
        settings = {
          basedpyright = {
            analysis = { typeCheckingMode = "off" },
          },
        },
        cmd = { vim.fn.expand("~/.local/bin/basedpyright-langserver"), "--stdio" },
        before_init = function(_, config)
          local root = config.root_dir or vim.fn.getcwd()
          local python = vim.fs.joinpath(root, ".venv", "bin", "python")
          if vim.uv.fs_stat(python) then
            config.settings = vim.tbl_deep_extend("force", config.settings or {}, {
              python = { pythonPath = python },
            })
          end
        end,
      })
      vim.lsp.enable("basedpyright")
    end,
  },
  {
    "mfussenegger/nvim-lint",
    ft = "go",
    config = function()
      require("lint").linters_by_ft = { go = { "golangcilint" } }
      vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "InsertLeave" }, {
        callback = function()
          require("lint").try_lint(nil, { ignore_errors = true })
        end,
      })
    end,
  },
  {
    "ahmedkhalf/project.nvim",
    lazy = false,
    main = "project_nvim",
    opts = {
      -- cd to the project root of whatever file is opened, so :terminal
      -- and pickers start in the project instead of wherever nvim launched
      patterns = { ".git", "Cargo.toml", "go.mod", "package.json", "Makefile" },
    },
  },
  {
    "echasnovski/mini.pairs",
    event = "InsertEnter",
    opts = {},
  },
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    keys = {
      { "<leader>gv", "<cmd>DiffviewOpen<cr>", desc = "Git Diff View" },
      { "<leader>gV", "<cmd>DiffviewOpen -- %<cr>", desc = "Git Diff Current File" },
      { "<leader>gq", "<cmd>DiffviewClose<cr>", desc = "Close Git Diff View" },
    },
  },
  {
    "NeogitOrg/neogit",
    cmd = "Neogit",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
    },
    opts = {
      integrations = {
        diffview = true,
      },
    },
  },
  {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
      dashboard = {
        enabled = true,
        sections = {
          { section = "header" },
          { section = "keys", gap = 1, padding = 1 },
          -- Wrapped in a function: snacks mutates section tables on render
          -- (moves `action` to the title row and nils it), so a shared table
          -- loses the custom action on the first re-render. A fresh table per
          -- render is immune.
          function()
            return {
            icon = " ",
            title = "Projects",
            section = "projects",
            indent = 2,
            padding = 1,
            limit = 8,
            action = function(dir)
              if type(dir) ~= "string" then return end
              vim.fn.chdir(dir)
              vim.cmd("enew")
              vim.cmd("Neotree")
            end,
            dirs = function()
              local dirs = {}
              for _, root in ipairs({ "~/Documents/GitHub", "~/Documents" }) do
                root = vim.fn.expand(root)
                for name, type in vim.fs.dir(root) do
                  if type == "directory" and not name:match("^%.") and not name:match("__worktrees$") then
                    local path = root .. "/" .. name
                    if vim.uv.fs_stat(path .. "/.git") then
                      table.insert(dirs, path)
                    end
                  end
                end
              end
              table.sort(dirs, function(a, b)
                local sa, sb = vim.uv.fs_stat(a), vim.uv.fs_stat(b)
                return (sa and sa.mtime.sec or 0) > (sb and sb.mtime.sec or 0)
              end)
              return dirs
            end,
            }
          end,
          { icon = " ", title = "Recent Files", section = "recent_files", indent = 2, padding = 1 },
          { section = "startup" },
        },
      },
      picker = {
        enabled = true,
        sources = {
          projects = {
            confirm = function(picker, item)
              if not item then return end
              picker:close()
              vim.fn.chdir(item.file)
              vim.cmd("enew")
              vim.cmd("Neotree")
            end,
          },
        },
      },
    },
    keys = {
      { "<leader>gg", function() Snacks.lazygit() end, mode = "n", desc = "Lazygit" },
      { "<leader>p", function() Snacks.picker.projects() end, desc = "Projects" },
      { "<leader><space>", function() Snacks.picker.smart() end, desc = "Smart Find Files" },
      { "<leader>/", function() Snacks.picker.grep() end, desc = "Grep" },
      { "<leader>sk", function() Snacks.picker.keymaps() end, desc = "Search Keymaps" },
    },
  },
}, {
  install = { colorscheme = { "ayu" } },
})
