"use client";

import { Check } from "lucide-react";

interface Step {
  id: string;
  label: string;
}

const STEPS: Step[] = [
  { id: "upload", label: "Upload" },
  { id: "classify", label: "Classify" },
  { id: "extract", label: "Extract" },
  { id: "review", label: "Review" },
  { id: "calculate", label: "Calculate" },
  { id: "export", label: "Export" },
];

interface ProjectStepperProps {
  currentStep: string;
}

export function ProjectStepper({ currentStep }: ProjectStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-[24px] border border-white/60 bg-white/90 px-5 py-4 shadow-[0_18px_38px_rgba(15,42,64,0.12)] backdrop-blur">
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isComplete
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                    ? "bg-[#173f5f] text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`mt-1 text-[11px] uppercase tracking-[0.16em] ${
                  isCurrent ? "font-semibold text-[#173f5f]" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  index < currentIndex ? "bg-emerald-600" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
