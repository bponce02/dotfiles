vim.opt.termguicolors = true
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.softtabstop = 4

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

      -- basedpyright lives in each project's venv (uv add --group dev
      -- basedpyright django-types), not on the system: run the venv's copy
      -- and point analysis at the venv's python so project deps resolve.
      vim.lsp.config("basedpyright", {
        settings = {
          basedpyright = {
            -- default is basedpyright's "recommended" (near-strict): it floods
            -- untyped Django code with reportUnknown* warnings. "standard"
            -- matches upstream pyright defaults: real errors, completions,
            -- go-to-definition, without the noise.
            analysis = { typeCheckingMode = "standard" },
          },
        },
        cmd = function(dispatchers, config)
          local root = config and config.root_dir or vim.fn.getcwd()
          local venv = vim.fs.joinpath(root, ".venv", "bin", "basedpyright-langserver")
          local bin = vim.uv.fs_stat(venv) and venv or "basedpyright-langserver"
          return vim.lsp.rpc.start({ bin, "--stdio" }, dispatchers)
        end,
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
      picker = { enabled = true },
      lazygit = {
        win = {
          keys = {
            toggle_lazygit = { "<leader>gg", function(self) self:hide() end, mode = "t", desc = "Close Lazygit" },
          },
        },
      },
    },
    keys = {
      { "<leader>gg", function() Snacks.lazygit() end, desc = "Lazygit" },
    },
  },
}, {
  install = { colorscheme = { "ayu" } },
})
