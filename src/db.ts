import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "harness.db");
const EMPLOYEES_DIR = path.join(process.cwd(), "employees");

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeRow {
  id: string;
  name: string;
  job_title: string;
  prompt: string;
  tools: string; // JSON array
  model: string;
  effort: string;
  color: string;
  sort_order: number;
  workdir: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEmployeeInput {
  name: string;
  job_title: string;
  prompt: string;
  tools: string[];
  model?: string;
  effort?: string;
  color?: string;
}

export interface UpdateEmployeeInput {
  name?: string;
  job_title?: string;
  prompt?: string;
  tools?: string[];
  model?: string;
  effort?: string;
  color?: string;
}

export interface GroupEntry {
  id: number;
  employee_id: string | null;
  text: string;
  created_at: string;
}

export interface TeamSettings {
  team_name: string;
  team_context: string;
}

// ── DB singleton ─────────────────────────────────────────────────────────────

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialised — call initDb() first");
  return db;
}

// ── Slugify helper ───────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initDb(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      job_title  TEXT NOT NULL DEFAULT '',
      prompt     TEXT NOT NULL,
      tools      TEXT NOT NULL DEFAULT '[]',
      model      TEXT NOT NULL DEFAULT 'sonnet',
      effort     TEXT NOT NULL DEFAULT 'normal',
      color      TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      workdir    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      session_id  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT,
      text        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Migrations ────────────────────────────────────────────────────────────
  const cols = (db.pragma("table_info(employees)") as Array<{ name: string }>).map(c => c.name);

  // Drop legacy description/emoji columns via table recreation
  if (cols.includes("description") || cols.includes("emoji")) {
    db.exec(`
      ALTER TABLE employees RENAME TO employees_old;
      CREATE TABLE employees (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        job_title  TEXT NOT NULL DEFAULT '',
        prompt     TEXT NOT NULL,
        tools      TEXT NOT NULL DEFAULT '[]',
        model      TEXT NOT NULL DEFAULT 'sonnet',
        workdir    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO employees (id, name, prompt, tools, model, workdir, created_at, updated_at)
        SELECT id, name, prompt, tools, model, workdir, created_at, updated_at FROM employees_old;
      DROP TABLE employees_old;
    `);
  } else {
    if (!cols.includes("job_title")) {
      db.exec(`ALTER TABLE employees ADD COLUMN job_title TEXT NOT NULL DEFAULT ''`);
    }
    if (!cols.includes("effort")) {
      db.exec(`ALTER TABLE employees ADD COLUMN effort TEXT NOT NULL DEFAULT 'normal'`);
    }
    if (!cols.includes("sort_order")) {
      db.exec(`ALTER TABLE employees ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
      db.exec(`UPDATE employees SET sort_order = (SELECT COUNT(*) FROM employees e2 WHERE e2.created_at < employees.created_at)`);
    }
    if (!cols.includes("color")) {
      db.exec(`ALTER TABLE employees ADD COLUMN color TEXT NOT NULL DEFAULT ''`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO settings (key, value) VALUES ('team_name', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('team_context', '');
  `);
}

// ── Color palette ─────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#58a6ff", // blue
  "#bc8cff", // purple
  "#3fb950", // green
  "#ffa657", // orange
  "#f85149", // red
  "#d2a8ff", // lavender
  "#79c0ff", // sky
  "#56d364", // mint
];

function nextColor(): string {
  const count = (getDb().prepare("SELECT COUNT(*) as n FROM employees").get() as { n: number }).n;
  return COLOR_PALETTE[count % COLOR_PALETTE.length]!;
}

// ── Ensure workdir exists with MEMORY.md ─────────────────────────────────────

function ensureWorkdir(id: string): string {
  const dir = path.join(EMPLOYEES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const mem = path.join(dir, "MEMORY.md");
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, "");
  return dir;
}

// ── Employee CRUD ────────────────────────────────────────────────────────────

