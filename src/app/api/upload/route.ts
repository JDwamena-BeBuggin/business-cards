import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { splitPdf, saveImage } from "@/lib/pdf-splitter";
import fs from "fs/promises";
import path from "path";
import { serializeProjectMetadata } from "@/lib/desktop-analysis";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectName = (formData.get("name") as string) || "Untitled Project";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();

    // Create project
    const project = await prisma.project.create({
      data: { name: projectName, status: "uploaded" },
    });
    const projectDir = path.join(UPLOAD_DIR, project.id);
    await fs.mkdir(projectDir, { recursive: true });

    const sourceRelativePath = `/uploads/${project.id}/source${ext}`;
    await fs.writeFile(
      path.join(projectDir, `source${ext}`),
      buffer
    );

    await prisma.project.update({
      where: { id: project.id },
      data: {
        metadata: serializeProjectMetadata({
          sourceRelativePath,
          sourceFileName: file.name,
        }),
      },
    });

    let pages: { pageNumber: number; imagePath: string }[];

    if (ext === ".pdf") {
      pages = await splitPdf(buffer, project.id, UPLOAD_DIR);
    } else if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const page = await saveImage(buffer, file.name, project.id, UPLOAD_DIR);
      pages = [page];
    } else {
      await prisma.project.delete({ where: { id: project.id } });
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, JPG, or PNG." },
        { status: 400 }
      );
    }

    // Create page records
    await prisma.page.createMany({
      data: pages.map((p) => ({
        projectId: project.id,
        pageNumber: p.pageNumber,
        imagePath: p.imagePath,
      })),
    });

    const createdPages = await prisma.page.findMany({
      where: { projectId: project.id },
      orderBy: { pageNumber: "asc" },
    });

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
      pageCount: pages.length,
      pages: createdPages,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
