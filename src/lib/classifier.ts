import { openai } from "./openai";
import { zodResponseFormat } from "openai/helpers/zod";
import fs from "fs/promises";
import path from "path";
import type { PageClassification } from "@/types";
import { classificationSchema } from "./schemas";

interface ClassificationResult {
  page_type: PageClassification;
  confidence: number;
}

const CLASSIFICATION_MODEL = "gpt-4o";
const CLASSIFICATION_SEED = 7;
const CLASSIFICATION_PROMPT = `You are a construction drawing classification engine.
Classify the page into exactly one of:
- site_plan
- floor_plan
- roof_plan
- elevation
- section
- schedule
- details
- unknown

Decision rules:
- Use title-block text, sheet title, and dominant drawing geometry first.
- If the page is ambiguous or confidence is below 0.60, return "unknown".
- Prefer "schedule" for tabular pages, "elevation" for side views, "section" for cut-through views, and "details" for close-up callouts.
- Do not explain your reasoning.
- Return only the schema fields.`;

export async function classifyPage(
  filePath: string
): Promise<ClassificationResult> {
  const fileBuffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  let base64Data: string;

  if (ext === ".pdf") {
    // For PDF pages, send as a file to OpenAI
    // GPT-4o can handle PDF content when sent as base64 images
    // We'll encode as base64 and use a generic approach
    base64Data = fileBuffer.toString("base64");
    // PDFs sent as base64 need to use the file approach
    const response = await openai.chat.completions.parse({
      model: CLASSIFICATION_MODEL,
      messages: [
        {
          role: "system",
          content: CLASSIFICATION_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: path.basename(filePath),
                file_data: `data:application/pdf;base64,${base64Data}`,
              },
            },
            {
              type: "text",
              text: "Classify this construction drawing page. Return only JSON.",
            },
          ],
        },
      ],
      response_format: zodResponseFormat(
        classificationSchema,
        "construction_page_classification"
      ),
      temperature: 0,
      top_p: 1,
      seed: CLASSIFICATION_SEED,
      max_tokens: 200,
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("Unable to parse classification response.");
    }
    return parsed;
  }

  // Image files
  if (ext === ".png") mediaType = "image/png";
  else if (ext === ".webp") mediaType = "image/webp";
  else mediaType = "image/jpeg";

  base64Data = fileBuffer.toString("base64");

  const response = await openai.chat.completions.parse({
    model: CLASSIFICATION_MODEL,
    messages: [
      {
        role: "system",
        content: CLASSIFICATION_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mediaType};base64,${base64Data}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: "Classify this construction drawing page. Return only JSON.",
          },
        ],
      },
    ],
    response_format: zodResponseFormat(
      classificationSchema,
      "construction_page_classification"
    ),
    temperature: 0,
    top_p: 1,
    seed: CLASSIFICATION_SEED,
    max_tokens: 200,
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("Unable to parse classification response.");
  }

  return parsed;
}
