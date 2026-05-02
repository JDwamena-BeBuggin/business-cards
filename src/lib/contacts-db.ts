import { type CardFlowContact, normalizeTags } from "@/lib/card-flow";

export type StoredContactRecord = CardFlowContact & {
  id: string;
  added_at: string;
  updated_at?: string;
};

// ─── D1 helpers ──────────────────────────────────────────────────────────────

type D1Database = {
  prepare: (sql: string) => D1PreparedStatement;
  exec: (sql: string) => Promise<unknown>;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<unknown>;
  all: () => Promise<{ results: Record<string, unknown>[] }>;
};

function getD1(): D1Database | null {
  try {
    // getCloudflareContext is only available at runtime inside a Cloudflare Worker
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const ctx = getCloudflareContext() as { env?: { DB?: D1Database } };
    return ctx?.env?.DB ?? null;
  } catch {
    return null;
  }
}

async function ensureD1Schema(db: D1Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      cell_phone TEXT NOT NULL DEFAULT '',
      office_phone TEXT NOT NULL DEFAULT '',
      fax_phone TEXT NOT NULL DEFAULT '',
      other_phone TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      linkedin TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      contact_type TEXT NOT NULL DEFAULT 'Other',
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'Business Card',
      date_met TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      follow_up_status TEXT NOT NULL DEFAULT 'Needed',
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function rowToContact(row: Record<string, unknown>): StoredContactRecord {
  return {
    id: row.id as string,
    first_name: (row.first_name as string) ?? "",
    last_name: (row.last_name as string) ?? "",
    title: (row.title as string) ?? "",
    company: (row.company as string) ?? "",
    email: (row.email as string) ?? "",
    phone: (row.phone as string) ?? "",
    cell_phone: (row.cell_phone as string) ?? "",
    office_phone: (row.office_phone as string) ?? "",
    fax_phone: (row.fax_phone as string) ?? "",
    other_phone: (row.other_phone as string) ?? "",
    website: (row.website as string) ?? "",
    linkedin: (row.linkedin as string) ?? "",
    address: (row.address as string) ?? "",
    contact_type: (row.contact_type as CardFlowContact["contact_type"]) ?? "Other",
    tags: normalizeTags(JSON.parse((row.tags as string) || "[]") as string[]),
    source: (row.source as string) ?? "Business Card",
    date_met: (row.date_met as string) ?? "",
    event: (row.event as string) ?? "",
    notes: (row.notes as string) ?? "",
    follow_up_status: (row.follow_up_status as string) ?? "Needed",
    added_at: row.added_at as string,
    updated_at: (row.updated_at as string) ?? "",
  };
}

// ─── Local JSON fallback (dev only) ──────────────────────────────────────────

function getLocalDataPath() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  return path.join(process.cwd(), "data", "business-cards.json");
}

async function readLocalContacts(): Promise<StoredContactRecord[]> {
  try {
    const fs = (await import("fs/promises")) as typeof import("fs/promises");
    const dataPath = getLocalDataPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    const raw = await fs.readFile(dataPath, "utf8");
    const parsed = JSON.parse(raw) as StoredContactRecord[];
    return Array.isArray(parsed) ? parsed.map(normalizeContact) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

async function writeLocalContacts(records: StoredContactRecord[]) {
  try {
    const fs = (await import("fs/promises")) as typeof import("fs/promises");
    const dataPath = getLocalDataPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(records.map(normalizeContact), null, 2), "utf8");
  } catch {
    // No writable filesystem in Workers
  }
}

function normalizeContact(c: StoredContactRecord): StoredContactRecord {
  return { ...c, tags: normalizeTags(c.tags) };
}

function sortByDate(records: StoredContactRecord[]) {
  return [...records].sort((a, b) => {
    const ad = Date.parse(a.added_at || "") || 0;
    const bd = Date.parse(b.added_at || "") || 0;
    return bd !== ad
      ? bd - ad
      : (Date.parse(b.updated_at || "") || 0) - (Date.parse(a.updated_at || "") || 0);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listContacts(): Promise<StoredContactRecord[]> {
  const db = getD1();
  if (db) {
    await ensureD1Schema(db);
    const { results } = await db
      .prepare("SELECT * FROM contacts ORDER BY added_at DESC, updated_at DESC")
      .all();
    return results.map(rowToContact);
  }
  return sortByDate(await readLocalContacts());
}

export async function upsertContact(contact: StoredContactRecord): Promise<StoredContactRecord> {
  const normalized = normalizeContact(contact);
  const now = new Date().toISOString();
  const record = { ...normalized, added_at: normalized.added_at || now, updated_at: now };

  const db = getD1();
  if (db) {
    await ensureD1Schema(db);
    await db
      .prepare(
        `INSERT INTO contacts (
          id, first_name, last_name, title, company, email, phone, cell_phone,
          office_phone, fax_phone, other_phone, website, linkedin, address,
          contact_type, tags, source, date_met, event, notes, follow_up_status,
          added_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          first_name=excluded.first_name, last_name=excluded.last_name,
          title=excluded.title, company=excluded.company, email=excluded.email,
          phone=excluded.phone, cell_phone=excluded.cell_phone,
          office_phone=excluded.office_phone, fax_phone=excluded.fax_phone,
          other_phone=excluded.other_phone, website=excluded.website,
          linkedin=excluded.linkedin, address=excluded.address,
          contact_type=excluded.contact_type, tags=excluded.tags,
          source=excluded.source, date_met=excluded.date_met, event=excluded.event,
          notes=excluded.notes, follow_up_status=excluded.follow_up_status,
          updated_at=excluded.updated_at`
      )
      .bind(
        record.id,
        record.first_name,
        record.last_name,
        record.title,
        record.company,
        record.email,
        record.phone,
        record.cell_phone,
        record.office_phone,
        record.fax_phone,
        record.other_phone,
        record.website,
        record.linkedin,
        record.address,
        record.contact_type,
        JSON.stringify(record.tags),
        record.source,
        record.date_met,
        record.event,
        record.notes,
        record.follow_up_status,
        record.added_at,
        record.updated_at
      )
      .run();
    return record;
  }

  const existing = await readLocalContacts();
  const updated = [record, ...existing.filter((r) => r.id !== record.id)];
  await writeLocalContacts(sortByDate(updated));
  return record;
}

export async function deleteContact(id: string): Promise<void> {
  const db = getD1();
  if (db) {
    await ensureD1Schema(db);
    await db.prepare("DELETE FROM contacts WHERE id = ?").bind(id).run();
    return;
  }
  const existing = await readLocalContacts();
  await writeLocalContacts(existing.filter((r) => r.id !== id));
}

export function createContactId() {
  return crypto.randomUUID();
}
