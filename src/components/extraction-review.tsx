"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ExtractionResult,
  PageHighlight,
  RichTakeoffAnalysis,
  ReviewArea,
  ReviewWall,
} from "@/types";

interface ExtractionReviewProps {
  extractions: Array<{
    pageId: string;
    pageNumber: number;
    extraction: ExtractionResult;
  }>;
  analysis?: RichTakeoffAnalysis | null;
  overrides: Record<string, number | string>;
  onOverridesChange: (overrides: Record<string, number | string>) => void;
}

function setOverrideValue(
  overrides: Record<string, number | string>,
  onOverridesChange: (overrides: Record<string, number | string>) => void,
  key: string,
  value: string
) {
  const numericValue = Number.parseFloat(value);
  onOverridesChange({
    ...overrides,
    [key]: Number.isNaN(numericValue) ? value : numericValue,
  });
}

function sumWallLength(walls: ReviewWall[], kind: "exterior" | "interior") {
  return walls
    .filter((wall) => wall.kind === kind)
    .reduce((sum, wall) => sum + wall.length_ft, 0);
}

function averageWallHeight(walls: ReviewWall[]) {
  if (walls.length === 0) {
    return 9;
  }

  return walls.reduce((sum, wall) => sum + wall.height_ft, 0) / walls.length;
}

function totalRoofArea(roofAreas: ReviewArea[]) {
  return roofAreas.reduce((sum, area) => {
    const slopeFactor = area.slope_factor || 1;
    return sum + area.area_sf * slopeFactor;
  }, 0);
}

function currentHighlightColor(kind: string): string {
  switch (kind) {
    case "wall":
      return "rgba(29, 115, 178, 0.2)";
    case "room":
      return "rgba(45, 143, 111, 0.2)";
    case "opening":
      return "rgba(200, 100, 74, 0.22)";
    default:
      return "rgba(243, 181, 98, 0.24)";
  }
}

function currentHighlightBorder(kind: string): string {
  switch (kind) {
    case "wall":
      return "rgba(29, 115, 178, 0.55)";
    case "room":
      return "rgba(45, 143, 111, 0.62)";
    case "opening":
      return "rgba(200, 100, 74, 0.65)";
    default:
      return "rgba(243, 181, 98, 0.7)";
  }
}

function HighlightOverlay({ highlight }: { highlight: PageHighlight }) {
  if (
    !highlight.bbox ||
    highlight.bbox.width <= 0 ||
    highlight.bbox.height <= 0
  ) {
    return null;
  }

  return (
    <div
      className="absolute overflow-hidden rounded-md"
      style={{
        left: `${highlight.bbox.x / 10}%`,
        top: `${highlight.bbox.y / 10}%`,
        width: `${highlight.bbox.width / 10}%`,
        height: `${highlight.bbox.height / 10}%`,
        backgroundColor: currentHighlightColor(highlight.kind),
        border: `1px solid ${currentHighlightBorder(highlight.kind)}`,
      }}
    >
      <div className="truncate bg-black/55 px-1.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">
        {highlight.label}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#173f5f]">{value}</div>
    </div>
  );
}

