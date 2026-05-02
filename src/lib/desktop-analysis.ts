import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type {
  CalculatedItem,
  ExtractionResult,
  PageClassification,
  ProjectMetadata,
  ProjectMetadataRecord,
  ProjectSettings,
  QuantityLine,
  RichTakeoffAnalysis,
  ReviewArea,
  ReviewOpening,
  ReviewRoom,
  ReviewWall,
  TakeoffCategory,
} from "@/types";

const execFileAsync = promisify(execFile);

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const ANALYSIS_FILE_NAME = "analysis.json";
const DESKTOP_APP_ROOT = path.resolve(process.cwd(), "..", "plan-takeoff-desk");
const DESKTOP_BRIDGE_SCRIPT = path.join(
  process.cwd(),
  "scripts",
  "desktop_bridge.py"
);
const PYTHON_CANDIDATES = [
  path.resolve(process.cwd(), "..", "..", ".venv314", "bin", "python"),
  "python3",
];
const FALLBACK_PAGE_CONFIDENCE = {
  openai_vision: 0.92,
  heuristic_fallback: 0.68,
  default: 0.74,
};

interface ProjectLike {
  id: string;
  metadata: string;
}

interface PageLike {
  id: string;
  pageNumber: number;
  classification: string;
  confidence: number;
}

function sanitizeRelativePublicPath(relativePath: string): string {
  return relativePath.replace(/^\/+/, "");
}

function toPublicFilePath(relativePath: string): string {
  return path.join(PUBLIC_DIR, sanitizeRelativePublicPath(relativePath));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function toImperialAreaUnit(): string {
  return "sqft";
}

function toImperialLengthUnit(): string {
  return "ft";
}

export function parseProjectMetadata(
  rawMetadata: string | null | undefined
): ProjectMetadataRecord {
  if (!rawMetadata) {
    return {};
  }

  try {
    return JSON.parse(rawMetadata) as ProjectMetadataRecord;
  } catch {
    return {};
  }
}

export function serializeProjectMetadata(
  metadata: ProjectMetadataRecord
): string {
  return JSON.stringify(metadata);
}

function getSourceAbsolutePath(
  projectId: string,
  metadata: ProjectMetadataRecord
): string | null {
  const relativePath =
    metadata.sourceRelativePath || `/uploads/${projectId}/source.pdf`;

  if (path.extname(relativePath).toLowerCase() !== ".pdf") {
    return null;
  }

  return toPublicFilePath(relativePath);
}

function getAnalysisRelativePath(
  projectId: string,
  metadata: ProjectMetadataRecord
): string {
  return metadata.analysisRelativePath || `/uploads/${projectId}/${ANALYSIS_FILE_NAME}`;
}

async function resolvePythonCommand(): Promise<string> {
  for (const candidate of PYTHON_CANDIDATES) {
    if (candidate === "python3") {
      return candidate;
    }

    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep checking fallbacks.
    }
  }

  return "python3";
}

async function runDesktopBridge(
  sourceAbsolutePath: string,
  projectSettings: Partial<ProjectSettings>
): Promise<RichTakeoffAnalysis> {
  const pythonCommand = await resolvePythonCommand();
  const { stdout, stderr } = await execFileAsync(
    pythonCommand,
    [
      DESKTOP_BRIDGE_SCRIPT,
      DESKTOP_APP_ROOT,
      sourceAbsolutePath,
      JSON.stringify(projectSettings ?? {}),
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 120 * 1024 * 1024,
    }
  );

  if (stderr.trim()) {
    console.warn("Desktop analysis bridge stderr:", stderr.trim());
  }

  const parsed = JSON.parse(stdout) as { analysis?: RichTakeoffAnalysis };
  if (!parsed.analysis) {
    throw new Error("Desktop analysis bridge did not return an analysis payload.");
  }

  return parsed.analysis;
}

export async function readCachedAnalysis(
  project: ProjectLike
): Promise<RichTakeoffAnalysis | null> {
  const metadata = parseProjectMetadata(project.metadata);
  const analysisPath = getAnalysisRelativePath(project.id, metadata);

  try {
    const file = await fs.readFile(toPublicFilePath(analysisPath), "utf8");
    return JSON.parse(file) as RichTakeoffAnalysis;
  } catch {
    return null;
  }
}

