import type { Client as TursoClient } from "@tursodatabase/serverless/compat";
import { type CardFlowContact, normalizeTags } from "@/lib/card-flow";

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  cell_phone: string;
  office_phone: string;
  fax_phone: string;
  other_phone: string;
  website: string;
  linkedin: string;
  address: string;
  contact_type: string;
  tags: string;
  source: string;
  date_met: string;
  event: string;
  notes: string;
  follow_up_status: string;
  added_at: string;
  updated_at: string;
};

export type StoredContactRecord = CardFlowContact & {
  id: string;
  added_at: string;
  updated_at?: string;
};

const globalForContactsDb = globalThis as unknown as {
  contactsClient: TursoClient | undefined;
  contactsSchemaReady: Promise<void> | undefined;
};

function isRemoteDatabase() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

function getLocalDataPath() {
  const path = require("path") as typeof import("path");
  return path.join(process.cwd(), "data", "business-cards.json");
}

// Reads contacts from the local JSON file. Returns [] gracefully when the
// filesystem is unavailable (e.g. in Cloudflare Workers without Turso).
async function readLocalContactsFile(): Promise<StoredContactRecord[]> {
  try {
    const fs = (await import("fs/promises")) as typeof import("fs/promises");
    const dataPath = getLocalDataPath();
    const path = require("path") as typeof import("path");
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    const raw = await fs.readFile(dataPath, "utf8");
    const parsed = JSON.parse(raw) as StoredContactRecord[];
    return Array.isArray(parsed) ? parsed.map(normalizeContactForStorage) : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    // In Cloudflare Workers, fs is unavailable — return empty gracefully
    return [];
  }
}

// Writes contacts to the local JSON file. Silently no-ops when the filesystem
// is unavailable (Cloudflare Workers without Turso).
async function writeLocalContactsFile(records: StoredContactRecord[]) {
  try {
    const fs = (await import("fs/promises")) as typeof import("fs/promises");
    const dataPath = getLocalDataPath();
    const path = require("path") as typeof import("path");
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(
      dataPath,
      JSON.stringify(records.map(normalizeContactForStorage), null, 2),
      "utf8"
    );
  } catch {
    // Silently ignore — Workers environment has no writable filesystem
  }
}

async function createRemoteClient() {
  const { createClient } = await import("@tursodatabase/serverless/compat");

  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

async function getRemoteClient() {
  if (!globalForContactsDb.contactsClient) {
    globalForContactsDb.contactsClient = await createRemoteClient();
  }

  return globalForContactsDb.contactsClient;
}

async function ensureRemoteSchema() {
  if (!globalForContactsDb.contactsSchemaReady) {
    globalForContactsDb.contactsSchemaReady = (async () => {
      const client = await getRemoteClient();
      await client.execute(`
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
    })();
  }

  await globalForContactsDb.contactsSchemaReady;
}

function mapRowToContact(row: ContactRow): StoredContactRecord {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    title: row.title,
    company: row.company,
    email: row.email,
    phone: row.phone,
    cell_phone: row.cell_phone,
    office_phone: row.office_phone,
    fax_phone: row.fax_phone,
    other_phone: row.other_phone,
    website: row.website,
    linkedin: row.linkedin,
    address: row.address,
    contact_type: row.contact_type as CardFlowContact["contact_type"],
    tags: normalizeTags(JSON.parse(row.tags) as string[]),
    source: row.source,
    date_met: row.date_met,
    event: row.event,
    notes: row.notes,
    follow_up_status: row.follow_up_status,
    added_at: row.added_at,
    updated_at: row.updated_at,
  };
}

function normalizeContactForStorage(contact: StoredContactRecord): StoredContactRecord {
  return {
    ...contact,
    tags: normalizeTags(contact.tags),
  };
}

function sortContacts(records: StoredContactRecord[]) {
  return [...records].sort((a, b) => {
    const aDate = Date.parse(a.added_at || "") || 0;
    const bDate = Date.parse(b.added_at || "") || 0;
    if (bDate !== aDate) {
      return bDate - aDate;
    }

    const aUpdated = Date.parse(a.updated_at || "") || 0;
    const bUpdated = Date.parse(b.updated_at || "") || 0;
    return bUpdated - aUpdated;
  });
}

export async function listContacts() {
  if (!isRemoteDatabase()) {
    return sortContacts(await readLocalContactsFile());
  }

  await ensureRemoteSchema();
  const client = await getRemoteClient();
  const result = await client.execute(
    "SELECT * FROM contacts ORDER BY datetime(added_at) DESC, updated_at DESC"
  );

  return result.rows.map((row) => mapRowToContact(row as unknown as ContactRow));
}

export async function upsertContact(contact: StoredContactRecord) {
  const normalized = normalizeContactForStorage(contact);
  const now = new Date().toISOString();

  if (!isRemoteDatabase()) {
    const existing = await readLocalContactsFile();
    const nextRecord = {
      ...normalized,
      added_at: normalized.added_at || now,
      updated_at: now,
    };

    const updated = existing.filter((row) => row.id !== normalized.id);
    updated.unshift(nextRecord);
    await writeLocalContactsFile(sortContacts(updated));
    return nextRecord;
  }

  await ensureRemoteSchema();
  const client = await getRemoteClient();

  await client.execute({
    sql: `
      INSERT INTO contacts (
        id, first_name, last_name, title, company, email, phone, cell_phone,
        office_phone, fax_phone, other_phone, website, linkedin, address,
        contact_type, tags, source, date_met, event, notes, follow_up_status,
        added_at, updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        title = excluded.title,
        company = excluded.company,
        email = excluded.email,
        phone = excluded.phone,
        cell_phone = excluded.cell_phone,
        office_phone = excluded.office_phone,
        fax_phone = excluded.fax_phone,
        other_phone = excluded.other_phone,
        website = excluded.website,
        linkedin = excluded.linkedin,
        address = excluded.address,
        contact_type = excluded.contact_type,
        tags = excluded.tags,
        source = excluded.source,
        date_met = excluded.date_met,
        event = excluded.event,
        notes = excluded.notes,
        follow_up_status = excluded.follow_up_status,
        updated_at = excluded.updated_at
    `,
    args: [
      normalized.id,
      normalized.first_name,
      normalized.last_name,
      normalized.title,
      normalized.company,
      normalized.email,
      normalized.phone,
      normalized.cell_phone,
      normalized.office_phone,
      normalized.fax_phone,
      normalized.other_phone,
      normalized.website,
      normalized.linkedin,
      normalized.address,
      normalized.contact_type,
      JSON.stringify(normalized.tags),
      normalized.source,
      normalized.date_met,
      normalized.event,
      normalized.notes,
      normalized.follow_up_status,
      normalized.added_at || now,
      now,
    ],
  });

  const refreshed = await client.execute({
    sql: "SELECT * FROM contacts WHERE id = ? LIMIT 1",
    args: [normalized.id],
  });

  const row = refreshed.rows[0];
  if (!row) {
    throw new Error("Contact save failed.");
  }

  return mapRowToContact(row as unknown as ContactRow);
}

export async function deleteContact(id: string) {
  if (!isRemoteDatabase()) {
    const existing = await readLocalContactsFile();
    await writeLocalContactsFile(existing.filter((row) => row.id !== id));
    return;
  }

  await ensureRemoteSchema();
  const client = await getRemoteClient();
  await client.execute({
    sql: "DELETE FROM contacts WHERE id = ?",
    args: [id],
  });
}

export function createContactId() {
  return crypto.randomUUID();
}
