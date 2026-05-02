"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PageClassification } from "@/types";

interface PageData {
  id: string;
  pageNumber: number;
  imagePath: string;
  previewImageSrc?: string;
  classification: string;
  confidence: number;
}

interface PageGalleryProps {
  pages: PageData[];
  onClassificationChange: (pageId: string, classification: string) => void;
}

const PAGE_TYPES: { value: PageClassification; label: string }[] = [
  { value: "floor_plan", label: "Floor Plan" },
  { value: "roof_plan", label: "Roof Plan" },
  { value: "elevation", label: "Elevation" },
  { value: "section", label: "Section" },
  { value: "site_plan", label: "Site Plan" },
  { value: "schedule", label: "Schedule" },
  { value: "details", label: "Details" },
  { value: "unknown", label: "Unknown" },
];

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "bg-green-100 text-green-800";
  if (confidence >= 0.5) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function PageGallery({
  pages,
  onClassificationChange,
}: PageGalleryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {pages.map((page) => (
        <Card
          key={page.id}
          className="space-y-3 rounded-[24px] border-white/70 bg-white/95 p-4 shadow-[0_18px_38px_rgba(15,42,64,0.12)]"
        >
          <div className="aspect-[8.5/11] overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
            {page.previewImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.previewImageSrc}
                alt={`Page ${page.pageNumber}`}
                className="h-full w-full object-contain"
              />
            ) : !page.imagePath || page.imagePath.endsWith(".pdf") ? (
              <div className="text-center p-4">
                <div className="mb-2 text-4xl">
                  {page.classification === "floor_plan" ? "🏠" :
                   page.classification === "elevation" ? "🏗️" :
                   page.classification === "roof_plan" ? "🏚️" :
                   page.classification === "section" ? "📐" :
                   page.classification === "schedule" ? "📋" :
                   page.classification === "site_plan" ? "🗺️" : "📄"}
                </div>
                <div className="font-medium text-slate-700">Page {page.pageNumber}</div>
                <div className="mt-1 text-xs capitalize text-slate-500">
                  {page.classification.replace("_", " ")}
                </div>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.imagePath}
                alt={`Page ${page.pageNumber}`}
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Sheet
              </div>
              <span className="text-sm font-semibold text-slate-700">
                Page {page.pageNumber}
              </span>
            </div>
            {page.confidence > 0 && (
              <Badge
                variant="secondary"
                className={confidenceColor(page.confidence)}
              >
                {Math.round(page.confidence * 100)}%
              </Badge>
            )}
          </div>

          <Select
            value={page.classification}
            onValueChange={(val) => val && onClassificationChange(page.id, val)}
          >
            <SelectTrigger className="h-10 rounded-xl border-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPES.map((pt) => (
                <SelectItem key={pt.value} value={pt.value}>
                  {pt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      ))}
    </div>
  );
}
