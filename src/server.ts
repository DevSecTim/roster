import express from "express";
import { Eta } from "eta";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  initDb, getAllEmployees, getEmployee, createEmployee, updateEmployee,
  deleteEmployee as dbDeleteEmployee, reorderEmployees, getSession, setSession,
  addGroupEntry, getGroupContextString, getTeamSettings, updateTeamSettings,
} from "./db.js";
import type { TeamSettings } from "./db.js";
import { hydrateEmployee, buildFullPrompt } from "./employees.js";
import type { Employee } from "./employees.js";

initDb();

const __dirname = dirname(fileURLToPath(import.meta.url));
const eta = new Eta({ views: join(__dirname, "public") });

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.static(join(__dirname, "public"), { index: false }));

// ── Livereload ───────────────────────────────────────────────────────────────

app.get("/livereload", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.write("data: connected\n\n");
  const interval = setInterval(() => res.write(": ping\n\n"), 10_000);
  res.on("close", () => clearInterval(interval));
});

// ── Serve the chat UI ────────────────────────────────────────────────────────

app.get("/", async (_req, res) => {
  const employees = getAllEmployees().map(r => ({
    id: r.id, name: r.name, job_title: r.job_title, model: r.model, effort: r.effort, color: r.color, tools: JSON.parse(r.tools), prompt: r.prompt,
  }));
  res.send(await eta.renderAsync("index.html", {
    employeesJson: JSON.stringify(employees),
    settingsJson: JSON.stringify(getTeamSettings()),
  }));
});

// ── REST API ─────────────────────────────────────────────────────────────────

app.get("/api/employees", (_req, res) => {
  const rows = getAllEmployees();
  res.json(rows.map(r => ({
    id: r.id, name: r.name, job_title: r.job_title, model: r.model, effort: r.effort, color: r.color, tools: JSON.parse(r.tools), prompt: r.prompt,
  })));
});

