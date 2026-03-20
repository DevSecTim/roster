import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Employee } from "./employees.js";

export interface HarnessOptions {
  /** Working directory for the agent */
  cwd?: string;
  /** Permission mode: "default" requires approval, "acceptEdits" auto-approves safe ops */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
}

export interface MessageResult {
  text: string;
  sessionId: string;
}

/**
 * Send a message to an employee agent and stream the response.
 * Supports multi-turn via sessionId for conversation continuity.
 */
export async function messageEmployee(
  employee: Employee,
  message: string,
  options: HarnessOptions & { sessionId?: string } = {},
): Promise<MessageResult> {
  const chunks: string[] = [];
  let sessionId = "";

  const queryOptions: Options = {
    allowedTools: employee.tools,
    systemPrompt: employee.prompt,
    permissionMode: options.permissionMode ?? "default",
    cwd: options.cwd,
    resume: options.sessionId,
  };

  for await (const msg of query({ prompt: message, options: queryOptions })) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
    }

    if (msg.type === "assistant") {
      const content = msg.message.content;
      for (const block of content) {
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
  return { text: chunks.join(""), sessionId };
}
