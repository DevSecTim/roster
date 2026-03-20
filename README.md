# claude-harness

Text your Claude-powered AI employees from a web UI, terminal, or programmatically — inspired by [OpenClaw](https://github.com/openclaw/openclaw).

Built on the [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

## Employees

| Name | Role | Tools |
|------|------|-------|
| **Dev** | Senior software engineer — writes and refactors code | Read, Write, Edit, Bash, Glob, Grep |
| **Reviewer** | Code reviewer (read-only) — quality, security, best practices | Read, Glob, Grep |
| **Researcher** | Research assistant — web search and doc synthesis | Read, Glob, Grep, WebSearch, WebFetch |
| **Ops** | DevOps/SRE — containers, CI/CD, infrastructure | Read, Write, Edit, Bash, Glob, Grep |

Add your own in `src/employees.ts`.

## Usage

### Web UI

```bash
npm run serve
# open http://localhost:3000
```

Select an employee chip, type a message, press Send. Responses stream in real-time. Conversations persist per-employee across messages.

### Terminal REPL

```bash
npm run chat
```

```
@dev write a hello world script
@reviewer look at src/server.ts for security issues
@researcher what is the difference between SSE and WebSockets
@ops write a Dockerfile for this project
```

### Programmatic

```ts
import { employees, messageEmployee } from "claude-harness";

const result = await messageEmployee(
  employees["researcher"]!,
  "What is OpenClaw?",
  { permissionMode: "acceptEdits" }
);

// Continue the conversation
const followUp = await messageEmployee(
  employees["researcher"]!,
  "How does it compare to this project?",
  { sessionId: result.sessionId }
);
```

## Adding Employees

Edit `src/employees.ts`:

```ts
export const employees: Record<string, Employee> = {
  "your-employee": {
    name: "Your Employee",
    description: "What they do (used for routing)",
    prompt: `You are ... your system prompt here`,
    tools: ["Read", "Glob", "Grep"],
  },
  // ...
};
```

Available tools: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run serve` | Start the web UI on port 3000 |
| `npm run chat` | Interactive terminal REPL |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode for library development |
