import ExcelJS from "exceljs";
import { DB_COLS, type CardFlowContact } from "@/lib/card-flow";

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
  follow_up_email_subject: 28,
  follow_up_email_body: 52,
  follow_up_linkedin_msg: 38,
  follow_up_crm_note: 38,
  follow_up_task: 38,
  follow_up_status: 18,
  added_at: 24,
};

export function contactsExportFilename(date = new Date()) {
  return `card-flow-contacts-${date.toISOString().split("T")[0]}.xlsx`;
}

export async function buildContactsWorkbookBuffer(contacts: CardFlowContact[]) {
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

  contacts.forEach((contact) => {
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
  return Buffer.isBuffer(workbookBuffer)
    ? workbookBuffer
    : Buffer.from(workbookBuffer);
}
