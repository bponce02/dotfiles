vim.keymap.set({ "n", "i", "v", "s", "x" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })
require("pi_bridge").setup()