export async function buildAnalysisCache(
  project: ProjectLike,
  projectSettings: Partial<ProjectSettings> = {}
): Promise<{ analysis: RichTakeoffAnalysis; metadata: ProjectMetadataRecord }> {
  const currentMetadata = parseProjectMetadata(project.metadata);
  const sourceAbsolutePath = getSourceAbsolutePath(project.id, currentMetadata);

  if (!sourceAbsolutePath) {
    throw new Error(
      "Desktop-style plan analysis currently needs the original uploaded PDF."
    );
  }

  const analysis = await runDesktopBridge(sourceAbsolutePath, projectSettings);
  const nextMetadata = await saveAnalysisCache(project.id, currentMetadata, analysis);

  return { analysis, metadata: nextMetadata };
}

export async function getOrBuildAnalysis(
  project: ProjectLike,
  projectSettings: Partial<ProjectSettings> = {}
): Promise<{ analysis: RichTakeoffAnalysis; metadata: ProjectMetadataRecord }> {
  const cached = await readCachedAnalysis(project);
  if (cached) {
    return {
      analysis: cached,
      metadata: parseProjectMetadata(project.metadata),
    };
  }

  return buildAnalysisCache(project, projectSettings);
}

export async function saveAnalysisCache(
  projectId: string,
  metadata: ProjectMetadataRecord,
  analysis: RichTakeoffAnalysis
): Promise<ProjectMetadataRecord> {
  const projectDir = path.join(UPLOAD_DIR, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  const analysisRelativePath = `/uploads/${projectId}/${ANALYSIS_FILE_NAME}`;
  await fs.writeFile(
    path.join(projectDir, ANALYSIS_FILE_NAME),
    JSON.stringify(analysis),
    "utf8"
  );

  return {
    ...metadata,
    analysisRelativePath,
    summary: buildProjectSummaryFromAnalysis(analysis, metadata.summary),
  };
}

export function buildProjectSummaryFromAnalysis(
  analysis: RichTakeoffAnalysis,
  existing?: ProjectMetadataRecord["summary"]
): ProjectMetadataRecord["summary"] {
  const inferredProjectName =
    analysis.document?.filename?.replace(/\.[^.]+$/, "") ||
    existing?.project_name ||
    "";
  const inferredScale =
    analysis.page_summaries?.find((page) => page.scale_text)?.scale_text ||
    existing?.scale ||
    "";

  return {
    project_name: inferredProjectName,
    address: existing?.address || "",
    units: analysis.project_settings?.units || existing?.units || "imperial",
    scale: inferredScale,
    floors:
      analysis.project_settings?.storeys || existing?.floors || 1,
  };
}

export function mapDesktopPageType(pageType: string): PageClassification {
  switch (pageType) {
    case "site_plan":
      return "site_plan";
    case "foundation_plan":
    case "floor_plan_main":
    case "floor_plan_upper":
    case "floor_plan_basement":
    case "structural_plan":
      return "floor_plan";
    case "roof_plan":
      return "roof_plan";
    case "elevations":
      return "elevation";
    case "sections":
      return "section";
    case "door_window_schedule":
    case "room_schedule":
      return "schedule";
    case "details":
      return "details";
    default:
      return "unknown";
  }
}

export function getPageConfidence(
  analysis: RichTakeoffAnalysis,
  pageType: string
): number {
  const base =
    FALLBACK_PAGE_CONFIDENCE[
      (analysis.analysis_source as keyof typeof FALLBACK_PAGE_CONFIDENCE) ||
        "default"
    ] ?? FALLBACK_PAGE_CONFIDENCE.default;

  if (pageType === "other" || pageType === "cover" || pageType === "general_notes") {
    return Math.max(0.45, base - 0.18);
  }

  return base;
}

function groupByPageNumber<T extends { page_number?: number }>(
  rows: T[] | undefined
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows || []) {
    const pageNumber = Number(row.page_number || 0);
    if (!pageNumber) {
      continue;
    }
    const bucket = grouped.get(pageNumber) || [];
    bucket.push(row);
    grouped.set(pageNumber, bucket);
  }
  return grouped;
}

