import { PDFDocument } from "pdf-lib";
import fs from "fs/promises";
import path from "path";

export interface SplitPage {
  pageNumber: number;
  imagePath: string;
}

/**
 * Split a PDF into individual page images.
 * For V1, we save each page as a single-page PDF that the OpenAI API can read directly.
 * This avoids needing GraphicsMagick/ImageMagick for image conversion.
 */
export async function splitPdf(
  pdfBuffer: Buffer,
  projectId: string,
  uploadDir: string
): Promise<SplitPage[]> {
  const projectDir = path.join(uploadDir, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  const pages: SplitPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
    singlePageDoc.addPage(copiedPage);

    const pdfBytes = await singlePageDoc.save();
    const fileName = `page-${i + 1}.pdf`;
    const filePath = path.join(projectDir, fileName);
    await fs.writeFile(filePath, pdfBytes);

    pages.push({
      pageNumber: i + 1,
      imagePath: `/uploads/${projectId}/${fileName}`,
    });
  }

  return pages;
}

/**
 * Handle image uploads (JPG/PNG) - just copy them to the project directory.
 */
export async function saveImage(
  imageBuffer: Buffer,
  fileName: string,
  projectId: string,
  uploadDir: string
): Promise<SplitPage> {
  const projectDir = path.join(uploadDir, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  const ext = path.extname(fileName);
  const outputName = `page-1${ext}`;
  const filePath = path.join(projectDir, outputName);
  await fs.writeFile(filePath, imageBuffer);

  return {
    pageNumber: 1,
    imagePath: `/uploads/${projectId}/${outputName}`,
  };
}

/**
 * Get the absolute file path from a relative image path.
 */
export function getAbsolutePath(
  relativePath: string,
  uploadDir: string
): string {
  return path.join(uploadDir, relativePath.replace("/uploads/", ""));
}
