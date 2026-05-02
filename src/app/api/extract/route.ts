import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  deriveExtractionsFromAnalysis,
  getOrBuildAnalysis,
  parseProjectMetadata,
  serializeProjectMetadata,
} from "@/lib/desktop-analysis";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { extractPageData } from "@/lib/extractor";
import { getAbsolutePath } from "@/lib/pdf-splitter";
import path from "path";
import type { PageClassification, ExtractionResult } from "@/types";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const VALID_PAGE_TYPES: PageClassification[] = [
  "site_plan",
  "floor_plan",
  "roof_plan",
  "elevation",
  "section",
  "schedule",
  "details",
  "unknown",
];

export async function POST(request: Request) {
  try {
    const { projectId, pageIds, pages: pageUpdates } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    if (Array.isArray(pageUpdates) && pageUpdates.length > 0) {
      await prisma.$transaction(
        pageUpdates
          .filter(
            (
              page
            ): page is { id: string; classification: PageClassification } =>
              typeof page?.id === "string" &&
              typeof page?.classification === "string" &&
              VALID_PAGE_TYPES.includes(page.classification as PageClassification)
          )
          .map((page) =>
            prisma.page.update({
              where: { id: page.id },
              data: { classification: page.classification },
            })
          )
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        pages: {
          where: pageIds?.length ? { id: { in: pageIds } } : undefined,
          orderBy: { pageNumber: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    try {
      const { analysis, metadata } = await getOrBuildAnalysis(
        project,
        {
          units: project.units === "metric" ? "metric" : "imperial",
          storeys: project.floors || 1,
        }
      );
      const extractions = deriveExtractionsFromAnalysis(analysis, project.pages);
      const summary = metadata.summary || parseProjectMetadata(project.metadata).summary;

      await prisma.$transaction([
        ...extractions.map((result) =>
          prisma.page.update({
            where: { id: result.pageId },
            data: { rawExtraction: JSON.stringify(result.extraction) },
          })
        ),
        prisma.project.update({
          where: { id: projectId },
          data: {
            name: summary?.project_name || project.name,
            address: summary?.address || project.address,
            units: summary?.units || project.units,
            scale: summary?.scale || project.scale,
            floors: summary?.floors || project.floors,
            status: "extracted",
            metadata: serializeProjectMetadata(metadata),
          },
        }),
      ]);

      return NextResponse.json({ projectId, extractions, analysis });
    } catch (bridgeError) {
      console.warn("Desktop extraction bridge unavailable:", bridgeError);
    }

    const pages = project.pages;
    const results: Array<{
      pageId: string;
      pageNumber: number;
      extraction: ExtractionResult;
    }> = [];

    // Aggregate data for project metadata
    const projectMeta = {
      project_name: "",
      address: "",
      units: "imperial",
      scale: "",
      floors: 1,
    };

    for (const page of pages) {
      const absPath = getAbsolutePath(page.imagePath, UPLOAD_DIR);
      const extraction = await extractPageData(
        absPath,
        page.classification as PageClassification
      );

      await prisma.page.update({
        where: { id: page.id },
        data: { rawExtraction: JSON.stringify(extraction) },
      });

      // Merge metadata from any page that provides it
      if (extraction.metadata) {
        if (extraction.metadata.project_name) projectMeta.project_name = extraction.metadata.project_name;
        if (extraction.metadata.address) projectMeta.address = extraction.metadata.address;
        if (extraction.metadata.units) projectMeta.units = extraction.metadata.units;
        if (extraction.metadata.scale) projectMeta.scale = extraction.metadata.scale;
        if (extraction.metadata.floors) projectMeta.floors = extraction.metadata.floors;
      }

      results.push({
        pageId: page.id,
        pageNumber: page.pageNumber,
        extraction,
      });
    }

    // Update project with extracted metadata
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name: projectMeta.project_name || undefined,
        address: projectMeta.address,
        units: projectMeta.units,
        scale: projectMeta.scale,
        floors: projectMeta.floors,
        status: "extracted",
        metadata: JSON.stringify(projectMeta),
      },
    });

    return NextResponse.json({ projectId, extractions: results });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(
          error,
          "Extraction failed. Check the server logs for details."
        ),
      },
      { status: getErrorStatus(error) }
    );
  }
}
