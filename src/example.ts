/**
 * Example: Use the harness programmatically to message employees.
 *
 * Run: npx tsx src/example.ts
 *
 * NOTE: You must first create employees via the web UI (npm run serve).
 */
import { initDb, getAllEmployees, hydrateEmployee, messageEmployee } from "./index.js";

async function main() {
  initDb();

  const rows = getAllEmployees();
  if (rows.length === 0) {
    console.log("No employees configured. Use the web UI (npm run serve) to create some.");
    return;
  }

  const allEmployees = rows.map(hydrateEmployee);
  const target = allEmployees[0]!;

  console.log(`Messaging ${target.name}...`);

  const result = await messageEmployee(
    target,
    allEmployees,
    "Hello! Give me a brief introduction of yourself.",
    { permissionMode: "acceptEdits" },
  );

  console.log("\n--- Result ---");
  console.log(`Session: ${result.sessionId}`);
  console.log(`Response length: ${result.text.length} chars`);
}

main().catch(console.error);
