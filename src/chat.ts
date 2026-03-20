import * as readline from "node:readline";
import { employees } from "./employees.js";
import { messageEmployee } from "./harness.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("=== Claude Harness - Text Your AI Employees ===\n");
  console.log("Available employees:");
  for (const [id, emp] of Object.entries(employees)) {
    console.log(`  @${id} - ${emp.name}: ${emp.description}`);
  }
  console.log("\nUsage: @<employee> <message>");
  console.log("Type 'quit' to exit.\n");

  // Track sessions per employee for conversation continuity
  const sessions = new Map<string, string>();

  while (true) {
    const input = await prompt("> ");
    const trimmed = input.trim();

    if (trimmed === "quit" || trimmed === "exit") {
      console.log("Bye!");
      rl.close();
      process.exit(0);
    }

    if (!trimmed) continue;

    // Parse @employee message
    const match = trimmed.match(/^@(\S+)\s+([\s\S]+)$/);
    if (!match) {
      console.log("Usage: @<employee> <message>  (e.g. @dev write a hello world script)\n");
      continue;
    }

    const [, employeeId, message] = match;
    if (!employeeId || !message) continue;

    const employee = employees[employeeId];
    if (!employee) {
      console.log(`Unknown employee: @${employeeId}`);
      console.log(`Available: ${Object.keys(employees).map((k) => `@${k}`).join(", ")}\n`);
      continue;
    }

    console.log(`\n[${employee.name}] ...`);

    try {
      const existingSession = sessions.get(employeeId);
      const result = await messageEmployee(employee, message, {
        ...(existingSession ? { sessionId: existingSession } : {}),
        cwd: process.cwd(),
      });

      // Store session for conversation continuity
      if (result.sessionId) {
        sessions.set(employeeId, result.sessionId);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();
  }
}

main().catch(console.error);
