import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Employee } from "./employees.js";
import { buildFullPrompt } from "./employees.js";
import { getSession, setSession, getTeamSettings } from "./db.js";

export interface HarnessOptions {
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
}

export interface MessageResult {
  text: string;
  sessionId: string;
}

/**
 * Send a message to an employee agent and stream the response.
 * Sessions persist via SQLite.
 */
export async function messageEmployee(
  employee: Employee,
  allEmployees: Employee[],
  message: string,
  options: HarnessOptions = {},
): Promise<MessageResult> {
  const chunks: string[] = [];
  let sessionId = "";

  const existingSession = getSession(employee.id);

  const queryOptions: Options = {
    ...(employee.tools.length > 0 ? { allowedTools: employee.tools } : {}),
    systemPrompt: buildFullPrompt(employee, allEmployees, getTeamSettings()),
    permissionMode: options.permissionMode ?? "default",
    model: employee.model,
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
    setSession(employee.id, sessionId);
  }

  return { text: chunks.join(""), sessionId };
}
