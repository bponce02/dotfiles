vim.api.nvim_create_autocmd("FileType", {
  group = vim.api.nvim_create_augroup("PersonalTypeScriptIndent", { clear = true }),
  pattern = { "typescript", "typescriptreact" },
  callback = function()
    vim.bo.expandtab = true
    vim.bo.shiftwidth = 2
    vim.bo.softtabstop = 2
    vim.bo.tabstop = 2
  end,
})

vim.api.nvim_create_autocmd("CursorHold", {
  group = vim.api.nvim_create_augroup("PersonalDiagnosticFloat", { clear = true }),
  callback = function()
    if vim.bo.buftype == "" then
      vim.diagnostic.open_float(nil, { focus = false, scope = "line" })
    end
  end,
})
