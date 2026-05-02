import type { CalculatedItem, CalculationInput } from "@/types";

// ─── Constants ───────────────────────────────────────────────────
const STUD_SPACING_16OC = 1.33; // studs per linear foot at 16" OC
const SHEET_AREA = 32; // 4x8 sheet = 32 sqft
const PLATE_COUNT = 3; // top double plate + bottom plate
const HEADER_LF_PER_OPENING = 4; // average header length per opening
const JOIST_SPACING_16OC = 0.75; // joists per sqft at 16" OC
const SHINGLE_SQUARES = 100; // 1 square = 100 sqft
const UNDERLAYMENT_ROLL_SF = 400; // per roll coverage
const DRYWALL_SHEET_SF = 32; // 4x8 sheet
const CONCRETE_SLAB_THICKNESS = 4 / 12; // 4 inches in feet
const FOOTING_WIDTH = 2; // feet
const FOOTING_DEPTH = 1; // foot
const FOUNDATION_WALL_HEIGHT = 4; // feet
const FOUNDATION_WALL_THICKNESS = 10 / 12; // 10 inches

// Waste factors by trade
const WASTE = {
  concrete: 0.05,
  framing: 0.08,
  sheathing: 0.1,
  drywall: 0.1,
  roofing: 0.12,
  openings: 0.0,
};

