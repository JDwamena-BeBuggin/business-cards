"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowRight, HardHat } from "lucide-react";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  pageCount: number;
  itemCount: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  classified: "bg-blue-100 text-blue-700",
  extracted: "bg-purple-100 text-purple-700",
  validated: "bg-indigo-100 text-indigo-700",
  calculated: "bg-amber-100 text-amber-700",
  exported: "bg-green-100 text-green-700",
};

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projectList = (await res.json()) as ProjectSummary[];
        startTransition(() => {
          setProjects(projectList);
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleUploadComplete = (data: {
    project: { id: string; name: string; status: string };
  }) => {
    router.push(`/projects/${data.project.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
    loadProjects();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(243,181,98,0.2),transparent_26%),linear-gradient(135deg,#103048_0%,#173f5f_48%,#1f567d_100%)]">
      <header className="px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-[72px] w-[72px] place-items-center rounded-[20px] bg-[linear-gradient(155deg,#27557a_0%,#173f5f_65%,#0f2a40_100%)] text-xl font-extrabold tracking-[0.18em] text-white shadow-[0_24px_54px_rgba(12,31,52,0.14)]">
              PT
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">
                Residential Takeoff
              </div>
              <h1 className="mt-2 text-4xl font-semibold text-white">
                Plan Takeoff Desk Web
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/80">
                Upload a residential plan set, let the merged desktop-plus-web
                analysis pipeline classify and extract the drawings, then review the
                measured takeoff in one browser workspace.
              </p>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 text-white shadow-[0_18px_38px_rgba(15,42,64,0.12)] backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">
              New Mobile Tool
            </div>
            <div className="mt-2 text-lg font-semibold">Card Flow</div>
            <p className="mt-2 max-w-xs text-sm leading-6 text-white/80">
              Capture business cards, draft follow-ups, and export your contact list from your phone.
            </p>
            <Button
              className="mt-4 rounded-full bg-white text-[#173f5f] hover:bg-white/90"
              onClick={() => router.push("/card-flow")}
            >
              Open Card Flow
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-10 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        {/* Upload */}
        <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
          <CardHeader>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Project
            </div>
            <CardTitle className="text-[#173f5f]">New Takeoff</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadDropzone onUploadComplete={handleUploadComplete} />
          </CardContent>
        </Card>

        {/* Projects List */}
        <div className="space-y-6">
          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardHeader>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Live Workspace
              </div>
              <CardTitle className="text-[#173f5f]">
                Recent Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                          <HardHat className="h-5 w-5 text-[#173f5f]" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {project.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            {project.pageCount} pages &middot;{" "}
                            {project.itemCount} items &middot;{" "}
                            {new Date(project.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[project.status] || ""}
                        >
                          {project.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleDelete(project.id)}
                        >
                          <Trash2 className="h-4 w-4 text-gray-400" />
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={() =>
                            router.push(`/projects/${project.id}`)
                          }
                        >
                          Open
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
                  Your uploaded takeoff projects will appear here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
            <CardHeader>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                What Changed
              </div>
              <CardTitle className="text-[#173f5f]">
                Desktop Engine, Web Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                The app now preserves the original upload, can reuse the desktop
                app&apos;s richer PDF analysis pipeline when available, and
                carries quantity presets, review flags, and highlight data into
                the web review flow.
              </p>
              <p>
                If the desktop analysis dependencies are unavailable, the web app
                still falls back to the existing page-by-page AI flow so you can
                keep moving.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