function MessagePanel({
  title,
  kicker,
  items,
}: {
  title: string;
  kicker: string;
  items: string[];
}) {
  return (
    <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
      <CardHeader>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {kicker}
        </div>
        <CardTitle className="text-[#173f5f]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No notes yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataTable({
  title,
  kicker,
  headers,
  children,
}: {
  title: string;
  kicker: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
      <CardHeader>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {kicker}
        </div>
        <CardTitle className="text-[#173f5f]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DesktopReview({
  analysis,
  overrides,
  onOverridesChange,
}: {
  analysis: RichTakeoffAnalysis;
  overrides: Record<string, number | string>;
  onOverridesChange: (overrides: Record<string, number | string>) => void;
}) {
  const [activePageNumber, setActivePageNumber] = useState<number>(
    analysis.page_summaries?.[0]?.page_number || 1
  );

  const pageSummaries = analysis.page_summaries || [];
  const selectedPageNumber = pageSummaries.some(
    (page) => page.page_number === activePageNumber
  )
    ? activePageNumber
    : pageSummaries[0]?.page_number || 1;
  const activePage =
    pageSummaries.find((page) => page.page_number === selectedPageNumber) ||
    pageSummaries[0];

  const walls = analysis.review_data?.walls || analysis.walls || [];
  const rooms = analysis.review_data?.rooms || analysis.rooms || [];
  const openings = analysis.review_data?.openings || analysis.openings || [];
  const floorAreas =
    analysis.review_data?.floor_areas || analysis.floor_areas || [];
  const roofAreas = analysis.review_data?.roof_areas || analysis.roof_areas || [];
  const quantityLines = analysis.quantity_lines || [];
  const tradeSummary = analysis.trade_summary || [];
  const diagnostics = analysis.diagnostics || [];
  const assumptions = analysis.assumptions || [];
  const reviewFlags = analysis.review_flags || [];

  const totalFloorArea =
    overrides.totalFloorArea ??
    analysis.metrics?.floor_area_total_sf ??
    floorAreas.reduce((sum, area) => sum + area.area_sf, 0);
  const exteriorWallLength =
    overrides.exteriorWallLength ?? sumWallLength(walls, "exterior");
  const interiorWallLength =
    overrides.interiorWallLength ?? sumWallLength(walls, "interior");
  const wallHeight = overrides.wallHeight ?? averageWallHeight(walls);
  const roofArea = overrides.roofArea ?? totalRoofArea(roofAreas);
  const roofSlope =
    (overrides.roofSlope as string) ||
    roofAreas.find((area) => area.pitch_text)?.pitch_text ||
    "6:12";

  const pageWalls = walls.filter(
    (wall) => wall.page_number === activePage?.page_number
  );
  const pageRooms = rooms.filter(
    (room) => room.page_number === activePage?.page_number
  );
  const pageOpenings = openings.filter(
    (opening) => opening.page_number === activePage?.page_number
  );
  const pageAreas = [...floorAreas, ...roofAreas].filter(
    (area) => area.page_number === activePage?.page_number
  );

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Live Takeoff
            </div>
            <h3 className="mt-2 text-3xl font-semibold text-[#173f5f]">
              Review the measured walls, rooms, openings, and quantities before export.
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              This view uses the richer desktop analysis model: per-page highlights,
              measured room and wall rows, and preset-driven quantity output from the
              same drawing analysis pass.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Takeoff lines"
              value={analysis.totals?.item_count || quantityLines.length}
            />
            <MetricCard
              label="Pages"
              value={analysis.document?.page_count || pageSummaries.length}
            />
            <MetricCard
              label="Total area"
              value={`${Number(totalFloorArea).toFixed(0)} SF`}
            />
            <MetricCard
              label="Mode"
              value={analysis.analysis_source || "review"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
        <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
          <CardHeader>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Plan Viewer
            </div>
            <CardTitle className="text-[#173f5f]">
              Measured Areas on the Drawing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {pageSummaries.map((page) => (
                <button
                  key={page.page_number}
                  type="button"
                  onClick={() => setActivePageNumber(page.page_number)}
                  className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${
                    selectedPageNumber === page.page_number
                      ? "bg-[#173f5f] text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {page.sheet_code || `Page ${page.page_number}`}
                </button>
              ))}
            </div>

            {activePage ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-700">
                    {activePage.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                    <span>{activePage.discipline}</span>
                    <span>{activePage.page_type.replace(/_/g, " ")}</span>
                    <span>{activePage.source_mode}</span>
                    {activePage.scale_text && <span>{activePage.scale_text}</span>}
                  </div>
                </div>

                <div className="relative aspect-[8.5/11] overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#e8eef3,white)]">
                  {activePage.image_data_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activePage.image_data_url}
                        alt={activePage.title}
                        className="h-full w-full object-contain"
                      />
                      <div className="absolute inset-0">
                        {(activePage.highlights || []).map((highlight) => (
                          <HighlightOverlay
                            key={highlight.highlight_id}
                            highlight={highlight}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No page preview available for this sheet.
                    </div>
                  )}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Current sheet highlights
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {activePage.highlights?.length || 0} highlighted elements
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Page summary
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {activePage.snippet}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                No page previews were returned for this analysis.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardHeader>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Measured Summary
              </div>
              <CardTitle className="text-[#173f5f]">
                Key Values and Overrides
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Total Floor Area (sqft)</Label>
                <Input
                  type="number"
                  value={totalFloorArea}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "totalFloorArea",
                      event.target.value
                    )
                  }
                />
              </div>
              <div>
                <Label>Wall Height (ft)</Label>
                <Input
                  type="number"
                  value={wallHeight}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "wallHeight",
                      event.target.value
                    )
                  }
                />
              </div>
              <div>
                <Label>Exterior Wall Length (ft)</Label>
                <Input
                  type="number"
                  value={exteriorWallLength}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "exteriorWallLength",
                      event.target.value
                    )
                  }
                />
              </div>
              <div>
                <Label>Interior Wall Length (ft)</Label>
                <Input
                  type="number"
                  value={interiorWallLength}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "interiorWallLength",
                      event.target.value
                    )
                  }
                />
              </div>
              <div>
                <Label>Roof Area (sqft)</Label>
                <Input
                  type="number"
                  value={roofArea}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "roofArea",
                      event.target.value
                    )
                  }
                />
              </div>
              <div>
                <Label>Roof Slope</Label>
                <Input
                  value={roofSlope}
                  className="mt-1 rounded-2xl border-slate-200"
                  onChange={(event) =>
                    setOverrideValue(
                      overrides,
                      onOverridesChange,
                      "roofSlope",
                      event.target.value
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardHeader>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Quantity Preview
              </div>
              <CardTitle className="text-[#173f5f]">
                Trade Rollup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tradeSummary.length > 0 ? (
                tradeSummary.map((trade) => (
                  <div
                    key={trade.trade}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          {trade.trade}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-700">
                          {trade.line_count} quantity lines
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-[#173f5f]">
                        {trade.display_total}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No quantity preview was returned.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Wall Measurements"
          kicker="Measured Summary"
          headers={["Wall", "Kind", "Level", "Length", "Height", "Area"]}
        >
          {pageWalls.length > 0 ? (
            pageWalls.map((wall) => (
              <TableRow key={wall.wall_id}>
                <TableCell className="font-medium text-slate-700">
                  {wall.name}
                </TableCell>
                <TableCell className="capitalize">{wall.kind}</TableCell>
                <TableCell>{wall.level || "—"}</TableCell>
                <TableCell className="text-right">{wall.length_ft}</TableCell>
                <TableCell className="text-right">{wall.height_ft}</TableCell>
                <TableCell className="text-right">{wall.wall_area_sf}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                No wall measurements on this page.
              </TableCell>
            </TableRow>
          )}
        </DataTable>

        <DataTable
          title="Room Measurements"
          kicker="Measured Summary"
          headers={["Room", "Level", "Width", "Length", "Area"]}
        >
          {pageRooms.length > 0 ? (
            pageRooms.map((room) => (
              <TableRow key={`${room.page_number}-${room.room_name}`}>
                <TableCell className="font-medium text-slate-700">
                  {room.room_name}
                </TableCell>
                <TableCell>{room.level || "—"}</TableCell>
                <TableCell className="text-right">{room.width_ft}</TableCell>
                <TableCell className="text-right">{room.length_ft}</TableCell>
                <TableCell className="text-right">{room.area_sf}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                No room measurements on this page.
              </TableCell>
            </TableRow>
          )}
        </DataTable>

        <DataTable
          title="Opening Schedule"
          kicker="Measured Summary"
          headers={["Opening", "Type", "Location", "Size", "Count"]}
        >
          {pageOpenings.length > 0 ? (
            pageOpenings.map((opening) => (
              <TableRow
                key={`${opening.page_number}-${opening.schedule_id}-${opening.label}`}
              >
                <TableCell className="font-medium text-slate-700">
                  {opening.label}
                </TableCell>
                <TableCell className="capitalize">
                  {opening.opening_type}
                </TableCell>
                <TableCell>{opening.level || "—"}</TableCell>
                <TableCell className="text-right">
                  {opening.width_ft} x {opening.height_ft}
                </TableCell>
                <TableCell className="text-right">{opening.count}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                No opening rows on this page.
              </TableCell>
            </TableRow>
          )}
        </DataTable>

        <DataTable
          title="Quantity Lines"
          kicker="Comprehensive Material Takeoff"
          headers={["Trade", "Item", "Level", "Raw Qty", "Waste %", "Final Qty"]}
        >
          {quantityLines.length > 0 ? (
            quantityLines.slice(0, 14).map((line) => (
              <TableRow key={line.line_id}>
                <TableCell>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {line.trade}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {line.item}
                </TableCell>
                <TableCell>{line.level || "—"}</TableCell>
                <TableCell className="text-right">
                  {line.raw_qty} {line.unit}
                </TableCell>
                <TableCell className="text-right">{line.waste_pct}%</TableCell>
                <TableCell className="text-right font-medium text-[#173f5f]">
                  {line.final_qty} {line.unit}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                No quantity lines available.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </div>

      {pageAreas.length > 0 && (
        <DataTable
          title="Area Rows"
          kicker="Measured Summary"
          headers={["Label", "Level", "Area", "Pitch", "Confidence"]}
        >
          {pageAreas.map((area) => (
            <TableRow key={`${area.page_number}-${area.label}`}>
              <TableCell className="font-medium text-slate-700">
                {area.label}
              </TableCell>
              <TableCell>{area.level || "—"}</TableCell>
              <TableCell className="text-right">{area.area_sf}</TableCell>
              <TableCell>{area.pitch_text || "—"}</TableCell>
              <TableCell className="text-right">
                {area.confidence ? Math.round(area.confidence * 100) : "—"}%
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <MessagePanel
          title="AI and Formula Assumptions"
          kicker="Assumptions"
          items={assumptions}
        />
        <MessagePanel
          title="Extraction Notes"
          kicker="Diagnostics"
          items={diagnostics}
        />
        <MessagePanel
          title="Review Flags"
          kicker="Checks"
          items={reviewFlags}
        />
      </div>
    </div>
  );
}

function FallbackReview({
  extractions,
  overrides,
  onOverridesChange,
}: {
  extractions: Array<{
    pageId: string;
    pageNumber: number;
    extraction: ExtractionResult;
  }>;
  overrides: Record<string, number | string>;
  onOverridesChange: (overrides: Record<string, number | string>) => void;
}) {
  const floorPlans = extractions
    .filter((item) => item.extraction.floor_plan)
    .map((item) => item.extraction.floor_plan!);
  const openings = extractions
    .filter((item) => item.extraction.openings)
    .map((item) => item.extraction.openings!);
  const roofData = extractions.find((item) => item.extraction.roof)?.extraction.roof;
  const elevationData = extractions.find((item) => item.extraction.elevation)
    ?.extraction.elevation;
  const metadata = extractions.find((item) => item.extraction.metadata)?.extraction
    .metadata;
  const warnings = extractions.flatMap(
    (item) => item.extraction.inferred_values || []
  );

  const totalFloorArea = floorPlans.reduce(
    (sum, plan) => sum + (plan.total_floor_area || 0),
    0
  );
  const exteriorWallLength = floorPlans.reduce(
    (sum, plan) =>
      sum +
      plan.wall_segments
        .filter((segment) => segment.type === "exterior")
        .reduce((segmentTotal, segment) => segmentTotal + segment.length, 0),
    0
  );
  const interiorWallLength = floorPlans.reduce(
    (sum, plan) =>
      sum +
      plan.wall_segments
        .filter((segment) => segment.type === "interior")
        .reduce((segmentTotal, segment) => segmentTotal + segment.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
        <CardHeader>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            Fallback Review
          </div>
          <CardTitle className="text-[#173f5f]">
            Override the extracted values before calculating quantities.
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Total Floor Area (sqft)</Label>
            <Input
              type="number"
              value={overrides.totalFloorArea ?? totalFloorArea}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "totalFloorArea",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Wall Height (ft)</Label>
            <Input
              type="number"
              value={overrides.wallHeight ?? elevationData?.wall_height ?? 9}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "wallHeight",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Exterior Wall Length (ft)</Label>
            <Input
              type="number"
              value={overrides.exteriorWallLength ?? exteriorWallLength}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "exteriorWallLength",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Interior Wall Length (ft)</Label>
            <Input
              type="number"
              value={overrides.interiorWallLength ?? interiorWallLength}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "interiorWallLength",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Roof Area (sqft)</Label>
            <Input
              type="number"
              value={overrides.roofArea ?? roofData?.roof_area ?? 0}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "roofArea",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Roof Slope</Label>
            <Input
              value={(overrides.roofSlope as string) ?? roofData?.slope ?? "6:12"}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "roofSlope",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Units</Label>
            <Input
              value={(overrides.units as string) ?? metadata?.units ?? "imperial"}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "units",
                  event.target.value
                )
              }
            />
          </div>
          <div>
            <Label>Scale</Label>
            <Input
              value={(overrides.scale as string) ?? metadata?.scale ?? ""}
              className="mt-1 rounded-2xl border-slate-200"
              onChange={(event) =>
                setOverrideValue(
                  overrides,
                  onOverridesChange,
                  "scale",
                  event.target.value
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Rooms"
          kicker="Measured Summary"
          headers={["Floor", "Room", "Area", "Unit"]}
        >
          {floorPlans.length > 0 ? (
            floorPlans.flatMap((plan) =>
              plan.rooms.map((room) => (
                <TableRow key={`${plan.floor_name}-${room.name}`}>
                  <TableCell>{plan.floor_name}</TableCell>
                  <TableCell className="font-medium text-slate-700">
                    {room.name}
                  </TableCell>
                  <TableCell className="text-right">{room.area}</TableCell>
                  <TableCell>{room.unit}</TableCell>
                </TableRow>
              ))
            )
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                No room data extracted.
              </TableCell>
            </TableRow>
          )}
        </DataTable>

        <DataTable
          title="Opening Schedules"
          kicker="Measured Summary"
          headers={["Type", "Size", "Count"]}
        >
          {openings.length > 0 ? (
            openings.flatMap((schedule) => [
              ...schedule.windows.map((window) => (
                <TableRow key={`window-${window.type}-${window.size}`}>
                  <TableCell className="font-medium text-slate-700">
                    {window.type}
                  </TableCell>
                  <TableCell>{window.size}</TableCell>
                  <TableCell className="text-right">{window.count}</TableCell>
                </TableRow>
              )),
              ...schedule.doors.map((door) => (
                <TableRow key={`door-${door.type}-${door.size}`}>
                  <TableCell className="font-medium text-slate-700">
                    {door.type}
                  </TableCell>
                  <TableCell>{door.size}</TableCell>
                  <TableCell className="text-right">{door.count}</TableCell>
                </TableRow>
              )),
            ])
          ) : (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                No opening data extracted.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </div>

      <MessagePanel
        title="Warnings"
        kicker="Fallback Review"
        items={warnings}
      />
    </div>
  );
}

export function ExtractionReview({
  extractions,
  analysis,
  overrides,
  onOverridesChange,
}: ExtractionReviewProps) {
  if (analysis) {
    return (
      <DesktopReview
        analysis={analysis}
        overrides={overrides}
        onOverridesChange={onOverridesChange}
      />
    );
  }

  return (
    <FallbackReview
      extractions={extractions}
      overrides={overrides}
      onOverridesChange={onOverridesChange}
    />
  );
}
