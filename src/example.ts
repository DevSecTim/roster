/**
 * Example: Use the harness programmatically to message employees.
 *
 * Run: npx tsx src/example.ts
 */
import { employees, messageEmployee } from "./index.js";

async function main() {
  // Send a one-shot message to the researcher
  const result = await messageEmployee(
    "researcher",
    employees["researcher"]!,
    "What is OpenClaw and how does it work?",
    { permissionMode: "acceptEdits" },
  );

  console.log("\n--- Result ---");
  console.log(`Session: ${result.sessionId}`);
  console.log(`Response length: ${result.text.length} chars`);

  // Continue the conversation (session is persisted automatically)
  const followUp = await messageEmployee(
    "researcher",
    employees["researcher"]!,
    "How does it compare to this project?",
    { permissionMode: "acceptEdits" },
  );

  console.log("\n--- Follow-up ---");
  console.log(`Response length: ${followUp.text.length} chars`);
}

main().catch(console.error);
