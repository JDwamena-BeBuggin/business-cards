"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectStepper } from "@/components/project-stepper";
import { PageGallery } from "@/components/page-gallery";
import { ExtractionReview } from "@/components/extraction-review";
import { CalculationSummary } from "@/components/calculation-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  HardHat,
  Loader2,
  ScanSearch,
  Calculator,
  FileSpreadsheet,
} from "lucide-react";
import type {
  CalculatedItem,
  ExtractionResult,
  RichTakeoffAnalysis,
} from "@/types";

interface PageData {
  id: string;
  pageNumber: number;
  imagePath: string;
  previewImageSrc?: string;
  classification: string;
  confidence: number;
  rawExtraction: string;
}

type StepId = "upload" | "classify" | "extract" | "review" | "calculate" | "export";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [step, setStep] = useState<StepId>("classify");
  const [pages, setPages] = useState<PageData[]>([]);
  const [extractions, setExtractions] = useState<
    Array<{ pageId: string; pageNumber: number; extraction: ExtractionResult }>
  >([]);
  const [analysis, setAnalysis] = useState<RichTakeoffAnalysis | null>(null);
  const [calculatedItems, setCalculatedItems] = useState<CalculatedItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number | string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");

  // Load project data
  useEffect(() => {
    async function loadProject() {
      const res = await fetch(`/api/projects`);
      const projects = await res.json();
      const project = projects.find((p: { id: string }) => p.id === projectId);
      if (project) setProjectName(project.name);
    }
    loadProject();
  }, [projectId]);

  // Load pages
  useEffect(() => {
    async function loadPages() {
      // We'll use the classify endpoint response or fetch pages from a lightweight endpoint
      // For now, pages are set during classify
    }
    loadPages();
  }, [projectId]);

  const handleClassify = useCallback(async () => {
    setLoading(true);
    setError("");
    setLoadingMessage("Analyzing drawings with AI... This may take a minute.");

    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Classification failed");
      }

      const data = await res.json();
      setPages(
        data.pages.map((p: PageData) => ({
          ...p,
          imagePath: p.imagePath || "",
          previewImageSrc: p.previewImageSrc || "",
          rawExtraction: p.rawExtraction || "{}",
        }))
      );
      setStep("extract");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [projectId]);

  const handleExtract = useCallback(async () => {
    setLoading(true);
    setError("");
    setLoadingMessage("Extracting building data from drawings...");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pages: pages.map(({ id, classification }) => ({ id, classification })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Extraction failed");
      }

      const data = await res.json();
      setExtractions(data.extractions);
      setAnalysis(data.analysis || null);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [pages, projectId]);

  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setError("");
    setLoadingMessage("Running quantity calculations...");

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, overrides }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Calculation failed");
      }

      const data = await res.json();
      setCalculatedItems(data.items);
      setStep("calculate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [projectId, overrides]);

  const handleExport = useCallback(async () => {
    setLoading(true);
    setError("");
    setLoadingMessage("Generating Excel workbook...");

    try {
      const res = await fetch(`/api/export?projectId=${projectId}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "takeoff"}_takeoff.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStep("export");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [projectId, projectName]);

  const handleClassificationChange = (pageId: string, classification: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, classification } : p))
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(243,181,98,0.18),transparent_26%),linear-gradient(135deg,#103048_0%,#173f5f_48%,#1f567d_100%)]">
      <header className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="grid h-[72px] w-[72px] place-items-center rounded-[20px] bg-[linear-gradient(155deg,#27557a_0%,#173f5f_65%,#0f2a40_100%)] text-xl font-extrabold tracking-[0.18em] text-white shadow-[0_24px_54px_rgba(12,31,52,0.14)]">
                PT
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">
                  Residential Takeoff
                </div>
                <h1 className="mt-2 text-4xl font-semibold text-white">
                  {projectName || "Plan Takeoff Desk"}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">
                  Review drawing classifications, measured highlights, and
                  deterministic quantity output in the same workspace.
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              className="rounded-full bg-white/90 text-slate-700 hover:bg-white"
              size="sm"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Projects
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 pb-10">
        <ProjectStepper currentStep={step} />

        {error && (
          <Card className="rounded-[24px] border-red-200 bg-red-50/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardContent className="pt-4">
              <p className="text-red-700 text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card className="rounded-[24px] border-white/60 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardContent className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[#2a678f]" />
              <span className="text-slate-600">{loadingMessage}</span>
            </CardContent>
          </Card>
        )}

        {/* Step: Classify */}
        {step === "classify" && !loading && (
          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardHeader>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Project Input
              </div>
              <CardTitle className="flex items-center gap-2 text-[#173f5f]">
                <HardHat className="h-5 w-5" />
                Analyze Drawing Pages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                The web app now leans on the desktop engine first for page
                ingestion and page typing. When the richer plan analysis path is
                available, it also prepares page previews for review.
              </p>
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Analysis has been tuned for more consistent results, but complex
                drawings can still vary slightly between runs. Review the page
                classifications before extraction.
              </p>
              <Button onClick={handleClassify} className="rounded-full px-6">
                <ScanSearch className="h-4 w-4 mr-2" />
                Analyze Plans
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Extract — show classified pages, allow reclassification */}
        {step === "extract" && !loading && (
          <div className="space-y-4">
            <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
              <CardHeader>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Page Review
                </div>
                <CardTitle className="text-[#173f5f]">
                  Page Classifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-slate-600">
                  Review and correct classifications before extraction. Change
                  any misidentified pages using the dropdowns.
                </p>
                <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  AI extraction is more stable now, but review remains
                  important for low-confidence or ambiguous sheets.
                </p>
                <PageGallery
                  pages={pages}
                  onClassificationChange={handleClassificationChange}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleExtract} className="rounded-full px-6">
                <ArrowRight className="h-4 w-4 mr-2" />
                Extract Building Data
              </Button>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && !loading && (
          <div className="space-y-4">
            <ExtractionReview
              extractions={extractions}
              analysis={analysis}
              overrides={overrides}
              onOverridesChange={setOverrides}
            />

            <div className="flex justify-end">
              <Button onClick={handleCalculate} className="rounded-full px-6">
                <Calculator className="h-4 w-4 mr-2" />
                Run Calculations
              </Button>
            </div>
          </div>
        )}

        {/* Step: Calculate */}
        {step === "calculate" && !loading && (
          <div className="space-y-4">
            <CalculationSummary items={calculatedItems} />

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                className="rounded-full border-white/70 bg-white/90"
                onClick={() => setStep("review")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Review
              </Button>
              <Button onClick={handleExport} className="rounded-full px-6">
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </Button>
            </div>
          </div>
        )}

        {/* Step: Export complete */}
        {step === "export" && !loading && (
          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardContent className="flex flex-col items-center py-12 gap-4">
              <FileSpreadsheet className="h-16 w-16 text-green-600" />
              <h2 className="text-xl font-semibold text-[#173f5f]">
                Takeoff Complete!
              </h2>
              <p className="text-slate-600">
                Your Excel workbook has been downloaded.
              </p>
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="rounded-full border-white/70 bg-white/90"
                  onClick={() => setStep("review")}
                >
                  Edit & Re-export
                </Button>
                <Button onClick={handleExport} className="rounded-full px-6">
                  <Download className="h-4 w-4 mr-2" />
                  Download Again
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-white/70 bg-white/90"
                  onClick={() => router.push("/")}
                >
                  Back to Projects
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
