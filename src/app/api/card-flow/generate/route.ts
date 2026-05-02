import { NextResponse } from "next/server";
import { zodResponseFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { openai } from "@/lib/openai";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  followUpSchema,
  generateRequestSchema,
} from "@/lib/card-flow";

const GENERATION_MODEL = "gpt-4o-mini";

function buildFollowUpDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().split("T")[0];
}

export async function POST(request: Request) {
  try {
    const payload = generateRequestSchema.parse(await request.json());
    const followUpDate = buildFollowUpDate();

    const response = await openai.chat.completions.parse({
      model: GENERATION_MODEL,
      messages: [
        {
          role: "system",
          content: buildGenerationSystemPrompt(),
        },
        {
          role: "user",
          content: buildGenerationUserPrompt(payload.contact, followUpDate),
        },
      ],
      response_format: zodResponseFormat(
        followUpSchema,
        "business_card_followups"
      ),
      temperature: 0.5,
      max_tokens: 1200,
    });

    const outputs = response.choices[0]?.message?.parsed;
    if (!outputs) {
      throw new Error("The model did not return structured follow-up content.");
    }

    return NextResponse.json(outputs);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "Invalid generation request."
        : error instanceof Error
          ? error.message
          : "Follow-up generation failed.";

    console.error("Card flow generation error:", error);

    return NextResponse.json(
      { error: message },
      { status: error instanceof ZodError ? 400 : 500 }
    );
  }
}
