import express from "express";
import { employees } from "./employees.js";
import { getSession, setSession } from "./sessions.js";

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve the chat UI
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Harness</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d0d0d; color: #e5e5e5; height: 100dvh; display: flex; flex-direction: column; }
    header { padding: 12px 20px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1rem; font-weight: 600; }
    #employee-select { background: #1a1a1a; color: #e5e5e5; border: 1px solid #333; border-radius: 6px; padding: 4px 8px; font-size: 0.875rem; }
    #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .msg { max-width: 80%; padding: 10px 14px; border-radius: 10px; line-height: 1.5; white-space: pre-wrap; font-size: 0.9rem; }
    .msg.user { align-self: flex-end; background: #2563eb; color: white; }
    .msg.assistant { align-self: flex-start; background: #1a1a1a; border: 1px solid #2a2a2a; }
    .msg .label { font-size: 0.7rem; opacity: 0.6; margin-bottom: 4px; }
    .msg.streaming { opacity: 0.8; }
    #input-row { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid #222; }
    #msg-input { flex: 1; background: #1a1a1a; color: #e5e5e5; border: 1px solid #333; border-radius: 8px; padding: 10px 14px; font-size: 0.9rem; resize: none; height: 44px; }
    #send-btn { background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 0.9rem; }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .employees-bar { display: flex; gap: 6px; padding: 10px 20px; border-bottom: 1px solid #1a1a1a; flex-wrap: wrap; }
    .emp-chip { padding: 4px 10px; border-radius: 999px; border: 1px solid #333; background: #111; font-size: 0.75rem; cursor: pointer; }
    .emp-chip.active { border-color: #2563eb; background: #1d3461; color: #93c5fd; }
  </style>
</head>
<body>
  <header>
    <h1>Claude Harness</h1>
    <span style="opacity:0.4;font-size:0.8rem">Text your AI employees</span>
  </header>
  <div class="employees-bar" id="emp-bar"></div>
  <div id="messages"></div>
  <div id="input-row">
    <textarea id="msg-input" placeholder="Message your employee..." rows="1"></textarea>
    <button id="send-btn">Send</button>
  </div>

  <script>
    const EMPLOYEES = ${JSON.stringify(
      Object.entries(employees).map(([id, e]) => ({ id, name: e.name, description: e.description }))
    )};

    let activeEmployee = EMPLOYEES[0]?.id ?? '';

    // Build employee chips
    const bar = document.getElementById('emp-bar');
    EMPLOYEES.forEach(({ id, name, description }) => {
      const chip = document.createElement('div');
      chip.className = 'emp-chip' + (id === activeEmployee ? ' active' : '');
      chip.textContent = name;
      chip.title = description;
      chip.onclick = () => {
        activeEmployee = id;
        bar.querySelectorAll('.emp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      };
      bar.appendChild(chip);
    });

    const msgs = document.getElementById('messages');
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('send-btn');

    function addMessage(role, employeeName, text, streaming = false) {
      const el = document.createElement('div');
      el.className = 'msg ' + role + (streaming ? ' streaming' : '');
      el.innerHTML = '<div class="label">' + (role === 'user' ? 'You' : employeeName) + '</div>' + escHtml(text);
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
      return el;
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    async function send() {
      const text = input.value.trim();
      if (!text || !activeEmployee) return;
      input.value = '';
      btn.disabled = true;

      const emp = EMPLOYEES.find(e => e.id === activeEmployee);
      addMessage('user', 'You', text);

      const bubble = addMessage('assistant', emp.name, '', true);
      let accumulated = '';

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: activeEmployee,
            message: text,
          }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              accumulated += data.text;
              bubble.innerHTML = '<div class="label">' + emp.name + '</div>' + escHtml(accumulated);
              msgs.scrollTop = msgs.scrollHeight;
            } else if (data.type === 'done') {
              bubble.classList.remove('streaming');
            }
          }
        }
      } catch (err) {
        bubble.innerHTML += '<br><span style="color:#f87171">Error: ' + escHtml(String(err)) + '</span>';
      }

      btn.disabled = false;
      input.focus();
    }

    btn.onclick = send;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  </script>
</body>
</html>`);
});

// List available employees
app.get("/employees", (_req, res) => {
  res.json(
    Object.entries(employees).map(([id, e]) => ({
      id,
      name: e.name,
      description: e.description,
      tools: e.tools,
    }))
  );
});

// Streaming chat endpoint using SSE
app.post("/chat", async (req, res) => {
  const { employeeId, message } = req.body as {
    employeeId: string;
    message: string;
  };

  const employee = employees[employeeId];
  if (!employee) {
    res.status(400).json({ error: `Unknown employee: ${employeeId}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { buildSystemPrompt } = await import("./harness.js");

  const existingSession = getSession(employeeId);

  const queryOptions = {
    allowedTools: employee.tools,
    systemPrompt: buildSystemPrompt(employee),
    permissionMode: "acceptEdits" as const,
    cwd: employee.workdir,
    additionalDirectories: [process.cwd()],
    ...(existingSession ? { resume: existingSession } : {}),
  };

  let resultSessionId = "";

  try {
    for await (const msg of query({ prompt: message, options: queryOptions })) {
      if (msg.type === "system" && msg.subtype === "init") {
        resultSessionId = msg.session_id;
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            res.write(`data: ${JSON.stringify({ type: "text", text: block.text })}\n\n`);
          }
        }
      }

      if (msg.type === "result" && msg.subtype === "success") {
        if (resultSessionId) setSession(employeeId, resultSessionId);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`Claude Harness running at http://localhost:${PORT}`);
});
