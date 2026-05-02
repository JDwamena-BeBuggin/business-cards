import { type CardFlowContact, normalizeTags } from "@/lib/card-flow";

export type StoredContactRecord = CardFlowContact & {
  id: string;
  added_at: string;
  updated_at?: string;
};

export type SaveContactsResult = {
  saved: StoredContactRecord[];
  newlyAdded: StoredContactRecord[];
  updated: StoredContactRecord[];
};

type D1Database = {
  prepare: (sql: string) => D1PreparedStatement;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<unknown>;
  all: () => Promise<{ results: Record<string, unknown>[] }>;
};

type ContactRow = Record<string, unknown>;

let schemaReady = false;

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

async function addColumnIfMissing(db: D1Database, sql: string) {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }
}

async function ensureD1Schema(db: D1Database) {
  if (schemaReady) return;

  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', cell_phone TEXT NOT NULL DEFAULT '', office_phone TEXT NOT NULL DEFAULT '', fax_phone TEXT NOT NULL DEFAULT '', other_phone TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', linkedin TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', contact_type TEXT NOT NULL DEFAULT 'Other', tags TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'Business Card', date_met TEXT NOT NULL DEFAULT '', event TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', follow_up_email_subject TEXT NOT NULL DEFAULT '', follow_up_email_body TEXT NOT NULL DEFAULT '', follow_up_linkedin_msg TEXT NOT NULL DEFAULT '', follow_up_crm_note TEXT NOT NULL DEFAULT '', follow_up_task TEXT NOT NULL DEFAULT '', follow_up_status TEXT NOT NULL DEFAULT 'Needed', added_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    .run();

  await addColumnIfMissing(
    db,
    "ALTER TABLE contacts ADD COLUMN follow_up_email_subject TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE contacts ADD COLUMN follow_up_email_body TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE contacts ADD COLUMN follow_up_linkedin_msg TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE contacts ADD COLUMN follow_up_crm_note TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE contacts ADD COLUMN follow_up_task TEXT NOT NULL DEFAULT ''"
  );

  schemaReady = true;
}

function normalizeContact(contact: StoredContactRecord): StoredContactRecord {
  return {
    ...contact,
    tags: normalizeTags(contact.tags),
    follow_up_email_subject: contact.follow_up_email_subject || "",
    follow_up_email_body: contact.follow_up_email_body || "",
    follow_up_linkedin_msg: contact.follow_up_linkedin_msg || "",
    follow_up_crm_note: contact.follow_up_crm_note || "",
    follow_up_task: contact.follow_up_task || "",
    follow_up_status: contact.follow_up_status || "Needed",
  };
}

