import { NextResponse } from "next/server";
import { zodResponseFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { openai } from "@/lib/openai";
import {
  buildExtractionSystemPrompt,
  contactExtractionBatchSchema,
  extractRequestSchema,
} from "@/lib/card-flow";

const EXTRACTION_MODEL = "gpt-4o";

export async function POST(request: Request) {
  try {
    const payload = extractRequestSchema.parse(await request.json());

    const userContent: Array<Record<string, unknown>> = [];

    if (payload.manualText) {
      userContent.push({
        type: "text",
        text:
          "Business card text. If multiple contacts are present, split them into separate contact entries.\n\n" +
          payload.manualText,
      });
    } else {
      userContent.push({
        type: "text",
        text:
          "Read all provided business card image(s), merge matching front/back shots, split distinct cards into separate contacts, and extract the contact details exactly.",
      });

      payload.images?.forEach((imageUrl, index) => {
        userContent.push({
          type: "text",
          text: `Image ${index + 1}`,
        });
        userContent.push({
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: "high",
          },
        });
      });
    }

    const response = await openai.chat.completions.parse({
      model: EXTRACTION_MODEL,
      messages: [
        {
          role: "system",
          content: buildExtractionSystemPrompt(),
        },
        {
          role: "user",
          // OpenAI's SDK accepts mixed text + image blocks here.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: userContent as any,
        },
      ],
      response_format: zodResponseFormat(
        contactExtractionBatchSchema,
        "business_card_contacts"
      ),
      temperature: 0,
      max_tokens: 2400,
    });

    const extractedBatch = response.choices[0]?.message?.parsed;
    if (!extractedBatch?.contacts?.length) {
      throw new Error("The model did not return any structured contacts.");
    }

    return NextResponse.json(extractedBatch);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "Invalid extraction request."
        : error instanceof Error
          ? error.message
          : "Extraction failed.";

    console.error("Card flow extraction error:", error);

    return NextResponse.json(
      { error: message },
      { status: error instanceof ZodError ? 400 : 500 }
    );
  }
}
