import { z } from "zod";
import type { PageClassification } from "@/types";

const confidenceSchema = z.number().min(0).max(1);
const inferredValuesSchema = z.array(z.string());

export const classificationSchema = z.object({
  page_type: z.enum([
    "site_plan",
    "floor_plan",
    "roof_plan",
    "elevation",
    "section",
    "schedule",
    "details",
    "unknown",
  ]),
  confidence: confidenceSchema,
});

export const projectMetadataSchema = z.object({
  project_name: z.string(),
  address: z.string(),
  units: z.enum(["metric", "imperial"]),
  scale: z.string(),
  floors: z.number().int().nonnegative(),
});

export const floorPlanSchema = z.object({
  floor_name: z.string(),
  rooms: z.array(
    z.object({
      name: z.string(),
      area: z.number().nonnegative(),
      unit: z.string(),
    })
  ),
  wall_segments: z.array(
    z.object({
      type: z.enum(["exterior", "interior"]),
      length: z.number().nonnegative(),
      unit: z.string(),
    })
  ),
  total_floor_area: z.number().nonnegative(),
  unit: z.string(),
});

export const openingScheduleSchema = z.object({
  windows: z.array(
    z.object({
      type: z.string(),
      size: z.string(),
      count: z.number().int().nonnegative(),
    })
  ),
  doors: z.array(
    z.object({
      type: z.string(),
      size: z.string(),
      count: z.number().int().nonnegative(),
    })
  ),
});

export const roofSchema = z.object({
  roof_area: z.number().nonnegative(),
  unit: z.string(),
  slope: z.string(),
});

export const elevationSchema = z.object({
  wall_height: z.number().nonnegative(),
  unit: z.string(),
  floor_to_floor_height: z.number().nonnegative(),
});

export const extractionResultSchema = z.object({
  page_type: classificationSchema.shape.page_type,
  confidence: confidenceSchema,
  metadata: projectMetadataSchema.optional(),
  floor_plan: floorPlanSchema.optional(),
  openings: openingScheduleSchema.optional(),
  roof: roofSchema.optional(),
  elevation: elevationSchema.optional(),
  inferred_values: inferredValuesSchema.optional(),
});

export const floorPlanExtractionSchema = z.object({
  page_type: z.literal("floor_plan"),
  confidence: confidenceSchema,
  floor_plan: floorPlanSchema,
  openings: openingScheduleSchema,
  metadata: projectMetadataSchema,
  inferred_values: inferredValuesSchema,
});

export const roofPlanExtractionSchema = z.object({
  page_type: z.literal("roof_plan"),
  confidence: confidenceSchema,
  roof: roofSchema,
  inferred_values: inferredValuesSchema,
});

export const elevationExtractionSchema = z.object({
  page_type: z.literal("elevation"),
  confidence: confidenceSchema,
  elevation: elevationSchema,
  roof: roofSchema,
  inferred_values: inferredValuesSchema,
});

export const sectionExtractionSchema = z.object({
  page_type: z.literal("section"),
  confidence: confidenceSchema,
  elevation: elevationSchema,
  roof: roofSchema,
  inferred_values: inferredValuesSchema,
});

export const scheduleExtractionSchema = z.object({
  page_type: z.literal("schedule"),
  confidence: confidenceSchema,
  openings: openingScheduleSchema,
  inferred_values: inferredValuesSchema,
});

export const sitePlanExtractionSchema = z.object({
  page_type: z.literal("site_plan"),
  confidence: confidenceSchema,
  metadata: projectMetadataSchema,
  inferred_values: inferredValuesSchema,
});

export const detailsExtractionSchema = z.object({
  page_type: z.literal("details"),
  confidence: confidenceSchema,
  metadata: projectMetadataSchema,
  inferred_values: inferredValuesSchema,
});

export function getExtractionSchema(pageType: PageClassification) {
  switch (pageType) {
    case "floor_plan":
      return floorPlanExtractionSchema;
    case "roof_plan":
      return roofPlanExtractionSchema;
    case "elevation":
      return elevationExtractionSchema;
    case "section":
      return sectionExtractionSchema;
    case "schedule":
      return scheduleExtractionSchema;
    case "site_plan":
      return sitePlanExtractionSchema;
    case "details":
      return detailsExtractionSchema;
    default:
      return extractionResultSchema;
  }
}
