vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.g.lazyvim_explorer = "neo-tree"
vim.g.lazyvim_picker = "snacks"
vim.g.lazyvim_python_lsp = "basedpyright"
vim.g.autoformat = false

vim.env.PATH = vim.fn.expand("~/go/bin") .. ":" .. vim.env.PATH
vim.opt.relativenumber = false
vim.opt.wrap = false
vim.opt.scrolloff = 5
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.softtabstop = 4
vim.opt.updatetime = 500
vim.opt.clipboard = "unnamedplus"
vim.opt.fillchars:append({ eob = " ", vert = "│" })