function parseSlope(slope: string): { rise: number; run: number } {
  const match = slope.match(/(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/);
  if (match) return { rise: parseFloat(match[1]), run: parseFloat(match[2]) };
  return { rise: 6, run: 12 }; // default 6:12
}

function slopeFactor(slope: string): number {
  const { rise, run } = parseSlope(slope);
  return Math.sqrt(rise * rise + run * run) / run;
}

function openingArea(size: string, count: number): number {
  const match = size.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const w = parseFloat(match[1]);
  const h = parseFloat(match[2]);
  return w * h * count;
}

function item(
  category: CalculatedItem["category"],
  description: string,
  quantity: number,
  unit: string,
  wasteFactor: number,
  notes: string = ""
): CalculatedItem {
  const raw = Math.max(0, quantity);
  return {
    category,
    description,
    quantity: Math.round(raw * 100) / 100,
    unit,
    wasteFactor,
    totalWithWaste: Math.round(raw * (1 + wasteFactor) * 100) / 100,
    notes,
  };
}

export function calculateTakeoff(input: CalculationInput): CalculatedItem[] {
  const items: CalculatedItem[] = [];

  // ─── Window & Door areas ──────────────────────────────────────
  let totalWindowArea = 0;
  let totalDoorArea = 0;
  let totalWindowCount = 0;
  let totalDoorCount = 0;

  for (const w of input.windows) {
    totalWindowArea += openingArea(w.size, w.count);
    totalWindowCount += w.count;
  }
  for (const d of input.doors) {
    totalDoorArea += openingArea(d.size, d.count);
    totalDoorCount += d.count;
  }

  const totalOpeningsArea = totalWindowArea + totalDoorArea;
  const totalOpeningsCount = totalWindowCount + totalDoorCount;

  // ─── CONCRETE ─────────────────────────────────────────────────
  // Slab on grade
  const slabVolumeCF =
    input.totalFloorArea * CONCRETE_SLAB_THICKNESS;
  const slabVolumeCY = slabVolumeCF / 27;
  items.push(
    item("concrete", "Slab on Grade", input.totalFloorArea, "sqft", WASTE.concrete, `${CONCRETE_SLAB_THICKNESS * 12}" thick`),
    item("concrete", "Slab Concrete Volume", slabVolumeCY, "CY", WASTE.concrete)
  );

  // Footings
  const footingLF = input.perimeterLength;
  const footingVolumeCF = footingLF * FOOTING_WIDTH * FOOTING_DEPTH;
  const footingVolumeCY = footingVolumeCF / 27;
  items.push(
    item("concrete", "Continuous Footings", footingLF, "LF", WASTE.concrete, `${FOOTING_WIDTH}' x ${FOOTING_DEPTH}'`),
    item("concrete", "Footing Concrete Volume", footingVolumeCY, "CY", WASTE.concrete)
  );

  // Foundation walls
  const foundationWallCF =
    input.perimeterLength * FOUNDATION_WALL_HEIGHT * FOUNDATION_WALL_THICKNESS;
  const foundationWallCY = foundationWallCF / 27;
  items.push(
    item("concrete", "Foundation Walls", input.perimeterLength, "LF", WASTE.concrete, `${FOUNDATION_WALL_HEIGHT}' high x ${Math.round(FOUNDATION_WALL_THICKNESS * 12)}"`),
    item("concrete", "Foundation Wall Concrete", foundationWallCY, "CY", WASTE.concrete)
  );

  // ─── FRAMING ──────────────────────────────────────────────────
  const extWallArea =
    input.exteriorWallLength * input.wallHeight;
  const intWallArea =
    input.interiorWallLength * input.wallHeight;
  const netExtWallArea = Math.max(0, extWallArea - totalOpeningsArea);

  // Studs - exterior
  const extStuds = Math.ceil(
    input.exteriorWallLength * STUD_SPACING_16OC + 4 * input.floors
  ); // +4 per floor for corners
  items.push(
    item("framing", "Exterior Wall Studs (2x6)", extStuds, "EA", WASTE.framing, "16\" OC")
  );

  // Studs - interior
  const intStuds = Math.ceil(input.interiorWallLength * STUD_SPACING_16OC);
  items.push(
    item("framing", "Interior Wall Studs (2x4)", intStuds, "EA", WASTE.framing, "16\" OC")
  );

  // Plates
  const extPlateLF = input.exteriorWallLength * PLATE_COUNT;
  const intPlateLF = input.interiorWallLength * PLATE_COUNT;
  items.push(
    item("framing", "Exterior Wall Plates (2x6)", extPlateLF, "LF", WASTE.framing, "3 plates per wall"),
    item("framing", "Interior Wall Plates (2x4)", intPlateLF, "LF", WASTE.framing, "3 plates per wall")
  );

  // Headers
  const headerLF = totalOpeningsCount * HEADER_LF_PER_OPENING;
  items.push(
    item("framing", "Headers", headerLF, "LF", WASTE.framing, `${totalOpeningsCount} openings`)
  );

  // Floor joists
  const joistCount = Math.ceil(input.totalFloorArea * JOIST_SPACING_16OC);
  items.push(
    item("framing", "Floor Joists (2x10)", joistCount, "EA", WASTE.framing, "16\" OC")
  );

  // Rafters / trusses
  const adjustedRoofArea = input.roofArea * slopeFactor(input.roofSlope);
  const rafterCount = Math.ceil(
    Math.sqrt(input.roofArea) * 2 * 0.75
  ); // approximate from roof footprint perimeter
  items.push(
    item("framing", "Roof Rafters/Trusses", rafterCount, "EA", WASTE.framing, `slope ${input.roofSlope}`)
  );

  // ─── SHEATHING ────────────────────────────────────────────────
  const wallSheathingSheets = Math.ceil(netExtWallArea / SHEET_AREA);
  items.push(
    item("sheathing", "Wall Sheathing (4x8 OSB)", wallSheathingSheets, "sheets", WASTE.sheathing)
  );

  const roofSheathingSheets = Math.ceil(adjustedRoofArea / SHEET_AREA);
  items.push(
    item("sheathing", "Roof Sheathing (4x8 OSB)", roofSheathingSheets, "sheets", WASTE.sheathing)
  );

  const subfloorSheets = Math.ceil(input.totalFloorArea / SHEET_AREA);
  items.push(
    item("sheathing", "Subfloor Sheathing (4x8 T&G)", subfloorSheets, "sheets", WASTE.sheathing)
  );

  // ─── DRYWALL ──────────────────────────────────────────────────
  const intWallDrywall = (extWallArea + intWallArea * 2) ; // interior side of ext + both sides of int
  const ceilingDrywall = input.totalFloorArea;
  const totalDrywall = intWallDrywall + ceilingDrywall;
  const drywallSheets = Math.ceil(totalDrywall / DRYWALL_SHEET_SF);

  items.push(
    item("drywall", "Wall Drywall (4x8)", Math.ceil(intWallDrywall / DRYWALL_SHEET_SF), "sheets", WASTE.drywall),
    item("drywall", "Ceiling Drywall (4x8)", Math.ceil(ceilingDrywall / DRYWALL_SHEET_SF), "sheets", WASTE.drywall),
    item("drywall", "Total Drywall Area", totalDrywall, "sqft", WASTE.drywall),
    item("drywall", "Total Drywall Sheets", drywallSheets, "sheets", WASTE.drywall)
  );

  // ─── ROOFING ──────────────────────────────────────────────────
  const roofSquares = adjustedRoofArea / SHINGLE_SQUARES;
  const underlaymentRolls = Math.ceil(adjustedRoofArea / UNDERLAYMENT_ROLL_SF);
  const dripEdgeLF = Math.ceil(Math.sqrt(input.roofArea) * 4); // approximate perimeter
  const ridgeCapLF = Math.ceil(Math.sqrt(input.roofArea)); // approximate ridge length

  items.push(
    item("roofing", "Adjusted Roof Area", adjustedRoofArea, "sqft", 0, `slope factor applied`),
    item("roofing", "Shingles", Math.ceil(roofSquares * 10) / 10, "squares", WASTE.roofing),
    item("roofing", "Underlayment", underlaymentRolls, "rolls", WASTE.roofing),
    item("roofing", "Drip Edge", dripEdgeLF, "LF", WASTE.roofing),
    item("roofing", "Ridge Cap", ridgeCapLF, "LF", WASTE.roofing)
  );

  // ─── OPENINGS ─────────────────────────────────────────────────
  for (const w of input.windows) {
    items.push(
      item("openings", `Window ${w.type} (${w.size})`, w.count, "EA", WASTE.openings)
    );
  }
  for (const d of input.doors) {
    items.push(
      item("openings", `Door ${d.type} (${d.size})`, d.count, "EA", WASTE.openings)
    );
  }

  return items;
}