function rowToContact(row: ContactRow): StoredContactRecord {
  return normalizeContact({
    id: String(row.id || ""),
    first_name: String(row.first_name || ""),
    last_name: String(row.last_name || ""),
    title: String(row.title || ""),
    company: String(row.company || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    cell_phone: String(row.cell_phone || ""),
    office_phone: String(row.office_phone || ""),
    fax_phone: String(row.fax_phone || ""),
    other_phone: String(row.other_phone || ""),
    website: String(row.website || ""),
    linkedin: String(row.linkedin || ""),
    address: String(row.address || ""),
    contact_type: (String(row.contact_type || "Other") as CardFlowContact["contact_type"]),
    tags: normalizeTags(JSON.parse(String(row.tags || "[]")) as string[]),
    source: String(row.source || "Business Card"),
    date_met: String(row.date_met || ""),
    event: String(row.event || ""),
    notes: String(row.notes || ""),
    follow_up_email_subject: String(row.follow_up_email_subject || ""),
    follow_up_email_body: String(row.follow_up_email_body || ""),
    follow_up_linkedin_msg: String(row.follow_up_linkedin_msg || ""),
    follow_up_crm_note: String(row.follow_up_crm_note || ""),
    follow_up_task: String(row.follow_up_task || ""),
    follow_up_status: String(row.follow_up_status || "Needed"),
    added_at: String(row.added_at || ""),
    updated_at: String(row.updated_at || ""),
  });
}

function namesCompanyMatch(a: StoredContactRecord, b: StoredContactRecord) {
  return (
    a.first_name.trim() &&
    a.last_name.trim() &&
    a.company.trim() &&
    a.first_name.trim().toLowerCase() === b.first_name.trim().toLowerCase() &&
    a.last_name.trim().toLowerCase() === b.last_name.trim().toLowerCase() &&
    a.company.trim().toLowerCase() === b.company.trim().toLowerCase()
  );
}

function contactsMatch(a: StoredContactRecord, b: StoredContactRecord) {
  const aEmail = a.email.trim().toLowerCase();
  const bEmail = b.email.trim().toLowerCase();

  if (aEmail && bEmail && aEmail === bEmail) {
    return true;
  }

  return namesCompanyMatch(a, b);
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

async function findExistingD1Contact(
  db: D1Database,
  candidate: StoredContactRecord
): Promise<StoredContactRecord | null> {
  if (candidate.id) {
    const { results } = await db
      .prepare("SELECT * FROM contacts WHERE id = ? LIMIT 1")
      .bind(candidate.id)
      .all();
    if (results[0]) {
      return rowToContact(results[0]);
    }
  }

  const email = candidate.email.trim().toLowerCase();
  if (email) {
    const { results } = await db
      .prepare("SELECT * FROM contacts WHERE lower(email) = ? LIMIT 1")
      .bind(email)
      .all();
    if (results[0]) {
      return rowToContact(results[0]);
    }
  }

  if (
    candidate.first_name.trim() &&
    candidate.last_name.trim() &&
    candidate.company.trim()
  ) {
    const { results } = await db
      .prepare(
        "SELECT * FROM contacts WHERE lower(first_name) = ? AND lower(last_name) = ? AND lower(company) = ? LIMIT 1"
      )
      .bind(
        candidate.first_name.trim().toLowerCase(),
        candidate.last_name.trim().toLowerCase(),
        candidate.company.trim().toLowerCase()
      )
      .all();

    if (results[0]) {
      return rowToContact(results[0]);
    }
  }

  return null;
}

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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
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

async function saveOneContact(
  contact: StoredContactRecord
): Promise<{ saved: StoredContactRecord; created: boolean }> {
  const normalized = normalizeContact(contact);
  const now = new Date().toISOString();
  const db = getD1();

  if (db) {
    await ensureD1Schema(db);
    const existing = await findExistingD1Contact(db, normalized);
    const saved = {
      ...normalized,
      id: existing?.id || normalized.id || crypto.randomUUID(),
      added_at: existing?.added_at || normalized.added_at || now,
      updated_at: now,
    };

    await db
      .prepare(
        `INSERT INTO contacts (
          id, first_name, last_name, title, company, email, phone, cell_phone,
          office_phone, fax_phone, other_phone, website, linkedin, address,
          contact_type, tags, source, date_met, event, notes,
          follow_up_email_subject, follow_up_email_body, follow_up_linkedin_msg,
          follow_up_crm_note, follow_up_task, follow_up_status, added_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          first_name=excluded.first_name, last_name=excluded.last_name,
          title=excluded.title, company=excluded.company, email=excluded.email,
          phone=excluded.phone, cell_phone=excluded.cell_phone,
          office_phone=excluded.office_phone, fax_phone=excluded.fax_phone,
          other_phone=excluded.other_phone, website=excluded.website,
          linkedin=excluded.linkedin, address=excluded.address,
          contact_type=excluded.contact_type, tags=excluded.tags,
          source=excluded.source, date_met=excluded.date_met, event=excluded.event,
          notes=excluded.notes,
          follow_up_email_subject=excluded.follow_up_email_subject,
          follow_up_email_body=excluded.follow_up_email_body,
          follow_up_linkedin_msg=excluded.follow_up_linkedin_msg,
          follow_up_crm_note=excluded.follow_up_crm_note,
          follow_up_task=excluded.follow_up_task,
          follow_up_status=excluded.follow_up_status,
          updated_at=excluded.updated_at`
      )
      .bind(
        saved.id,
        saved.first_name,
        saved.last_name,
        saved.title,
        saved.company,
        saved.email,
        saved.phone,
        saved.cell_phone,
        saved.office_phone,
        saved.fax_phone,
        saved.other_phone,
        saved.website,
        saved.linkedin,
        saved.address,
        saved.contact_type,
        JSON.stringify(saved.tags),
        saved.source,
        saved.date_met,
        saved.event,
        saved.notes,
        saved.follow_up_email_subject,
        saved.follow_up_email_body,
        saved.follow_up_linkedin_msg,
        saved.follow_up_crm_note,
        saved.follow_up_task,
        saved.follow_up_status,
        saved.added_at,
        saved.updated_at
      )
      .run();

    return { saved, created: !existing };
  }

  const existing = await readLocalContacts();
  const matched = existing.find((entry) => contactsMatch(entry, normalized)) || null;
  const saved = {
    ...normalized,
    id: matched?.id || normalized.id || crypto.randomUUID(),
    added_at: matched?.added_at || normalized.added_at || now,
    updated_at: now,
  };

  const nextRecords = sortByDate([
    saved,
    ...existing.filter((entry) => entry.id !== saved.id),
  ]);
  await writeLocalContacts(nextRecords);

  return { saved, created: !matched };
}

export async function saveContacts(
  contacts: StoredContactRecord[]
): Promise<SaveContactsResult> {
  const saved: StoredContactRecord[] = [];
  const newlyAdded: StoredContactRecord[] = [];
  const updated: StoredContactRecord[] = [];

  for (const contact of contacts) {
    const result = await saveOneContact(contact);
    saved.push(result.saved);
    if (result.created) {
      newlyAdded.push(result.saved);
    } else {
      updated.push(result.saved);
    }
  }

  return { saved, newlyAdded, updated };
}

export async function upsertContact(contact: StoredContactRecord): Promise<StoredContactRecord> {
  const result = await saveContacts([contact]);
  return result.saved[0];
}

export async function deleteContact(id: string): Promise<void> {
  const db = getD1();
  if (db) {
    await ensureD1Schema(db);
    await db.prepare("DELETE FROM contacts WHERE id = ?").bind(id).run();
    return;
  }

  const existing = await readLocalContacts();
  await writeLocalContacts(existing.filter((entry) => entry.id !== id));
}

export function createContactId() {
  return crypto.randomUUID();
}
