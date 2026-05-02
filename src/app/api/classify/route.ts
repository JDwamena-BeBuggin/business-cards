import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyPage } from "@/lib/classifier";
import {
  getOrBuildAnalysis,
  getPageConfidence,
  mapDesktopPageType,
  serializeProjectMetadata,
} from "@/lib/desktop-analysis";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { getAbsolutePath } from "@/lib/pdf-splitter";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        pages: {
          orderBy: { pageNumber: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.pages.length === 0) {
      return NextResponse.json({ error: "No pages found" }, { status: 404 });
    }

    try {
      const { analysis, metadata } = await getOrBuildAnalysis(
        project,
        {
          units: project.units === "metric" ? "metric" : "imperial",
          storeys: project.floors || 1,
        }
      );
      const pageSummaryLookup = new Map(
        (analysis.page_summaries || []).map((summary) => [
          summary.page_number,
          summary,
        ])
      );
      const results = project.pages.map((page) => {
        const summary = pageSummaryLookup.get(page.pageNumber);
        const classification = mapDesktopPageType(summary?.page_type || "other");
        const confidence = getPageConfidence(
          analysis,
          summary?.page_type || "other"
        );

        return {
          pageId: page.id,
          pageNumber: page.pageNumber,
          classification,
          confidence,
          previewImageSrc: summary?.image_data_url || "",
          imagePath: page.imagePath,
          rawExtraction: page.rawExtraction,
        };
      });

      await prisma.$transaction([
        ...results.map((page) =>
          prisma.page.update({
            where: { id: page.pageId },
            data: {
              classification: page.classification,
              confidence: page.confidence,
            },
          })
        ),
        prisma.project.update({
          where: { id: projectId },
          data: {
            status: "classified",
            metadata: serializeProjectMetadata(metadata),
          },
        }),
      ]);

      return NextResponse.json({
        projectId,
        analysisSource: analysis.analysis_source,
        pages: results.map((page) => ({
          id: page.pageId,
          pageNumber: page.pageNumber,
          classification: page.classification,
          confidence: page.confidence,
          previewImageSrc: page.previewImageSrc,
          imagePath: page.imagePath,
          rawExtraction: page.rawExtraction,
        })),
      });
    } catch (bridgeError) {
      console.warn("Desktop classification bridge unavailable:", bridgeError);
    }

    const results = [];

    for (const page of project.pages) {
      const absPath = getAbsolutePath(page.imagePath, UPLOAD_DIR);
      const classification = await classifyPage(absPath);

      await prisma.page.update({
        where: { id: page.id },
        data: {
          classification: classification.page_type,
          confidence: classification.confidence,
        },
      });

      results.push({
        id: page.id,
        pageNumber: page.pageNumber,
        imagePath: page.imagePath,
        classification: classification.page_type,
        confidence: classification.confidence,
        rawExtraction: page.rawExtraction,
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "classified" },
    });

    return NextResponse.json({ projectId, pages: results });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(
          error,
          "Classification failed. Check the server logs for details."
        ),
      },
      { status: getErrorStatus(error) }
    );
  }
}