app.post("/api/employees", (req, res) => {
  try {
    const { name, job_title, prompt, tools, model, effort, color } = req.body;
    const row = createEmployee({ name, job_title: job_title ?? "", prompt, tools: tools ?? [], model, effort, color });
    res.json({ id: row.id, name: row.name, job_title: row.job_title, model: row.model, effort: row.effort, color: row.color, tools: JSON.parse(row.tools), prompt: row.prompt });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.put("/api/employees/reorder", (req, res) => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array" }); return; }
  reorderEmployees(order);
  res.json({ ok: true });
});

app.put("/api/employees/:id", (req, res) => {
  try {
    const { job_title, prompt, tools, model, effort, color } = req.body;
    const row = updateEmployee(req.params.id, { job_title, prompt, tools, model, effort, color });
    res.json({ id: row.id, name: row.name, job_title: row.job_title, model: row.model, effort: row.effort, color: row.color, tools: JSON.parse(row.tools), prompt: row.prompt });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/api/employees/:id", (req, res) => {
  dbDeleteEmployee(req.params.id);
  res.json({ ok: true });
});

// ── Team settings API ─────────────────────────────────────────────────────────

app.get("/api/settings", (_req, res) => {
  res.json(getTeamSettings());
});

app.put("/api/settings", (req, res) => {
  try {
    const { team_name, team_context } = req.body;
    res.json(updateTeamSettings({ team_name, team_context }));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Auto-suggest endpoints ───────────────────────────────────────────────────

app.post("/api/suggest-prompt", async (req, res) => {
  const { name, job_title } = req.body;
  if (!name && !job_title) { res.status(400).json({ error: "name or job_title required" }); return; }
  const identity = [name, job_title].filter(Boolean).join(", ");
  let result = "";
  try {
    for await (const msg of query({
      prompt: `Generate a concise background brief (3-5 short paragraphs) for an AI employee: ${identity}. This acts as their system prompt. Define their role, core expertise, working style, and how they communicate with colleagues. Write it in second person ("You are..."). Output ONLY the raw text — no markdown fences, no preamble, no explanation.`,
      options: {
        model: "haiku",
        allowedTools: [],
        systemPrompt: "You generate system prompts for AI assistants. Be concise, specific, and professional.",
        permissionMode: "plan",
        cwd: process.cwd(),
      },
    })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") result += block.text;
        }
      }
    }
    res.json({ suggestion: result.trim() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Chat helpers ─────────────────────────────────────────────────────────────

function loadEmployees(): Employee[] {
  return getAllEmployees().map(hydrateEmployee);
}

function extractMentions(text: string, validIds: string[]): Array<{ targetId: string; message: string }> {
  if (!validIds.length) return [];
  // Only match @handles that appear at the start of a line (the intended routing line).
  // This prevents mid-sentence "@mention" references from being accidentally routed.
  const pattern = new RegExp(`^@(${validIds.join("|")})\\b([^\\n]*)`, "gim");
  const byTarget = new Map<string, string>();
  for (const match of text.matchAll(pattern)) {
    const targetId = match[1]!.toLowerCase();
    // Use the inline message if present; otherwise use the full context from the original text
    // so a bare "@handle" line is still routed (agent forgot to append message text).
    const message = match[2]!.trim() || text.trim();
    byTarget.set(targetId, message);
  }
  return Array.from(byTarget.entries()).map(([targetId, message]) => ({ targetId, message }));
}

async function streamEmployee(
  employee: Employee,
  allEmployees: Employee[],
  message: string,
  res: express.Response,
  teamSettings: TeamSettings,
  targetEmployeeId?: string,
  toGroup = false,
): Promise<string> {
  const existing = getSession(employee.id);

  const queryOptions = {
    ...(employee.tools.length > 0 ? { allowedTools: employee.tools } : {}),
    systemPrompt: buildFullPrompt(employee, allEmployees, teamSettings),
    model: employee.model,
    permissionMode: "acceptEdits" as const,
    cwd: employee.workdir,
    additionalDirectories: [process.cwd()],
    ...(existing ? { resume: existing } : {}),
  };

  let sessionId = "";
  let fullText = "";

  for await (const msg of query({ prompt: message, options: queryOptions })) {
    if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;

    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          fullText += block.text;
          const type = toGroup ? "group_text" : "text";
          res.write(`data: ${JSON.stringify({ type, text: block.text })}\n\n`);
        }
      }
    }

    if (msg.type === "result" && msg.subtype === "success") {
      if (sessionId) setSession(employee.id, sessionId);
      const type = toGroup ? "group_done" : "done";
      res.write(`data: ${JSON.stringify({ type, targetEmployeeId: targetEmployeeId ?? null })}\n\n`);
    }
  }

  return fullText;
}

// ── Streaming chat endpoint ──────────────────────────────────────────────────

app.post("/chat", async (req, res) => {
  const { employeeId, message } = req.body as { employeeId: string; message: string };
  const allEmployees = loadEmployees();
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const isGroup = employeeId === "group";
  if (!isGroup && !empMap.has(employeeId)) {
    res.status(400).json({ error: `Unknown employee: ${employeeId}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const allIds = allEmployees.map(e => e.id);
  const ts = getTeamSettings();

  try {
    if (isGroup) {
      addGroupEntry(null, message);
      const groupMentions = extractMentions(message, allIds);

      if (groupMentions.length === 0) {
        const handles = allEmployees.map(e => "@" + e.id).join(", ");
        res.write(`data: ${JSON.stringify({ type: "hint", text: `Use @handle to mention an agent (${handles}).` })}\n\n`);
      } else {
        for (const { targetId, message: mentionMessage } of groupMentions) {
          const emp = empMap.get(targetId);
          if (!emp) continue;
          const ctx = `[Group channel]\n${mentionMessage}${getGroupContextString()}`;
          res.write(`data: ${JSON.stringify({ type: "mention_start", targetEmployeeId: targetId, message: mentionMessage })}\n\n`);
          const responseText = await streamEmployee(emp, allEmployees, ctx, res, ts, targetId, true);
          addGroupEntry(targetId, responseText);

          const chained = extractMentions(responseText, allIds.filter(i => i !== targetId));
          for (const { targetId: cid, message: cmsg } of chained) {
            const ce = empMap.get(cid);
            if (!ce) continue;
            addGroupEntry(targetId, `@${cid} ${cmsg}`);
            res.write(`data: ${JSON.stringify({ type: "mention_start", targetEmployeeId: cid, message: cmsg })}\n\n`);
            const ct = await streamEmployee(ce, allEmployees, `[Group channel]\n${cmsg}${getGroupContextString()}`, res, ts, cid, true);
            addGroupEntry(cid, ct);
          }
        }
      }
    } else {
      const emp = empMap.get(employeeId)!;
      const responseText = await streamEmployee(emp, allEmployees, message, res, ts);

      const mentions = extractMentions(responseText, allIds.filter(i => i !== employeeId));
      for (const { targetId, message: mentionMessage } of mentions) {
        const te = empMap.get(targetId);
        if (!te) continue;
        addGroupEntry(employeeId, `@${targetId} ${mentionMessage}`);
        res.write(`data: ${JSON.stringify({ type: "group_handoff_start", fromId: employeeId, targetId, message: mentionMessage })}\n\n`);
        const ct = await streamEmployee(te, allEmployees, `[Group channel]\n${mentionMessage}${getGroupContextString()}`, res, ts, targetId, true);
        addGroupEntry(targetId, ct);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`Roster running at http://localhost:${PORT}`);
});
