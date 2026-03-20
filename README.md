# Roster

Text your Claude-powered AI employees from a web UI or terminal — inspired by [OpenClaw](https://github.com/openclaw/openclaw).

Built on the [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

## Usage

### Web UI

```bash
npm run serve
# open http://localhost:3000
```

Select an employee chip, type a message, press Send. Responses stream in real-time. Conversations persist per-employee across messages.

Use the **Group** channel to message multiple employees in one thread using `@handle` mentions. Employees can mention each other to hand off tasks.

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

## Managing Employees

Employees are created and managed through the web UI — click **+** in the employee bar to add one, or the pencil icon to edit. Each employee has a name, job title, background prompt, model, effort level, and colour.

Team-wide context (shared across all employees' system prompts) is set via the **⚙ Team Settings** button.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run serve` | Start the web UI on port 3000 |
| `npm run chat` | Interactive terminal REPL |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode |
