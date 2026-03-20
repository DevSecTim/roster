import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  job_title: string;
  prompt: string;
  tools: string[];
  model: string; // 'sonnet' | 'opus' | 'haiku'
  effort: string; // 'normal' | 'high' | 'max'
  color: string;
  workdir: string;
}

// ── Hydrate an EmployeeRow (DB row with JSON tools string) into Employee ────

export function hydrateEmployee(row: {
  id: string;
  name: string;
  job_title: string;
  prompt: string;
  tools: string;
  model: string;
  effort: string;
  color: string;
  workdir: string;
}): Employee {
  return {
    id: row.id,
    name: row.name,
    job_title: row.job_title,
    prompt: row.prompt,
    tools: JSON.parse(row.tools) as string[],
    model: row.model,
    effort: row.effort,
    color: row.color,
    workdir: row.workdir,
  };
}

// ── Dynamic team context ─────────────────────────────────────────────────────

export function buildTeamContext(allEmployees: Employee[]): string {
  if (allEmployees.length <= 1) return "";

  const handles = allEmployees
    .map((e) => `- @${e.id} — ${e.name}${e.job_title ? `, ${e.job_title}` : ""}`)
    .join("\n");

  return `
## Your team & communication rules

You work inside a chat application that has two types of channels:

- **DM channels** — one private conversation between you and the user. Only you and the user see this.
- **The Group** — a single shared team chat in the same app, visible to all employees and the user. This is where employees communicate with each other. Think of it as a team Slack channel.

Never refer to teammates in your DM response as if they can read it — your DM is private.

### How to reach a teammate — two-part pattern (IMPORTANT)
When you need to contact a teammate, use this two-part structure in your reply:

**Part 1 — Speak to the user in the DM (brief, friendly):**
Tell the user what you're doing in one sentence, e.g.:
"Done — I've sent that over to Reviewer in the group."

**Part 2 — The @mention action (on its own line at the very end):**
Write the @handle and the actual message for your teammate. The system strips this line from your DM and routes it to the Group automatically.

Available handles:
${handles}

Full example of a correct DM reply when asked to contact a teammate:
---
Sure, I'll get Reviewer on it right away.
@reviewer please review this for security issues: the user has a login form that stores passwords in plaintext
---

Never write the teammate's message inside your DM response body. Always put it on the final @mention line only.

### When you receive a [Group channel] message
You were @mentioned in the Group. Your response is posted to the Group channel and visible to all team members. Read the group history provided and avoid repeating what teammates have already said. You may chain to another teammate using their @handle at the end of your group reply.

Only mention a teammate when it genuinely adds value. Do not mention yourself.`;
}

// ── Build the full system prompt for an employee ─────────────────────────────

function loadMemory(workdir: string): string {
  const memPath = path.join(workdir, "MEMORY.md");
  try {
    return fs.readFileSync(memPath, "utf8");
  } catch {
    return "";
  }
}

export function buildFullPrompt(
  employee: Employee,
  allEmployees: Employee[],
  teamSettings?: { team_name: string; team_context: string },
): string {
  const parts = [employee.prompt];

  if (teamSettings?.team_name?.trim() || teamSettings?.team_context?.trim()) {
    const nameLine = teamSettings.team_name?.trim()
      ? `You are part of **${teamSettings.team_name}**.`
      : "";
    const ctx = teamSettings.team_context?.trim() ?? "";
    parts.push(`---\n\n## Organisation context\n\n${[nameLine, ctx].filter(Boolean).join("\n\n")}`);
  }

  const teamCtx = buildTeamContext(allEmployees);
  if (teamCtx) parts.push(teamCtx);

  const memory = loadMemory(employee.workdir);
  if (memory.trim()) {
    parts.push(`---\n\n## Your current memory\n\n${memory}`);
  }

  return parts.join("\n\n");
}
