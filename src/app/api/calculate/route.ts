import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateTakeoff } from "@/lib/calc-engine";
import {
  hasMeaningfulOverrides,
  quantityLinesToCalculatedItems,
  readCachedAnalysis,
} from "@/lib/desktop-analysis";
import type {
  CalculationInput,
  ExtractionResult,
  WindowEntry,
  DoorEntry,
} from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId } = body;

    // Allow user overrides from the validation step
    const overrides = body.overrides || {};

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { pages: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const cachedAnalysis = await readCachedAnalysis(project);
    if (
      cachedAnalysis?.quantity_lines?.length &&
      !hasMeaningfulOverrides(overrides)
    ) {
      const items = quantityLinesToCalculatedItems(cachedAnalysis.quantity_lines);

      await prisma.takeoffItem.deleteMany({ where: { projectId } });
      await prisma.takeoffItem.createMany({
        data: items.map((it) => ({
          projectId,
          category: it.category,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          wasteFactor: it.wasteFactor,
          totalWithWaste: it.totalWithWaste,
          notes: it.notes,
        })),
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { status: "calculated" },
      });

      return NextResponse.json({
        projectId,
        source: cachedAnalysis.analysis_source || "desktop_bridge",
        items,
        itemCount: items.length,
      });
    }

    // Aggregate all extractions
    let totalFloorArea = 0;
    let exteriorWallLength = 0;
    let interiorWallLength = 0;
    let wallHeight = overrides.wallHeight || 9; // default 9ft
    let roofArea = 0;
    let roofSlope = overrides.roofSlope || "6:12";
    const windows: WindowEntry[] = [];
    const doors: DoorEntry[] = [];

    for (const page of project.pages) {
      let extraction: ExtractionResult;
      try {
        extraction = JSON.parse(page.rawExtraction) as ExtractionResult;
      } catch {
        continue;
      }

      if (extraction.floor_plan) {
        totalFloorArea += extraction.floor_plan.total_floor_area || 0;
        for (const seg of extraction.floor_plan.wall_segments || []) {
          if (seg.type === "exterior") exteriorWallLength += seg.length;
          else interiorWallLength += seg.length;
        }
      }

      if (extraction.openings) {
        windows.push(...(extraction.openings.windows || []));
        doors.push(...(extraction.openings.doors || []));
      }

      if (extraction.roof) {
        if (extraction.roof.roof_area) roofArea += extraction.roof.roof_area;
        if (extraction.roof.slope) roofSlope = extraction.roof.slope;
      }

      if (extraction.elevation) {
        if (extraction.elevation.wall_height) {
          wallHeight = extraction.elevation.wall_height;
        }
      }
    }

    // Apply user overrides
    if (overrides.totalFloorArea) totalFloorArea = overrides.totalFloorArea;
    if (overrides.exteriorWallLength) exteriorWallLength = overrides.exteriorWallLength;
    if (overrides.interiorWallLength) interiorWallLength = overrides.interiorWallLength;
    if (overrides.roofArea) roofArea = overrides.roofArea;

    // Estimate perimeter from exterior wall length or floor area
    const perimeterLength =
      overrides.perimeterLength ||
      exteriorWallLength ||
      Math.sqrt(totalFloorArea) * 4;

    // If no roof area extracted, estimate from floor area
    if (roofArea === 0) {
      roofArea = totalFloorArea * 1.1; // 10% overhang
    }

    const calcInput: CalculationInput = {
      exteriorWallLength: exteriorWallLength || perimeterLength,
      interiorWallLength: interiorWallLength || perimeterLength * 0.8,
      wallHeight,
      totalFloorArea: totalFloorArea * (project.floors || 1),
      roofArea,
      roofSlope,
      windows,
      doors,
      floors: project.floors || 1,
      perimeterLength,
    };

    const items = calculateTakeoff(calcInput);

    // Clear old items and insert new
    await prisma.takeoffItem.deleteMany({ where: { projectId } });
    await prisma.takeoffItem.createMany({
      data: items.map((it) => ({
        projectId,
        category: it.category,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        wasteFactor: it.wasteFactor,
        totalWithWaste: it.totalWithWaste,
        notes: it.notes,
      })),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "calculated" },
    });

    return NextResponse.json({
      projectId,
      source: "fallback_calculator",
      input: calcInput,
      items,
      itemCount: items.length,
    });
  } catch (error) {
    console.error("Calculation error:", error);
    return NextResponse.json(
      { error: "Calculation failed" },
      { status: 500 }
    );
  }
}
