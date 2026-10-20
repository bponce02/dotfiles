return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      diagnostics = {
        virtual_text = false,
        underline = true,
        float = { border = "rounded" },
        severity_sort = true,
      },
      inlay_hints = { enabled = false },
      servers = {
        basedpyright = {
          settings = { basedpyright = { analysis = { typeCheckingMode = "off" } } },
          before_init = function(_, config)
            local root = config.root_dir or vim.fn.getcwd()
            local python = vim.fs.joinpath(root, ".venv", "bin", "python")
            if vim.uv.fs_stat(python) then
              config.settings = vim.tbl_deep_extend("force", config.settings or {}, {
                python = { pythonPath = python },
              })
            end
          end,
        },
      },
    },
  },
  {
    "nvim-treesitter/nvim-treesitter",
    opts = {
      ensure_installed = { "svelte", "html", "css", "typescript", "tsx", "javascript", "python", "go" },
    },
  },
}
