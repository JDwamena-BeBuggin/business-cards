import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DB_COLS, exportRequestSchema } from "@/lib/card-flow";

const COLUMN_WIDTHS: Record<(typeof DB_COLS)[number], number> = {
  id: 22,
  first_name: 14,
  last_name: 14,
  title: 20,
  company: 22,
  email: 28,
  phone: 18,
  cell_phone: 18,
  office_phone: 18,
  fax_phone: 18,
  other_phone: 18,
  website: 24,
  linkedin: 26,
  address: 28,
  contact_type: 18,
  tags: 32,
  source: 16,
  date_met: 14,
  event: 18,
  notes: 36,
  follow_up_status: 18,
  added_at: 24,
};

function filenameDate() {
  return new Date().toISOString().split("T")[0];
}

export async function POST(request: Request) {
  try {
    const payload = exportRequestSchema.parse(await request.json());

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Card Flow";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Contacts", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    worksheet.columns = DB_COLS.map((columnKey) => ({
      header: columnKey,
      key: columnKey,
      width: COLUMN_WIDTHS[columnKey],
    }));

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFF8FAFC" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };

    payload.contacts.forEach((contact) => {
      const row: Record<string, string> = {};
      DB_COLS.forEach((column) => {
        const value = contact[column];
        row[column] =
          Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
      });
      worksheet.addRow(row);
    });

    worksheet.columns.forEach((column) => {
      column.alignment = { vertical: "top", wrapText: true };
    });

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(workbookBuffer)
      ? workbookBuffer
      : Buffer.from(workbookBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="card-flow-contacts-${filenameDate()}.xlsx"`,
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
