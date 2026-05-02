import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  return Buffer.from(padded, "base64").toString("utf8");
}

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized.toLowerCase().endsWith(".vcf") ? normalized : `${normalized || "contact"}.vcf`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data");
  const filename = sanitizeFilename(searchParams.get("filename") || "contact.vcf");

  if (!data) {
    return NextResponse.json({ error: "Missing vCard payload." }, { status: 400 });
  }

  try {
    const contents = decodeBase64Url(data);

    return new NextResponse(contents, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("vCard route error:", error);
    return NextResponse.json({ error: "Invalid vCard payload." }, { status: 400 });
  }
}
