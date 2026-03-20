# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run serve   # Web UI at http://localhost:3000
npm run chat    # Terminal REPL
npm run build   # Compile TypeScript to dist/
npx tsc --noEmit  # Type-check without emitting
```

There are no tests yet. Type-checking (`npx tsc --noEmit`) is the primary correctness check.

## Architecture

The project has four layers on top of `@anthropic-ai/claude-agent-sdk`:

**`src/db.ts`** — SQLite database layer (via `better-sqlite3`). Stores employees, sessions, group chat history, and team settings. Employees are managed entirely through the UI — there is no static config file to edit.

**`src/employees.ts`** — Helpers used by the server: `hydrateEmployee()` (maps a DB row to a full `Employee` object), `buildFullPrompt()` (assembles the system prompt with team context and peer roster), and `buildTeamContext()`.

**`src/harness.ts`** — Thin wrapper around the SDK's `query()` function. `messageEmployee(employee, message, options)` handles session resumption (via `options.sessionId` → SDK `resume`), streams assistant text blocks to stdout, and returns `{ text, sessionId }` for multi-turn continuity.

**`src/server.ts`** — Express HTTP server. Serves the frontend from `src/public/` using the `eta` template engine (for server-side data injection). The `POST /chat` endpoint runs the `query()` loop and writes SSE frames (`data: {...}\n\n`) for streaming. Sessions are persisted to SQLite.

**`src/public/`** — Static frontend assets: `index.html` (eta template), `style.css`, `app.js`. No build step — served directly by `express.static`.

**`src/chat.ts`** — Terminal REPL. Parses `@employeeName message` syntax, calls `messageEmployee`, and tracks sessions in a `Map<string, string>`.

## Key SDK behaviours to know

- `query()` returns an async generator of typed `SDKMessage` events. The session ID comes from the `system/init` event, not from `result`.
- Narrowing `msg.type === "result"` alone is insufficient — must also check `msg.subtype === "success"` because `SDKResultMessage` is a union with `SDKResultError` (which has no `result` field).
- `permissionMode: "acceptEdits"` auto-approves file edits. The web server uses this for all sessions; the CLI harness defaults to `"default"` (asks).
- Sessions persist to `~/.claude/projects/<cwd-hash>/<session-id>.jsonl` automatically; pass `resume: sessionId` to continue them.

## Module system

The project is ESM (`"type": "module"` in package.json, `"module": "nodenext"` in tsconfig). All internal imports must use `.js` extensions (e.g. `"./employees.js"`). Run with `tsx` directly — no compilation step needed for development.
