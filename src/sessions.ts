import * as fs from "node:fs";
import * as path from "node:path";

const SESSIONS_FILE = path.join(process.cwd(), ".claude", "sessions.json");

type SessionStore = Record<string, string>;

function load(): SessionStore {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")) as SessionStore;
  } catch {
    return {};
  }
}

function save(store: SessionStore): void {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2));
}

export function getSession(employeeId: string): string | undefined {
  return load()[employeeId];
}

export function setSession(employeeId: string, sessionId: string): void {
  const store = load();
  store[employeeId] = sessionId;
  save(store);
}