export function getAllEmployees(): EmployeeRow[] {
  return getDb().prepare("SELECT id, name, job_title, prompt, tools, model, effort, color, sort_order, workdir, created_at, updated_at FROM employees ORDER BY sort_order, created_at").all() as EmployeeRow[];
}

export function getEmployee(id: string): EmployeeRow | undefined {
  return getDb().prepare("SELECT id, name, job_title, prompt, tools, model, effort, color, sort_order, workdir, created_at, updated_at FROM employees WHERE id = ?").get(id) as EmployeeRow | undefined;
}

export function createEmployee(input: CreateEmployeeInput): EmployeeRow {
  const id = slugify(input.name);
  if (!id) throw new Error("Name produces an empty slug");

  const existing = getEmployee(id);
  if (existing) throw new Error(`Employee "${id}" already exists`);

  const workdir = ensureWorkdir(id);
  const tools = JSON.stringify(input.tools);
  const color = input.color || nextColor();

  getDb()
    .prepare(
      `INSERT INTO employees (id, name, job_title, prompt, tools, model, effort, color, workdir)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.name, input.job_title, input.prompt, tools, input.model ?? "sonnet", input.effort ?? "normal", color, workdir);

  return getEmployee(id)!;
}

export function updateEmployee(id: string, input: UpdateEmployeeInput): EmployeeRow {
  const existing = getEmployee(id);
  if (!existing) throw new Error(`Employee "${id}" not found`);

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name);
  }
  if (input.job_title !== undefined) {
    sets.push("job_title = ?");
    vals.push(input.job_title);
  }
  if (input.prompt !== undefined) {
    sets.push("prompt = ?");
    vals.push(input.prompt);
  }
  if (input.tools !== undefined) {
    sets.push("tools = ?");
    vals.push(JSON.stringify(input.tools));
  }
  if (input.model !== undefined) {
    sets.push("model = ?");
    vals.push(input.model);
  }
  if (input.effort !== undefined) {
    sets.push("effort = ?");
    vals.push(input.effort);
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    vals.push(input.color);
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE employees SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  return getEmployee(id)!;
}

export function deleteEmployee(id: string): void {
  getDb().prepare("DELETE FROM employees WHERE id = ?").run(id);
}

export function reorderEmployees(ids: string[]): void {
  const stmt = getDb().prepare("UPDATE employees SET sort_order = ? WHERE id = ?");
  ids.forEach((id, idx) => stmt.run(idx, id));
}

// ── Team settings ─────────────────────────────────────────────────────────────

export function getTeamSettings(): TeamSettings {
  const row = (key: string) =>
    (getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? "";
  return { team_name: row("team_name"), team_context: row("team_context") };
}

export function updateTeamSettings(input: Partial<TeamSettings>): TeamSettings {
  const stmt = getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  if (input.team_name !== undefined) stmt.run("team_name", input.team_name);
  if (input.team_context !== undefined) stmt.run("team_context", input.team_context);
  return getTeamSettings();
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function getSession(employeeId: string): string | undefined {
  const row = getDb()
    .prepare("SELECT session_id FROM sessions WHERE employee_id = ?")
    .get(employeeId) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(employeeId: string, sessionId: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO sessions (employee_id, session_id) VALUES (?, ?)")
    .run(employeeId, sessionId);
}

// ── Group history ────────────────────────────────────────────────────────────

export function addGroupEntry(employeeId: string | null, text: string): void {
  getDb()
    .prepare("INSERT INTO group_history (employee_id, text) VALUES (?, ?)")
    .run(employeeId, text);
}

export function getGroupHistory(limit = 40): GroupEntry[] {
  return getDb()
    .prepare("SELECT * FROM group_history ORDER BY id DESC LIMIT ?")
    .all(limit) as GroupEntry[];
}

export function getGroupContextString(): string {
  const rows = getGroupHistory();
  if (rows.length === 0) return "";
  const lines = rows
    .reverse()
    .map((e) => `[${e.employee_id ?? "User"}]: ${e.text}`)
    .join("\n");
  return `\n\n## Recent group channel history\n${lines}`;
}
