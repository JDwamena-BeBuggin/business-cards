import ExcelJS from "exceljs";
import type { CalculatedItem } from "@/types";

interface ProjectInfo {
  name: string;
  address: string;
  units: string;
  floors: number;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 28;
}

function styleDataRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
  });
}

function addTradeSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  items: CalculatedItem[],
  columns: { header: string; key: string; width: number }[]
) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  columns.forEach((col, i) => {
    headerRow.getCell(i + 1).value = col.header;
  });
  styleHeader(headerRow);

  for (const it of items) {
    const row = sheet.addRow({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      waste: `${(it.wasteFactor * 100).toFixed(0)}%`,
      total: it.totalWithWaste,
      notes: it.notes,
    });
    styleDataRow(row);
  }

  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  if (items.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: items.length + 1, column: columns.length },
    };
  }
}

export async function generateExcel(
  projectInfo: ProjectInfo,
  items: CalculatedItem[],
  assumptions: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AI Takeoff Tool";
  workbook.created = new Date();

  const tradeColumns = [
    { header: "Item", key: "description", width: 40 },
    { header: "Qty", key: "quantity", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Waste %", key: "waste", width: 10 },
    { header: "Total (w/ waste)", key: "total", width: 16 },
    { header: "Notes", key: "notes", width: 30 },
  ];

  // ─── Sheet 1: Summary ────────────────────────────────────────
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Trade", key: "trade", width: 20 },
    { header: "Items", key: "items", width: 10 },
    { header: "Key Quantity", key: "keyQty", width: 20 },
  ];

  // Project info header
  summary.mergeCells("A1:C1");
  const titleCell = summary.getCell("A1");
  titleCell.value = `Takeoff: ${projectInfo.name}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center" };

  summary.getCell("A2").value = "Address:";
  summary.getCell("B2").value = projectInfo.address;
  summary.getCell("A3").value = "Units:";
  summary.getCell("B3").value = projectInfo.units;
  summary.getCell("A4").value = "Floors:";
  summary.getCell("B4").value = projectInfo.floors;
  summary.getCell("A5").value = "Generated:";
  summary.getCell("B5").value = new Date().toLocaleDateString();

  // Trade summary table
  const tradeHeaderRow = summary.getRow(7);
  tradeHeaderRow.getCell(1).value = "Trade";
  tradeHeaderRow.getCell(2).value = "Line Items";
  tradeHeaderRow.getCell(3).value = "Key Quantity";
  styleHeader(tradeHeaderRow);

  const categories = [
    "concrete",
    "framing",
    "sheathing",
    "insulation",
    "drywall",
    "roofing",
    "openings",
  ] as const;
  for (const cat of categories) {
    const catItems = items.filter((i) => i.category === cat);
    const keyItem = catItems[0];
    const row = summary.addRow({
      trade: cat.charAt(0).toUpperCase() + cat.slice(1),
      items: catItems.length,
      keyQty: keyItem ? `${keyItem.totalWithWaste} ${keyItem.unit}` : "-",
    });
    styleDataRow(row);
  }

  // ─── Trade Sheets ────────────────────────────────────────────
  for (const cat of categories) {
    const catItems = items.filter((i) => i.category === cat);
    const sheetName = cat.charAt(0).toUpperCase() + cat.slice(1);
    addTradeSheet(workbook, sheetName, catItems, tradeColumns);
  }

  // ─── Sheet 8: Assumptions ────────────────────────────────────
  const assSheet = workbook.addWorksheet("Assumptions");
  assSheet.columns = [
    { header: "#", key: "num", width: 6 },
    { header: "Assumption", key: "assumption", width: 80 },
  ];
  const assHeaderRow = assSheet.getRow(1);
  assHeaderRow.getCell(1).value = "#";
  assHeaderRow.getCell(2).value = "Assumption";
  styleHeader(assHeaderRow);

  assumptions.forEach((a, i) => {
    const row = assSheet.addRow({ num: i + 1, assumption: a });
    styleDataRow(row);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
