import { NextResponse } from "next/server";
import { z } from "zod";
import { cardFlowContactRecordSchema } from "@/lib/card-flow";
import { notifyNewContactsAdded } from "@/lib/contact-notifications";
import {
  deleteContact,
  listContacts,
  saveContacts,
  type StoredContactRecord,
} from "@/lib/contacts-db";

export const dynamic = "force-dynamic";

const saveContactSchema = cardFlowContactRecordSchema.extend({
  id: z.string(),
  added_at: z.string(),
});

const saveContactsBatchSchema = z.object({
  contacts: z.array(saveContactSchema).min(1),
});

export async function GET() {
  try {
    const contacts = await listContacts();
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("Contacts list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load contacts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();

    if (raw && typeof raw === "object" && Array.isArray((raw as { contacts?: unknown[] }).contacts)) {
      const payload = saveContactsBatchSchema.parse(raw);
      const result = await saveContacts(payload.contacts as StoredContactRecord[]);

      let notification:
        | { sent: true; messageId: string }
        | { sent: false; reason: string }
        | null = null;

      try {
        notification = await notifyNewContactsAdded(result.newlyAdded);
      } catch (error) {
        notification = {
          sent: false,
          reason:
            error instanceof Error ? error.message : "Failed to send notification email.",
        };
      }

      return NextResponse.json({
        saved: result.saved,
        newlyAdded: result.newlyAdded,
        updated: result.updated,
        notification,
      });
    }

    const payload = saveContactSchema.parse(raw);
    const result = await saveContacts([payload as StoredContactRecord]);

    let notification:
      | { sent: true; messageId: string }
      | { sent: false; reason: string }
      | null = null;

    try {
      notification = await notifyNewContactsAdded(result.newlyAdded);
    } catch (error) {
      notification = {
        sent: false,
        reason:
          error instanceof Error ? error.message : "Failed to send notification email.",
      };
    }

    return NextResponse.json({
      saved: result.saved[0],
      wasNew: result.newlyAdded.length > 0,
      notification,
    });
  } catch (error) {
    console.error("Contacts save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save contact." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteContact(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contacts delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete contact." },
      { status: 500 }
    );
  }
}
