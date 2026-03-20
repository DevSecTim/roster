import * as fs from "node:fs";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Employee } from "./employees.js";
import { getSession, setSession } from "./sessions.js";

export interface HarnessOptions {
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
}

export interface MessageResult {
  text: string;
  sessionId: string;
}

function loadMemory(workdir: string): string {
  const memPath = path.join(workdir, "MEMORY.md");
  try {
    return fs.readFileSync(memPath, "utf8");
  } catch {
    return "";
  }
}

export function buildSystemPrompt(employee: Employee): string {
  const memory = loadMemory(employee.workdir);
  if (!memory.trim()) return employee.prompt;
  return `${employee.prompt}\n\n---\n\n## Your current memory\n\n${memory}`;
}

/**
 * Send a message to an employee agent and stream the response.
 * Sessions and memory persist across restarts via disk storage.
 */
export async function messageEmployee(
  employeeId: string,
  employee: Employee,
  message: string,
  options: HarnessOptions = {},
): Promise<MessageResult> {
  const chunks: string[] = [];
  let sessionId = "";

  const existingSession = getSession(employeeId);

  const queryOptions: Options = {
    allowedTools: employee.tools,
    systemPrompt: buildSystemPrompt(employee),
    permissionMode: options.permissionMode ?? "default",
    cwd: employee.workdir,
    additionalDirectories: [process.cwd()],
    resume: existingSession,
  };

  for await (const msg of query({ prompt: message, options: queryOptions })) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
    }

    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
          chunks.push(block.text);
        }
      }
    }

    if (msg.type === "result" && msg.subtype === "success") {
      if (msg.result && chunks.length === 0) {
        chunks.push(msg.result);
      }
    }
  }

  process.stdout.write("\n");

  if (sessionId) {
    setSession(employeeId, sessionId);
  }

  return { text: chunks.join(""), sessionId };
}
