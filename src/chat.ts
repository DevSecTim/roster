import * as readline from "node:readline";
import { initDb, getAllEmployees } from "./db.js";
import { hydrateEmployee } from "./employees.js";
import { messageEmployee } from "./harness.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  initDb();

  console.log("=== Roster - Text Your AI Employees ===\n");

  const rows = getAllEmployees();
  if (rows.length === 0) {
    console.log("No employees configured. Use the web UI (npm run serve) to create some.\n");
    rl.close();
    return;
  }

  const employees = rows.map(hydrateEmployee);

  console.log("Available employees:");
  for (const emp of employees) {
    console.log(`  @${emp.id} - ${emp.name}`);
  }
  console.log("\nUsage: @<employee> <message>");
  console.log("Type 'quit' to exit.\n");

  while (true) {
    const input = await prompt("> ");
    const trimmed = input.trim();

    if (trimmed === "quit" || trimmed === "exit") {
      console.log("Bye!");
      rl.close();
      process.exit(0);
    }

    if (!trimmed) continue;

    const match = trimmed.match(/^@(\S+)\s+([\s\S]+)$/);
    if (!match) {
      console.log("Usage: @<employee> <message>  (e.g. @dev write a hello world script)\n");
      continue;
    }

    const [, employeeId, message] = match;
    if (!employeeId || !message) continue;

    // Re-fetch in case employees were added/removed via web UI
    const allRows = getAllEmployees();
    const allEmployees = allRows.map(hydrateEmployee);
    const employee = allEmployees.find((e) => e.id === employeeId);

    if (!employee) {
      console.log(`Unknown employee: @${employeeId}`);
      console.log(`Available: ${allEmployees.map((e) => `@${e.id}`).join(", ")}\n`);
      continue;
    }

    console.log(`\n[${employee.name}] ...`);

    try {
      await messageEmployee(employee, allEmployees, message);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();
  }
}

main().catch(console.error);
