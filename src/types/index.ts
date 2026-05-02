export type PageClassification =
  | "site_plan"
  | "floor_plan"
  | "roof_plan"
  | "elevation"
  | "section"
  | "schedule"
  | "details"
  | "unknown";

export type ProjectStatus =
  | "uploaded"
  | "classified"
  | "extracted"
  | "validated"
  | "calculated"
  | "exported";

export type TakeoffCategory =
  | "concrete"
  | "framing"
  | "sheathing"
  | "insulation"
  | "drywall"
  | "roofing"
  | "openings";

export interface Room {
  name: string;
  area: number;
  unit: string;
}

export interface WallSegment {
  type: "exterior" | "interior";
  length: number;
  unit: string;
}

export interface WindowEntry {
  type: string;
  size: string;
  count: number;
}

export interface DoorEntry {
  type: string;
  size: string;
  count: number;
}

export interface FloorPlanExtraction {
  floor_name: string;
  rooms: Room[];
  wall_segments: WallSegment[];
  total_floor_area: number;
  unit: string;
}

export interface OpeningScheduleExtraction {
  windows: WindowEntry[];
  doors: DoorEntry[];
}

export interface RoofExtraction {
  roof_area: number;
  unit: string;
  slope: string;
}

export interface ElevationExtraction {
  wall_height: number;
  unit: string;
  floor_to_floor_height: number;
}

export interface ProjectMetadata {
  project_name: string;
  address: string;
  units: "metric" | "imperial";
  scale: string;
  floors: number;
}

export interface ExtractionResult {
  page_type: PageClassification;
  confidence: number;
  metadata?: ProjectMetadata;
  floor_plan?: FloorPlanExtraction;
  openings?: OpeningScheduleExtraction;
  roof?: RoofExtraction;
  elevation?: ElevationExtraction;
  inferred_values?: string[];
}

export interface CalculatedItem {
  category: TakeoffCategory;
  description: string;
  quantity: number;
  unit: string;
  wasteFactor: number;
  totalWithWaste: number;
  notes: string;
}

export interface CalculationInput {
  exteriorWallLength: number;
  interiorWallLength: number;
  wallHeight: number;
  totalFloorArea: number;
  roofArea: number;
  roofSlope: string;
  windows: WindowEntry[];
  doors: DoorEntry[];
  floors: number;
  perimeterLength: number;
}

export interface AssemblyConfig {
  assembly_id: string;
  stud_spacing: number;
  layers: string[];
  waste_factor: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageHighlight {
  highlight_id: string;
  kind: string;
  label: string;
  detail: string;
  bbox: BBox;
}

export interface ReviewWall {
  wall_id: string;
  highlight_id?: string;
  name: string;
  kind: string;
  level: string;
  length_ft: number;
  height_ft: number;
  wall_area_sf: number;
  sheet: string;
  page_title: string;
  page_number: number;
  confidence: number;
  notes: string;
  bbox?: BBox;
}

export interface ReviewRoom {
  highlight_id?: string;
  room_name: string;
  level: string;
  area_sf: number;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft: number;
  sheet: string;
  page_title: string;
  page_number: number;
  confidence: number;
  notes: string;
  bbox?: BBox;
}

export interface ReviewOpening {
  highlight_id?: string;
  opening_type: string;
  schedule_id: string;
  label: string;
  level: string;
  width_ft: number;
  height_ft: number;
  count: number;
  area_sf: number;
  is_exterior: boolean;
  sheet: string;
  page_title: string;
  page_number: number;
  confidence: number;
  notes: string;
  bbox?: BBox;
}

export interface ReviewArea {
  highlight_id?: string;
  label: string;
  level: string;
  area_sf: number;
  slope_factor?: number;
  pitch_text?: string;
  sheet?: string;
  page_title?: string;
  page_number?: number;
  confidence?: number;
  notes?: string;
  bbox?: BBox;
}

export interface ProjectSettings {
  project_type?: string;
  units?: "imperial" | "metric";
  storeys?: number;
  foundation_preset?: string;
  exterior_wall_preset?: string;
  interior_wall_preset?: string;
  roof_preset?: string;
  default_exterior_wall_height_ft?: number;
  default_interior_wall_height_ft?: number;
}

export interface TradeSummaryLine {
  trade: string;
  line_count: number;
  display_total: string;
}

export interface QuantityLine {
  line_id: string;
  trade: string;
  item: string;
  assembly_code: string;
  level: string;
  raw_qty: number;
  waste_pct: number;
  final_qty: number;
  unit: string;
  formula_used: string;
  source_refs: string;
  notes: string;
}

export interface AnalysisMetrics {
  total_building_area_sf?: number;
  floor_area_total_sf?: number;
  roof_area_total_sf?: number;
  room_area_total_sf?: number;
  room_count?: number;
  wall_count?: number;
  wall_length_total_lf?: number;
  wall_area_total_sf?: number;
  wall_height_avg_ft?: number;
  wall_height_max_ft?: number;
  opening_count?: number;
  door_count?: number;
  window_count?: number;
}

export interface AnalysisDocumentInfo {
  filename: string;
  page_count: number;
  document_mode: string;
}

export interface AnalysisTotals {
  item_count?: number;
  area_total_sf?: number;
  categories?: Record<string, number>;
  units?: Record<string, number>;
}

export interface PageSummary {
  page_number: number;
  sheet_code: string;
  title: string;
  discipline: string;
  page_type: string;
  scale_text: string;
  keywords: string[];
  char_count: number;
  source_mode: string;
  snippet: string;
  image_data_url: string;
  highlights: PageHighlight[];
}

export interface AnalysisReviewData {
  walls?: ReviewWall[];
  rooms?: ReviewRoom[];
  openings?: ReviewOpening[];
  floor_areas?: ReviewArea[];
  roof_areas?: ReviewArea[];
  building_totals?: ReviewArea[];
}

export interface RichTakeoffAnalysis {
  document?: AnalysisDocumentInfo;
  analysis_source?: string;
  analysis_model?: string;
  items?: Array<Record<string, unknown>>;
  walls?: ReviewWall[];
  rooms?: ReviewRoom[];
  floor_areas?: ReviewArea[];
  roof_areas?: ReviewArea[];
  building_totals?: ReviewArea[];
  openings?: ReviewOpening[];
  metrics?: AnalysisMetrics;
  totals?: AnalysisTotals;
  page_summaries?: PageSummary[];
  assumptions?: string[];
  diagnostics?: string[];
  review_flags?: string[];
  review_data?: AnalysisReviewData;
  quantity_lines?: QuantityLine[];
  trade_summary?: TradeSummaryLine[];
  project_settings?: ProjectSettings;
  assembly_presets?: Record<string, Record<string, unknown>>;
}

export interface ProjectMetadataRecord {
  sourceRelativePath?: string;
  sourceFileName?: string;
  analysisRelativePath?: string;
  summary?: {
    project_name?: string;
    address?: string;
    units?: "imperial" | "metric";
    scale?: string;
    floors?: number;
  };
}
