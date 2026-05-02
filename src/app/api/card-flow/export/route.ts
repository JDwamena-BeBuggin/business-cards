import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { exportRequestSchema } from "@/lib/card-flow";
import {
  buildContactsWorkbookBuffer,
  contactsExportFilename,
} from "@/lib/contact-export";

export async function POST(request: Request) {
  try {
    const payload = exportRequestSchema.parse(await request.json());
    const buffer = await buildContactsWorkbookBuffer(payload.contacts);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${contactsExportFilename()}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "Invalid export request."
        : error instanceof Error
          ? error.message
          : "Export failed.";

    console.error("Card flow export error:", error);

    return NextResponse.json(
      { error: message },
      { status: error instanceof ZodError ? 400 : 500 }
    );
  }
}
