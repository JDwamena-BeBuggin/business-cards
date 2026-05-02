import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readCachedAnalysis } from "@/lib/desktop-analysis";
import { generateExcel } from "@/lib/excel-export";
import type { CalculatedItem, TakeoffCategory } from "@/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const items: CalculatedItem[] = project.items.map((it) => ({
      category: it.category as TakeoffCategory,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      wasteFactor: it.wasteFactor,
      totalWithWaste: it.totalWithWaste,
      notes: it.notes,
    }));

    const assumptions = [
      "Stud spacing: 16\" on center",
      "Exterior studs: 2x6, Interior studs: 2x4",
      "Three plates per wall (double top plate + single bottom plate)",
      "Slab thickness: 4 inches",
      "Footing size: 2' wide x 1' deep continuous",
      "Foundation wall: 4' high x 10\" thick",
      "Default wall height: 9' (unless extracted from drawings)",
      "Default roof slope: 6:12 (unless extracted from drawings)",
      "Concrete waste factor: 5%",
      "Framing waste factor: 8%",
      "Sheathing waste factor: 10%",
      "Drywall waste factor: 10%",
      "Roofing waste factor: 12%",
      "Roof area estimated from floor area + 10% overhang if not extracted",
      "Interior wall length estimated at 80% of perimeter if not extracted",
      "Sheet size: 4' x 8' (32 sqft) for sheathing and drywall",
      "Underlayment roll coverage: 400 sqft",
      "All quantities are estimates pending field verification",
    ];
    const analysis = await readCachedAnalysis(project);
    const workbookAssumptions = Array.from(
      new Set([
        ...(analysis?.assumptions || []),
        ...(analysis?.review_flags || []),
        ...(analysis?.diagnostics || []),
        ...assumptions,
      ].filter(Boolean))
    );

    const buffer = await generateExcel(
      {
        name: project.name,
        address: project.address,
        units: project.units,
        floors: project.floors,
      },
      items,
      workbookAssumptions
    );

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "exported" },
    });

    const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_takeoff.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
