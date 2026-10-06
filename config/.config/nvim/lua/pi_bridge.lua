local M = {}
local api, uv = vim.api, vim.uv
local ns = api.nvim_create_namespace("pi-questions")
local questions, clients = {}, {}
local server, assigned, pending, socket_path
local sequence = 0

local function notify(text, level)
  vim.notify("Pi: " .. text, level or vim.log.levels.INFO)
end

local function close(client)
  clients[client] = nil
  if assigned == client then
    assigned, pending = nil, nil
    notify("Disconnected. Run /neovim in Pi to assign this editor again.")
  end
  if not client:is_closing() then client:close() end
end

local function send(client, message)
  client:write(vim.json.encode(message) .. "\n")
end

function M.add(visual)
  local buf = api.nvim_get_current_buf()
  if vim.bo[buf].buftype ~= "" then notify("Open a file buffer first."); return end
  local first, last = vim.fn.line("."), vim.fn.line(".")
  if visual then
    first, last = vim.fn.line("v"), vim.fn.line(".")
    if first > last then first, last = last, first end
    api.nvim_feedkeys(api.nvim_replace_termcodes("<Esc>", true, false, true), "nx", false)
  end
  local mark = api.nvim_buf_set_extmark(buf, ns, first - 1, 0, {
    end_row = last, end_col = 0, right_gravity = true, end_right_gravity = false, invalidate = true,
  })
  vim.ui.input({ prompt = "Ask Pi: " }, function(text)
    if not api.nvim_buf_is_valid(buf) then return end
    if not text or not text:match("%S") then api.nvim_buf_del_extmark(buf, ns, mark); return end
    questions[#questions + 1] = { buf = buf, mark = mark, text = text }
    notify("Question added. Space as to send; Space al to review.")
  end)
end

local function range(question)
  if not api.nvim_buf_is_loaded(question.buf) then return end
  local pos = api.nvim_buf_get_extmark_by_id(question.buf, ns, question.mark, { details = true })
  if #pos == 0 or pos[3].invalid then return end
  return pos[1], pos[3].end_row
end

local function remove(question)
  if api.nvim_buf_is_valid(question.buf) then api.nvim_buf_del_extmark(question.buf, ns, question.mark) end
  for i, value in ipairs(questions) do
    if value == question then table.remove(questions, i); break end
  end
end

function M.list()
  if #questions == 0 then notify("No queued questions."); return end
  vim.ui.select(questions, {
    prompt = "Pi questions (select to remove)",
    format_item = function(q)
      local first, last = range(q)
      local path = api.nvim_buf_is_valid(q.buf) and api.nvim_buf_get_name(q.buf) or "(closed buffer)"
      return string.format("%s:%s — %s", vim.fn.fnamemodify(path, ":~:."), first and (first + 1) .. "-" .. last or "deleted", q.text)
    end,
  }, function(q)
    if not q then return end
    vim.ui.select({ "Keep", "Remove" }, { prompt = q.text }, function(action)
      if action == "Remove" then remove(q) end
    end)
  end)
end

function M.send()
  if not assigned then notify("Run /neovim in the Pi session you want to assign."); return end
  if pending then notify("Waiting for delivery confirmation."); return end
  if #questions == 0 then notify("Add a question with Space aa first."); return end
  local targets = {}
  for _, q in ipairs(questions) do
    local first, last = range(q)
    if not first or last <= first then notify("A question's range was deleted or closed. Remove it with Space al."); return end
    local path = api.nvim_buf_get_name(q.buf)
    targets[#targets + 1] = {
      path = path, start_line = first + 1, end_line = last, question = q.text,
      lines = api.nvim_buf_get_lines(q.buf, first, last, false),
    }
  end
  sequence = sequence + 1
  local message = { type = "questions", id = sequence, cwd = vim.fn.getcwd(), targets = targets }
  if #vim.json.encode(message) > 4 * 1024 * 1024 then notify("Selected lines exceed 4 MiB; select less code."); return end
  pending = { id = sequence, questions = vim.list_extend({}, questions) }
  local ok, err = pcall(send, assigned, message)
  if not ok then pending = nil; notify(tostring(err), vim.log.levels.ERROR); return end
  local id = sequence
  vim.defer_fn(function()
    if pending and pending.id == id then
      pending = nil
      notify("Delivery confirmation timed out. Questions retained; check Pi before retrying.", vim.log.levels.WARN)
    end
  end, 10000)
end

local function receive(client, message)
  if message.type == "assign" then
    if assigned and assigned ~= client then close(assigned) end
    assigned = client
    send(client, { type = "assigned" })
    notify("Assigned to Pi. Space as sends questions; read answers in Pi.")
  elseif client == assigned and pending and message.id == pending.id then
    if message.type == "accepted" then
      for _, q in ipairs(pending.questions) do remove(q) end
      pending = nil
      notify("Questions sent. Read the answer in Pi.")
    elseif message.type == "error" then
      pending = nil
      notify("Delivery failed; questions retained.", vim.log.levels.ERROR)
    end
  end
end

function M.setup()
  if server then return end
  local dir = "/tmp/pi-neovim-" .. uv.getuid()
  vim.fn.mkdir(dir, "p", 448)
  local stat = uv.fs_lstat(dir)
  assert(stat and stat.type == "directory" and stat.uid == uv.getuid() and bit.band(stat.mode, 63) == 0,
    "Pi bridge directory must be private and owned by the current user")
  socket_path = dir .. "/" .. vim.fn.getpid() .. ".sock"
  uv.fs_unlink(socket_path)
  server = uv.new_pipe(false)
  assert(server:bind(socket_path))
  uv.fs_chmod(socket_path, 384)
  server:listen(16, function(err)
    if err then return end
    local client = uv.new_pipe(false)
    server:accept(client)
    clients[client] = true
    local input = ""
    vim.schedule(function()
      if not client:is_closing() then send(client, { type = "hello", cwd = vim.fn.getcwd(), pid = vim.fn.getpid() }) end
    end)
    client:read_start(function(read_err, data)
      if read_err or not data then vim.schedule(function() close(client) end); return end
      input = input .. data
      if #input > 65536 then vim.schedule(function() close(client) end); return end
      while input:find("\n", 1, true) do
        local stop = input:find("\n", 1, true)
        local line = input:sub(1, stop - 1)
        input = input:sub(stop + 1)
        vim.schedule(function()
          if client:is_closing() then return end
          local ok, message = pcall(vim.json.decode, line)
          if not ok or type(message) ~= "table" then close(client); return end
          receive(client, message)
        end)
      end
    end)
  end)
  api.nvim_create_autocmd("VimLeavePre", {
    callback = function()
      assigned, pending = nil, nil
      for client in pairs(clients) do close(client) end
      if server and not server:is_closing() then server:close() end
      uv.fs_unlink(socket_path)
    end,
  })
  vim.keymap.set("n", "<leader>aa", function() M.add(false) end, { desc = "Ask Pi about line" })
  vim.keymap.set("x", "<leader>aa", function() M.add(true) end, { desc = "Ask Pi about selection" })
  vim.keymap.set("n", "<leader>al", M.list, { desc = "Review queued Pi questions" })
  vim.keymap.set("n", "<leader>as", M.send, { desc = "Send questions to Pi" })
end

return M
