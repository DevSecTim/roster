/**
 * Example: Use the harness programmatically to message employees.
 *
 * Run: npx tsx src/example.ts
 */
import { employees, messageEmployee } from "./index.js";

async function main() {
  // Send a one-shot message to the researcher
  const result = await messageEmployee(
    employees["researcher"]!,
    "What is OpenClaw and how does it work?",
    { permissionMode: "acceptEdits" },
  );

  console.log("\n--- Result ---");
  console.log(`Session: ${result.sessionId}`);
  console.log(`Response length: ${result.text.length} chars`);

  // Continue the conversation using the session ID
  const followUp = await messageEmployee(
    employees["researcher"]!,
    "How does it compare to this project?",
    { sessionId: result.sessionId, permissionMode: "acceptEdits" },
  );

  console.log("\n--- Follow-up ---");
  console.log(`Response length: ${followUp.text.length} chars`);
}

main().catch(console.error);
