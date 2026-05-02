import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sendManualContactsEmail,
  type NotificationResult,
} from "@/lib/contact-notifications";
import { listContacts } from "@/lib/contacts-db";

export const dynamic = "force-dynamic";

const manualEmailRequestSchema = z
  .object({
    contactIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const rawText = await request.text();
    const raw = rawText ? (JSON.parse(rawText) as unknown) : undefined;
    const payload = manualEmailRequestSchema.parse(raw);

    const contacts = await listContacts();
    const selectedContacts = payload?.contactIds?.length
      ? contacts.filter((contact) => payload.contactIds?.includes(contact.id))
      : contacts;

    let notification: NotificationResult;

    try {
      notification = await sendManualContactsEmail(selectedContacts);
    } catch (error) {
      notification = {
        sent: false,
        reason:
          error instanceof Error ? error.message : "Failed to send the manual email.",
      };
    }

    return NextResponse.json({
      contactsCount: selectedContacts.length,
      notification,
    });
  } catch (error) {
    console.error("Manual contacts email error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to trigger the manual email.",
      },
      { status: 500 }
    );
  }
}