function toProjectMetadata(
  analysis: RichTakeoffAnalysis
): ProjectMetadata | undefined {
  const summary = buildProjectSummaryFromAnalysis(analysis);
  if (!summary) {
    return undefined;
  }

  if (!summary.project_name && !summary.scale && !summary.address) {
    return undefined;
  }

  return {
    project_name: summary.project_name || "",
    address: summary.address || "",
    units: summary.units || "imperial",
    scale: summary.scale || "",
    floors: summary.floors || 1,
  };
}

function buildFloorPlanExtraction(
  pageNumber: number,
  pageTitle: string,
  rooms: ReviewRoom[],
  walls: ReviewWall[]
): ExtractionResult["floor_plan"] | undefined {
  if (rooms.length === 0 && walls.length === 0) {
    return undefined;
  }

  const areaFromRooms = rooms.reduce((sum, room) => sum + room.area_sf, 0);

  return {
    floor_name: pageTitle || `Floor ${pageNumber}`,
    rooms: rooms.map((room) => ({
      name: room.room_name,
      area: room.area_sf,
      unit: toImperialAreaUnit(),
    })),
    wall_segments: walls.map((wall) => ({
      type: wall.kind === "exterior" ? "exterior" : "interior",
      length: wall.length_ft,
      unit: toImperialLengthUnit(),
    })),
    total_floor_area: Number(areaFromRooms.toFixed(2)),
    unit: toImperialAreaUnit(),
  };
}

function buildOpeningsExtraction(
  openings: ReviewOpening[]
): ExtractionResult["openings"] | undefined {
  if (openings.length === 0) {
    return undefined;
  }

  return {
    windows: openings
      .filter((opening) => opening.opening_type === "window")
      .map((opening) => ({
        type: opening.label || opening.schedule_id || "Window",
        size:
          opening.width_ft && opening.height_ft
            ? `${opening.width_ft}x${opening.height_ft}`
            : "Varies",
        count: opening.count,
      })),
    doors: openings
      .filter((opening) => opening.opening_type === "door")
      .map((opening) => ({
        type: opening.label || opening.schedule_id || "Door",
        size:
          opening.width_ft && opening.height_ft
            ? `${opening.width_ft}x${opening.height_ft}`
            : "Varies",
        count: opening.count,
      })),
  };
}

function buildRoofExtraction(
  roofAreas: ReviewArea[]
): ExtractionResult["roof"] | undefined {
  if (roofAreas.length === 0) {
    return undefined;
  }

  const totalRoofArea = roofAreas.reduce((sum, area) => {
    const slopeFactor = area.slope_factor || 1;
    return sum + area.area_sf * slopeFactor;
  }, 0);
  const roof = roofAreas[0];

  return {
    roof_area: Number(totalRoofArea.toFixed(2)),
    unit: toImperialAreaUnit(),
    slope: roof.pitch_text || "6:12",
  };
}

function buildElevationExtraction(
  walls: ReviewWall[]
): ExtractionResult["elevation"] | undefined {
  if (walls.length === 0) {
    return undefined;
  }

  const averageHeight =
    walls.reduce((sum, wall) => sum + wall.height_ft, 0) / walls.length;
  const maxHeight = Math.max(...walls.map((wall) => wall.height_ft));

  return {
    wall_height: Number(averageHeight.toFixed(2)),
    floor_to_floor_height: Number(maxHeight.toFixed(2)),
    unit: toImperialLengthUnit(),
  };
}

function buildInferredValues(
  analysis: RichTakeoffAnalysis,
  pageNumber: number
): string[] | undefined {
  const pageSummary = analysis.page_summaries?.find(
    (page) => page.page_number === pageNumber
  );
  const flags = uniqueStrings([
    ...(analysis.review_flags || []),
    ...(analysis.diagnostics || []),
    pageSummary?.snippet,
  ]);

  return flags.length > 0 ? flags.slice(0, 4) : undefined;
}

