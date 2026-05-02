import { NextResponse } from "next/server";
import { z } from "zod";
import { cardFlowContactRecordSchema } from "@/lib/card-flow";
import {
  deleteContact,
  listContacts,
  upsertContact,
  type StoredContactRecord,
} from "@/lib/contacts-db";

export const dynamic = "force-dynamic";

const saveContactSchema = cardFlowContactRecordSchema.extend({
  id: z.string(),
  added_at: z.string(),
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
    const payload = saveContactSchema.parse(await request.json());
    const saved = await upsertContact(payload as StoredContactRecord);
    return NextResponse.json(saved);
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
