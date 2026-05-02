import { openai } from "./openai";
import { zodResponseFormat } from "openai/helpers/zod";
import fs from "fs/promises";
import path from "path";
import type { PageClassification, ExtractionResult } from "@/types";
import { getExtractionSchema } from "./schemas";

const EXTRACTION_MODEL = "gpt-4o";
const EXTRACTION_SEED = 7;

function getExtractionPrompt(pageType: PageClassification): string {
  const base = `You are a construction drawing data extraction engine. Extract structured data from this construction drawing.
Output ONLY valid JSON that matches the provided schema exactly.
Rules:
- Use only values that are explicitly visible or directly computable from visible labeled dimensions.
- Do not add ad hoc keys such as "inferred": true.
- If a value is unavailable, use empty strings, 0, or [] as appropriate and list the uncertainty in "inferred_values".
- Keep units consistent with what is shown on the plan. If the plan does not state units, default to imperial.
- Round numeric values to at most 2 decimal places.
- Prefer omission of speculation over guessing.`;

  switch (pageType) {
    case "floor_plan":
      return `${base}

Extract the following from this floor plan:
{
  "page_type": "floor_plan",
  "confidence": <0-1>,
  "floor_plan": {
    "floor_name": "<e.g. Main, Upper, Basement>",
    "rooms": [{"name": "<room name>", "area": <number>, "unit": "sqft"}],
    "wall_segments": [{"type": "exterior|interior", "length": <number>, "unit": "ft"}],
    "total_floor_area": <number>,
    "unit": "sqft"
  },
  "openings": {
    "windows": [{"type": "<W1, W2...>", "size": "<WxH>", "count": <number>}],
    "doors": [{"type": "<D1, D2...>", "size": "<WxH>", "count": <number>}]
  },
  "metadata": {
    "project_name": "<if visible>",
    "address": "<if visible>",
    "units": "imperial",
    "scale": "<if visible>",
    "floors": <number if determinable>
  },
  "inferred_values": ["<list any values you estimated rather than read directly>"]
}

Measure all wall segments you can identify. Calculate room areas from dimensions if not labeled. Count all doors and windows visible.`;

    case "roof_plan":
      return `${base}

Extract the following from this roof plan:
{
  "page_type": "roof_plan",
  "confidence": <0-1>,
  "roof": {
    "roof_area": <number>,
    "unit": "sqft",
    "slope": "<rise:run, e.g. 6:12>"
  },
  "inferred_values": ["<list any values you estimated>"]
}

Calculate total roof area from dimensions. Identify slope/pitch if noted.`;

    case "elevation":
    case "section":
      return `${base}

Extract the following from this ${pageType}:
{
  "page_type": "${pageType}",
  "confidence": <0-1>,
  "elevation": {
    "wall_height": <number>,
    "unit": "ft",
    "floor_to_floor_height": <number>
  },
  "roof": {
    "roof_area": <number or 0 if not determinable>,
    "unit": "sqft",
    "slope": "<rise:run if visible>"
  },
  "inferred_values": ["<list any values you estimated>"]
}

Identify wall heights, floor-to-floor heights, and roof pitch if visible.`;

    case "schedule":
      return `${base}

Extract the following from this schedule page:
{
  "page_type": "schedule",
  "confidence": <0-1>,
  "openings": {
    "windows": [{"type": "<W1, W2...>", "size": "<WxH>", "count": <number>}],
    "doors": [{"type": "<D1, D2...>", "size": "<WxH>", "count": <number>}]
  },
  "inferred_values": ["<list any values you estimated>"]
}

Extract all door and window schedule entries with types, sizes, and quantities.`;

    case "site_plan":
      return `${base}

Extract the following from this site plan:
{
  "page_type": "site_plan",
  "confidence": <0-1>,
  "metadata": {
    "project_name": "<if visible>",
    "address": "<if visible>",
    "units": "imperial",
    "scale": "<if visible>",
    "floors": <number if determinable>
  },
  "inferred_values": ["<list any values you estimated>"]
}

Extract project information, address, scale, and any building footprint data.`;

    default:
      return `${base}

Extract any construction-relevant data from this drawing page:
{
  "page_type": "${pageType}",
  "confidence": <0-1>,
  "metadata": {
    "project_name": "<if visible>",
    "address": "<if visible>",
    "units": "imperial",
    "scale": "<if visible>",
    "floors": <number if determinable>
  },
  "inferred_values": ["<list any values you estimated>"]
}`;
  }
}

export async function extractPageData(
  filePath: string,
  pageType: PageClassification
): Promise<ExtractionResult> {
  const fileBuffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const prompt = getExtractionPrompt(pageType);
  const extractionSchema = getExtractionSchema(pageType);

  let userContent: Array<Record<string, unknown>>;

  if (ext === ".pdf") {
    const base64Data = fileBuffer.toString("base64");
    userContent = [
      {
        type: "file",
        file: {
          filename: path.basename(filePath),
          file_data: `data:application/pdf;base64,${base64Data}`,
        },
      },
      {
        type: "text",
        text: "Extract all construction data from this drawing. Return only JSON.",
      },
    ];
  } else {
    let mediaType = "image/jpeg";
    if (ext === ".png") mediaType = "image/png";
    else if (ext === ".webp") mediaType = "image/webp";
    const base64Data = fileBuffer.toString("base64");
    userContent = [
      {
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${base64Data}`,
          detail: "high",
        },
      },
      {
        type: "text",
        text: "Extract all construction data from this drawing. Return only JSON.",
      },
    ];
  }

  const response = await openai.chat.completions.parse({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: prompt },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "user", content: userContent as any },
    ],
    response_format: zodResponseFormat(
      extractionSchema,
      `construction_${pageType}_extraction`
    ),
    temperature: 0,
    top_p: 1,
    seed: EXTRACTION_SEED,
    max_tokens: 4000,
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error(`Unable to parse ${pageType} extraction response.`);
  }

  return parsed as ExtractionResult;
}