function buildExtractionForPage(
  analysis: RichTakeoffAnalysis,
  page: PageLike
): ExtractionResult {
  const pageSummary = analysis.page_summaries?.find(
    (summary) => summary.page_number === page.pageNumber
  );
  const requestedPageType = page.classification as PageClassification;
  const classifiedPageType =
    requestedPageType && requestedPageType !== "unknown"
      ? requestedPageType
      : mapDesktopPageType(pageSummary?.page_type || "other");

  const wallsByPage = groupByPageNumber(
    analysis.review_data?.walls || analysis.walls
  );
  const roomsByPage = groupByPageNumber(
    analysis.review_data?.rooms || analysis.rooms
  );
  const openingsByPage = groupByPageNumber(
    analysis.review_data?.openings || analysis.openings
  );
  const roofAreasByPage = groupByPageNumber(
    analysis.review_data?.roof_areas || analysis.roof_areas
  );

  const pageWalls = wallsByPage.get(page.pageNumber) || [];
  const pageRooms = roomsByPage.get(page.pageNumber) || [];
  const pageOpenings = openingsByPage.get(page.pageNumber) || [];
  const pageRoofAreas = roofAreasByPage.get(page.pageNumber) || [];

  const extraction: ExtractionResult = {
    page_type: classifiedPageType,
    confidence: page.confidence || getPageConfidence(analysis, pageSummary?.page_type || "other"),
  };

  if (page.pageNumber === 1) {
    const metadata = toProjectMetadata(analysis);
    if (metadata) {
      extraction.metadata = metadata;
    }
  }

  if (classifiedPageType === "floor_plan") {
    extraction.floor_plan = buildFloorPlanExtraction(
      page.pageNumber,
      pageSummary?.title || `Page ${page.pageNumber}`,
      pageRooms,
      pageWalls
    );
  }

  if (classifiedPageType === "schedule") {
    extraction.openings = buildOpeningsExtraction(pageOpenings);
  }

  if (classifiedPageType === "roof_plan") {
    extraction.roof = buildRoofExtraction(pageRoofAreas);
  }

  if (classifiedPageType === "elevation" || classifiedPageType === "section") {
    extraction.elevation = buildElevationExtraction(pageWalls);
  }

  extraction.inferred_values = buildInferredValues(analysis, page.pageNumber);

  return extraction;
}

export function deriveExtractionsFromAnalysis(
  analysis: RichTakeoffAnalysis,
  pages: PageLike[]
): Array<{
  pageId: string;
  pageNumber: number;
  extraction: ExtractionResult;
}> {
  return pages.map((page) => ({
    pageId: page.id,
    pageNumber: page.pageNumber,
    extraction: buildExtractionForPage(analysis, page),
  }));
}

function mapTradeToCategory(trade: string): TakeoffCategory {
  switch (trade.toLowerCase()) {
    case "concrete":
      return "concrete";
    case "framing":
      return "framing";
    case "sheathing":
      return "sheathing";
    case "insulation":
      return "insulation";
    case "drywall":
      return "drywall";
    case "roofing":
      return "roofing";
    default:
      return "openings";
  }
}

function lineNotes(line: QuantityLine): string {
  return uniqueStrings([
    line.assembly_code ? `Assembly ${line.assembly_code}` : "",
    line.formula_used,
    line.source_refs,
    line.notes,
  ]).join(" | ");
}

export function quantityLinesToCalculatedItems(
  lines: QuantityLine[] | undefined
): CalculatedItem[] {
  return (lines || []).map((line) => ({
    category: mapTradeToCategory(line.trade),
    description: line.item,
    quantity: line.raw_qty,
    unit: line.unit,
    wasteFactor: line.waste_pct / 100,
    totalWithWaste: line.final_qty,
    notes: lineNotes(line),
  }));
}

export function hasMeaningfulOverrides(
  overrides: Record<string, number | string>
): boolean {
  return Object.values(overrides).some((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    return value.trim().length > 0;
  });
}
