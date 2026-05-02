"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UploadDropzoneProps {
  onUploadComplete: (data: {
    project: { id: string; name: string; status: string };
    pageCount: number;
    pages: Array<{ id: string; pageNumber: number; imagePath: string }>;
  }) => void;
}

export function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      setError("");

      const file = acceptedFiles[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", projectName || file.name.replace(/\.[^.]+$/, ""));

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();
        onUploadComplete(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [projectName, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="projectName" className="text-slate-700">
          Project Name
        </Label>
        <Input
          id="projectName"
          placeholder="e.g. Smith Residence"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="mt-1 rounded-2xl border-slate-200 bg-white"
        />
      </div>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-[28px] border-2 border-dashed p-12 text-center transition-colors ${
          isDragActive
            ? "border-[#2a678f] bg-[#eff5fa]"
            : "border-slate-300 bg-[linear-gradient(145deg,rgba(23,63,95,0.04),rgba(243,181,98,0.14))] hover:border-slate-400"
        } ${uploading ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-[#2a678f]" />
            <p className="text-lg font-semibold text-slate-800">
              Processing drawings...
            </p>
            <p className="text-sm text-slate-500">Splitting PDF into pages</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {isDragActive ? (
              <Upload className="h-12 w-12 text-[#2a678f]" />
            ) : (
              <FileText className="h-12 w-12 text-slate-400" />
            )}
            <p className="text-lg font-semibold text-slate-800">
              {isDragActive
                ? "Drop your drawings here"
                : "Drag & drop construction drawings"}
            </p>
            <p className="text-sm text-slate-500">PDF, JPG, or PNG</p>
            <Button
              variant="outline"
              className="mt-2 rounded-full border-slate-300 bg-white/90"
              type="button"
            >
              Browse Files
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
