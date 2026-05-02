"use client";

import NextImage from "next/image";
import { startTransition, useEffect, useRef, useState, useCallback } from "react";
import {
  contactDisplayName,
  formatPhoneSummary,
  normalizeTags,
  TAG_OPTIONS,
  type CardFlowContact,
  type CardFlowTag,
  type ContactExtraction,
  type ContactExtractionBatch,
  type FollowUpOutput,
} from "@/lib/card-flow";

type AppPhase = "upload" | "extracting" | "review" | "generating" | "done";
type OutputTab = "email" | "linkedin" | "crm" | "task" | "json";

type ImageState = {
  dataUrl: string;
  mediaType: string;
  originalName: string;
  originalSize: number;
};

type DraftContact = CardFlowContact & {
  draft_id: string;
  tags: CardFlowTag[];
};

type StoredContact = CardFlowContact & {
  id: string;
  added_at: string;
  updated_at?: string;
  tags: CardFlowTag[];
};

const OUTPUT_TABS: Array<{ id: OutputTab; label: string }> = [
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "crm", label: "CRM Note" },
  { id: "task", label: "Task" },
  { id: "json", label: "JSON" },
];

const EMPTY_CONTACT: CardFlowContact = {
  first_name: "",
  last_name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  cell_phone: "",
  office_phone: "",
  fax_phone: "",
  other_phone: "",
  website: "",
  linkedin: "",
  address: "",
  contact_type: "Other",
  tags: [],
  notes: "",
  source: "Business Card",
  date_met: new Date().toISOString().split("T")[0],
  event: "",
  follow_up_status: "Needed",
};

const headingStyle = {
  fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif',
};

const monoShellStyle = {
  fontFamily: '"SFMono-Regular", Menlo, Monaco, "Courier New", monospace',
};

function generateId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `card-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function hydrateContact<T extends Partial<CardFlowContact>>(contact: T): CardFlowContact {
  return {
    ...EMPTY_CONTACT,
    ...contact,
    tags: normalizeTags(Array.isArray(contact.tags) ? contact.tags : []),
  };
}

function hydrateStoredContact(contact: Partial<StoredContact>): StoredContact {
  const hydrated = hydrateContact(contact);
  return {
    ...hydrated,
    id: contact.id || generateId(),
    added_at: contact.added_at || new Date().toISOString(),
    updated_at: contact.updated_at,
    tags: hydrated.tags as CardFlowTag[],
  };
}

function createDraftContact(
  extracted: ContactExtraction,
  source: CardFlowContact["source"],
  batch: { event: string; dateMet: string; notes: string }
): DraftContact {
  const hydrated = hydrateContact(extracted);
  const combinedNotes =
    batch.notes && hydrated.notes
      ? `${batch.notes}\n${hydrated.notes}`
      : batch.notes || hydrated.notes;
  return {
    ...hydrated,
    source,
    follow_up_status: "Needed",
    date_met: batch.dateMet || new Date().toISOString().split("T")[0],
    event: batch.event || hydrated.event,
    notes: combinedNotes,
    draft_id: generateId(),
    tags: hydrated.tags as CardFlowTag[],
  };
}

function buildVCard(contact: CardFlowContact): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(contact.last_name)};${esc(contact.first_name)};;;`,
    `FN:${esc([contact.first_name, contact.last_name].filter(Boolean).join(" "))}`,
  ];
  if (contact.company) lines.push(`ORG:${esc(contact.company)}`);
  if (contact.title) lines.push(`TITLE:${esc(contact.title)}`);
  if (contact.email) lines.push(`EMAIL;type=INTERNET;type=WORK:${contact.email}`);
  if (contact.cell_phone) lines.push(`TEL;type=CELL:${contact.cell_phone}`);
  if (contact.office_phone) lines.push(`TEL;type=WORK:${contact.office_phone}`);
  if (contact.phone) lines.push(`TEL;type=VOICE:${contact.phone}`);
  if (contact.fax_phone) lines.push(`TEL;type=FAX:${contact.fax_phone}`);
  if (contact.other_phone) lines.push(`TEL;type=OTHER:${contact.other_phone}`);
  if (contact.website) lines.push(`URL:${contact.website}`);
  if (contact.linkedin) lines.push(`X-SOCIALPROFILE;type=linkedin:${contact.linkedin}`);
  if (contact.address) lines.push(`ADR;type=WORK:;;${esc(contact.address)};;;;`);
  if (contact.notes) lines.push(`NOTE:${esc(contact.notes)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

function downloadVCard(contact: CardFlowContact) {
  const vcf = buildVCard(contact);
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const name = [contact.first_name, contact.last_name].filter(Boolean).join("_") || "contact";
  link.download = `${name}.vcf`;
  link.click();
  URL.revokeObjectURL(url);
}

function stripDraftMetadata(contact: DraftContact): CardFlowContact {
  const { draft_id, ...rest } = contact;
  void draft_id;
  return hydrateContact(rest);
}

function findDuplicateIndex(
  existingContacts: StoredContact[],
  candidate: CardFlowContact
) {
  return existingContacts.findIndex((entry) => {
    const sameEmail =
      entry.email &&
      candidate.email &&
      entry.email.toLowerCase() === candidate.email.toLowerCase();

    const sameNameCompany =
      entry.first_name.toLowerCase() === candidate.first_name.toLowerCase() &&
      entry.last_name.toLowerCase() === candidate.last_name.toLowerCase() &&
      entry.company.toLowerCase() === candidate.company.toLowerCase();

    return sameEmail || sameNameCompany;
  });
}

async function processImage(file: File, maxDim = 1568, quality = 0.84) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Image is too large. Keep it under 15MB.");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  const compressed = await new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not decode the image."));
    image.onload = () => {
      const largestSide = Math.max(image.width, image.height);
      const scale = Math.min(1, maxDim / largestSide);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not create an image canvas."));
        return;
      }

      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.src = dataUrl;
  });

  return {
    dataUrl: compressed,
    mediaType: "image/jpeg",
    originalName: file.name,
    originalSize: file.size,
  } satisfies ImageState;
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function statusLabel(phase: AppPhase, hasError: boolean) {
  if (hasError) return "Needs attention";
  if (phase === "extracting") return "Reading cards";
  if (phase === "generating") return "Drafting follow-up";
  if (phase === "done") return "Ready";
  if (phase === "review") return "Review contacts";
  return "Ready";
}

function StatusPill({
  phase,
  hasError,
}: {
  phase: AppPhase;
  hasError: boolean;
}) {
  const color = hasError
    ? "bg-rose-500/20 text-rose-200 border-rose-400/30"
    : phase === "extracting" || phase === "generating"
      ? "bg-amber-400/20 text-amber-100 border-amber-300/30"
      : "bg-lime-300/20 text-lime-100 border-lime-200/30";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${color}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${hasError ? "bg-rose-300" : phase === "extracting" || phase === "generating" ? "bg-amber-200 animate-pulse" : "bg-lime-200"}`}
      />
      {statusLabel(phase, hasError)}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}) {
  const className =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-lime-200/40 focus:outline-none";

  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

function MultiImageZone({
  images,
  processing,
  onSelect,
  onRemove,
  onClearAll,
}: {
  images: ImageState[];
  processing: boolean;
  onSelect: (files: File[]) => void;
  onRemove: (index: number) => void;
  onClearAll: () => void;
}) {
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
          Card Photos
        </div>
        {images.length ? (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-lime-200/40 hover:text-lime-100"
          >
            Clear All
          </button>
        ) : null}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => libraryInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            libraryInputRef.current?.click();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          onSelect(Array.from(event.dataTransfer.files));
        }}
        onDragOver={(event) => event.preventDefault()}
        className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] px-6 py-8 text-center transition hover:border-lime-200/40 hover:bg-white/[0.06]"
      >
        {processing ? (
          <div className="text-sm text-lime-100">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-lime-200/20 border-t-lime-200" />
            Processing selected images…
          </div>
        ) : (
          <>
            <div className="mb-4 text-4xl">📷</div>
            <div className="text-sm font-medium text-slate-100">
              Upload one or more card photos
            </div>
            <div className="mt-2 text-xs leading-6 text-slate-400">
              Fronts, backs, and even a single photo containing multiple cards all work here.
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-medium text-slate-100 transition active:bg-white/10 hover:border-lime-200/40 hover:text-lime-100"
        >
          📸 Take Photo
        </button>
        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-medium text-slate-100 transition active:bg-white/10 hover:border-lime-200/40 hover:text-lime-100"
        >
          🖼 Choose Photos
        </button>
      </div>
      {/* Library input — multiple files, no capture so gallery opens on mobile */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onSelect(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      {/* Camera input — capture without multiple; iOS drops multiple when capture is set */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          onSelect(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />

      {images.length ? (
        <div className="grid grid-cols-2 gap-3">
          {images.map((image, index) => (
            <div
              key={`${image.originalName}-${index}`}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-2"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-[18px]">
                <NextImage
                  src={image.dataUrl}
                  alt={image.originalName}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs text-slate-100">
                    {image.originalName}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {(image.originalSize / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-rose-400/30 hover:text-rose-100"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-lime-200/40 hover:text-lime-100"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CardFlowApp() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [images, setImages] = useState<ImageState[]>([]);
  const [imagesProcessing, setImagesProcessing] = useState(false);
  const [batchEvent, setBatchEvent] = useState("");
  const [batchDateMet, setBatchDateMet] = useState(new Date().toISOString().split("T")[0]);
  const [batchNotes, setBatchNotes] = useState("");
  const [draftContacts, setDraftContacts] = useState<DraftContact[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [followUpsByDraftId, setFollowUpsByDraftId] = useState<
    Record<string, FollowUpOutput>
  >({});
  const [activeTab, setActiveTab] = useState<OutputTab>("email");
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [dbView, setDbView] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    startTransition(() => {
      setLog((current) => [
        `${timestamp()}  ${message}`,
        ...current.slice(0, 35),
      ]);
    });
  };

  const reloadContacts = useCallback(async (logMessage?: string) => {
    const payload = await getJson<StoredContact[]>("/api/card-flow/contacts");
    const hydrated = payload.map(hydrateStoredContact);
    setContacts(hydrated);
    if (logMessage) {
      addLog(logMessage.replace("{count}", String(hydrated.length)));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await reloadContacts(
          "Loaded {count} shared contact records from the central database."
        );
      } catch (error) {
        addLog(
          error instanceof Error
            ? `Could not load shared contacts: ${error.message}`
            : "Could not load shared contacts."
        );
      }
    })();
  }, [reloadContacts]);

  const selectedDraft =
    draftContacts.find((contact) => contact.draft_id === selectedDraftId) || null;
  const selectedOutput = selectedDraftId
    ? followUpsByDraftId[selectedDraftId] || null
    : null;

  async function handleImageSelect(files: File[]) {
    if (!files.length) {
      return;
    }

    setImagesProcessing(true);
    setErrorMessage("");
    addLog(`Preparing ${files.length} image${files.length === 1 ? "" : "s"}…`);

    const processedImages: ImageState[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        processedImages.push(await processImage(file));
      } catch (error) {
        failures.push(
          error instanceof Error
            ? `${file.name}: ${error.message}`
            : `${file.name}: Image processing failed.`
        );
      }
    }

    if (processedImages.length) {
      setImages((current) => [...current, ...processedImages]);
      addLog(
        `Ready: added ${processedImages.length} image${processedImages.length === 1 ? "" : "s"} for extraction.`
      );
    }

    if (failures.length) {
      const message = failures.join(" ");
      setErrorMessage(message);
      addLog(`Image error: ${message}`);
    }

    setImagesProcessing(false);
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function resetComposer() {
    setPhase("upload");
    setManualText("");
    setImages([]);
    setImagesProcessing(false);
    setDraftContacts([]);
    setSelectedDraftId(null);
    setFollowUpsByDraftId({});
    setActiveTab("email");
    setErrorMessage("");
  }

  function updateSelectedDraft<K extends keyof DraftContact>(
    key: K,
    value: DraftContact[K]
  ) {
    if (!selectedDraftId) return;

    setDraftContacts((current) =>
      current.map((contact) =>
        contact.draft_id === selectedDraftId
          ? {
              ...contact,
              [key]: value,
            }
          : contact
      )
    );
  }

  function setSelectedDraftById(draftId: string) {
    setSelectedDraftId(draftId);
    setPhase(followUpsByDraftId[draftId] ? "done" : "review");
    setErrorMessage("");
  }

  async function saveDraftContact(draftContact: DraftContact) {
    const persistable = stripDraftMetadata(draftContact);
    const duplicateIndex = findDuplicateIndex(contacts, persistable);
    const existing = duplicateIndex === -1 ? null : contacts[duplicateIndex];
    const payload = hydrateStoredContact({
      ...persistable,
      id: existing?.id || generateId(),
      added_at: existing?.added_at || new Date().toISOString(),
      tags: persistable.tags as CardFlowTag[],
    });

    const saved = await postJson<StoredContact>("/api/card-flow/contacts", payload);

    setContacts((current) => {
      const hydrated = hydrateStoredContact(saved);
      const savedIndex = current.findIndex((entry) => entry.id === hydrated.id);
      if (savedIndex === -1) {
        return [hydrated, ...current];
      }

      const next = [...current];
      next[savedIndex] = hydrated;
      return next;
    });

    if (duplicateIndex === -1) {
      addLog(`Saved ${contactDisplayName(draftContact)} to the shared contacts database.`);
    } else {
      addLog(`Updated the shared record for ${contactDisplayName(draftContact)}.`);
    }
  }

  async function saveCurrentContact() {
    if (!selectedDraft) return;

    try {
      await saveDraftContact(selectedDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save contact.";
      setErrorMessage(message);
      addLog(`Save failed: ${message}`);
    }
  }

  async function saveAllDraftContacts() {
    if (!draftContacts.length) return;

    try {
      for (const draft of draftContacts) {
        await saveDraftContact(draft);
      }
      addLog(
        `Saved all ${draftContacts.length} contact${draftContacts.length === 1 ? "" : "s"} to the shared database.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save all contacts.";
      setErrorMessage(message);
      addLog(`Bulk save failed: ${message}`);
    }
  }

  async function exportDraftsToXlsx() {
    const toExport = draftContacts.map(stripDraftMetadata);
    if (!toExport.length) return;

    addLog("Building XLSX export from current batch…");

    try {
      const response = await fetch("/api/card-flow/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: toExport }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `card-flow-contacts-${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      addLog(`Exported ${toExport.length} contact${toExport.length === 1 ? "" : "s"} to XLSX.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      setErrorMessage(message);
      addLog(`Export failed: ${message}`);
    }
  }

  async function extractContacts() {
    if (manualMode && !manualText.trim()) {
      setErrorMessage("Paste the card text before extracting.");
      return;
    }

    if (!manualMode && !images.length) {
      setErrorMessage("Add at least one image before extracting.");
      return;
    }

    setPhase("extracting");
    setFollowUpsByDraftId({});
    setErrorMessage("");
    addLog(
      manualMode
        ? "Sending pasted card text for extraction…"
        : `Sending ${images.length} uploaded image${images.length === 1 ? "" : "s"} for extraction…`
    );

    try {
      const extractedBatch = await postJson<ContactExtractionBatch>(
        "/api/card-flow/extract",
        {
          manualText: manualMode ? manualText.trim() : undefined,
          images: manualMode ? undefined : images.map((image) => image.dataUrl),
        }
      );

      const extractedDrafts = extractedBatch.contacts.map((contact) =>
        createDraftContact(contact, manualMode ? "Manual Entry" : "Business Card", {
          event: batchEvent,
          dateMet: batchDateMet,
          notes: batchNotes,
        })
      );

      setDraftContacts(extractedDrafts);
      setSelectedDraftId(extractedDrafts[0]?.draft_id || null);
      setPhase("review");
      addLog(
        `Detected ${extractedDrafts.length} contact${extractedDrafts.length === 1 ? "" : "s"} from the current upload set.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed.";
      setErrorMessage(message);
      setPhase("upload");
      addLog(`Extraction failed: ${message}`);
    }
  }

  async function generateFollowUps() {
    if (!selectedDraft) return;

    const persistable = stripDraftMetadata(selectedDraft);

    setPhase("generating");
    setErrorMessage("");
    addLog(`Generating follow-up set for ${contactDisplayName(selectedDraft)}…`);

    try {
      const generated = await postJson<FollowUpOutput>("/api/card-flow/generate", {
        contact: persistable,
      });

      await saveDraftContact(selectedDraft);
      setFollowUpsByDraftId((current) => ({
        ...current,
        [selectedDraft.draft_id]: generated,
      }));
      setPhase("done");
      addLog(`Follow-up pack is ready for ${contactDisplayName(selectedDraft)}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Follow-up generation failed.";
      setErrorMessage(message);
      setPhase("review");
      addLog(`Generation failed: ${message}`);
    }
  }

  async function exportContacts() {
    if (!contacts.length) return;

    addLog("Building XLSX export…");

    try {
      const response = await fetch("/api/card-flow/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contacts }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "Export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `card-flow-contacts-${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      addLog(
        `Exported ${contacts.length} contact${contacts.length === 1 ? "" : "s"} to XLSX.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      setErrorMessage(message);
      addLog(`Export failed: ${message}`);
    }
  }

  async function deleteSavedContact(contact: StoredContact) {
    try {
      await fetch(`/api/card-flow/contacts?id=${encodeURIComponent(contact.id)}`, {
        method: "DELETE",
      });
      setContacts((current) => current.filter((row) => row.id !== contact.id));
      addLog(`Deleted ${contactDisplayName(contact)} from shared contacts.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete contact.";
      setErrorMessage(message);
      addLog(`Delete failed: ${message}`);
    }
  }

  async function clearSavedContacts() {
    if (
      !confirm(
        `Delete all ${contacts.length} shared contacts from the central database?`
      )
    ) {
      return;
    }

    try {
      for (const contact of contacts) {
        await fetch(`/api/card-flow/contacts?id=${encodeURIComponent(contact.id)}`, {
          method: "DELETE",
        });
      }
      setContacts([]);
      addLog("Cleared the shared contact database.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear shared contacts.";
      setErrorMessage(message);
      addLog(`Clear failed: ${message}`);
    }
  }

  function isDraftSaved(draftContact: DraftContact) {
    return findDuplicateIndex(contacts, stripDraftMetadata(draftContact)) !== -1;
  }

  const working = phase === "extracting" || phase === "generating";

  return (
    <div
      className="min-h-screen overflow-hidden bg-[#04111f] text-slate-100"
      style={monoShellStyle}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-80 w-80 rounded-full bg-lime-300/12 blur-3xl" />
        <div className="absolute bottom-[-8%] right-[-6%] h-96 w-96 rounded-full bg-cyan-300/12 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(186,230,53,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.14),transparent_28%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="rounded-[32px] border border-white/10 bg-white/[0.04] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.24em] text-lime-200/80">
                Business Card Workflow
              </div>
              <h1
                className="mt-3 text-4xl leading-none text-white sm:text-5xl"
                style={headingStyle}
              >
                Card Flow
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-[15px]">
                Upload a batch of business card photos, let the app merge matching
                fronts and backs, split multiple cards into separate contacts, and
                keep every saved record synced through one shared contacts database.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Mobile + Desktop
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Shared Contacts DB
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Multi-Card Extraction
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <StatusPill phase={phase} hasError={Boolean(errorMessage)} />
              <button
                type="button"
                onClick={() => setDbView((current) => !current)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-200 transition hover:border-lime-200/40 hover:text-lime-100"
              >
                {dbView ? "Back to Capture" : `Shared Contacts (${contacts.length})`}
              </button>
            </div>
          </div>
        </header>

        <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="rounded-[32px] border border-white/10 bg-slate-950/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  Capture
                </div>
                <div className="mt-2 text-2xl text-white" style={headingStyle}>
                  {manualMode ? "Paste Details" : "Upload Card Photos"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setManualMode((current) => !current);
                  setErrorMessage("");
                }}
                disabled={working}
                className="rounded-full border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-200 transition hover:border-lime-200/40 hover:text-lime-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {manualMode ? "Use Photos" : "Manual Mode"}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {manualMode ? (
                <div>
                  <label className="block">
                    <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      Card Text
                    </span>
                    <textarea
                      value={manualText}
                      onChange={(event) => setManualText(event.target.value)}
                      rows={11}
                      placeholder={
                        "Kris Murphy\nProject Manager\nPhilco Construction\nC: 250-886-9298\nO: 778-351-2446\nF: 250-555-0199\nkris@philcobuilt.com\nphilcobuilt.com"
                      }
                      className="w-full rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-100 placeholder:text-slate-500 focus:border-lime-200/40 focus:outline-none"
                    />
                  </label>
                  <p className="mt-3 text-xs leading-6 text-slate-400">
                    You can paste one card or several contacts. The extractor splits
                    distinct people into separate records when it can identify them.
                  </p>
                </div>
              ) : (
                <MultiImageZone
                  images={images}
                  processing={imagesProcessing}
                  onSelect={(files) => void handleImageSelect(files)}
                  onRemove={removeImage}
                  onClearAll={() => setImages([])}
                />
              )}

              {!manualMode ? (
                <p className="text-xs leading-6 text-slate-400">
                  Use one upload bucket for everything: fronts, backs, alternate
                  angles, or a single photo with multiple cards on a table.
                </p>
              ) : null}

              {/* Batch Settings */}
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  Batch Settings — applied to all contacts
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    Event Name
                  </span>
                  <input
                    type="text"
                    value={batchEvent}
                    onChange={(e) => setBatchEvent(e.target.value)}
                    placeholder="e.g. CSC Conference 2026"
                    className="w-full rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-lime-200/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    Date Met
                  </span>
                  <input
                    type="date"
                    value={batchDateMet}
                    onChange={(e) => setBatchDateMet(e.target.value)}
                    className="w-full rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 focus:border-lime-200/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    Shared Notes
                  </span>
                  <textarea
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Met at booth 42, interested in Type A insulation"
                    className="w-full resize-none rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-lime-200/40 focus:outline-none"
                  />
                </label>
              </div>

              {errorMessage ? (
                <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage}
                </div>
              ) : null}

              {phase === "upload" ? (
                <button
                  type="button"
                  disabled={
                    working ||
                    imagesProcessing ||
                    (manualMode ? !manualText.trim() : !images.length)
                  }
                  onClick={() => void extractContacts()}
                  className="w-full rounded-[24px] bg-lime-300 px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Extract Contacts
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetComposer}
                  disabled={working}
                  className="w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-lime-200/40 hover:text-lime-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  New Upload Set
                </button>
              )}
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                Activity Log
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1 text-xs leading-6 text-slate-300">
                {log.length ? (
                  log.map((line, index) => (
                    <div
                      key={`${line}-${index}`}
                      className={index === 0 ? "text-lime-100" : "text-slate-400"}
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">Waiting for the first upload…</div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            {dbView ? (
              <section className="rounded-[32px] border border-white/10 bg-slate-950/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                      Shared Contacts
                    </div>
                    <h2 className="mt-2 text-3xl text-white" style={headingStyle}>
                      {contacts.length} shared contact{contacts.length === 1 ? "" : "s"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      These come from the shared contacts database, so desktop and
                      phone load the same saved records.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void exportContacts()}
                      disabled={!contacts.length}
                      className="rounded-full bg-lime-300 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      Export XLSX
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearSavedContacts()}
                      disabled={!contacts.length}
                      className="rounded-full border border-rose-400/30 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear Shared
                    </button>
                  </div>
                </div>

                {contacts.length ? (
                  <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                        <thead className="bg-white/[0.06] text-[10px] uppercase tracking-[0.18em] text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Company</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Phones</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Tags</th>
                            <th className="px-4 py-3">Added</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8 bg-slate-950/30">
                          {contacts.map((entry) => (
                            <tr key={entry.id} className="align-top">
                              <td className="px-4 py-4 text-slate-100">
                                <div>{contactDisplayName(entry)}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {entry.title || "No title"}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                {entry.company || "—"}
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                {entry.email || "—"}
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                {formatPhoneSummary(entry) || "—"}
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                {entry.contact_type}
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                <div className="flex max-w-48 flex-wrap gap-2">
                                  {entry.tags.length ? (
                                    entry.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300"
                                      >
                                        {tag}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-slate-500">
                                {entry.added_at
                                  ? new Date(entry.added_at).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => downloadVCard(entry)}
                                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-100"
                                    title="Download .vcf to add to phone contacts"
                                  >
                                    📲
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteSavedContact(entry)}
                                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-400 transition hover:border-rose-400/30 hover:text-rose-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-16 text-center">
                    <div className="text-4xl">🗂️</div>
                    <div className="mt-4 text-2xl text-white" style={headingStyle}>
                      No shared contacts yet
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      Save a contact from any device and it will show up here everywhere.
                    </p>
                  </div>
                )}
              </section>
            ) : phase === "upload" && !draftContacts.length ? (
              <section className="flex min-h-[560px] items-center justify-center rounded-[32px] border border-white/10 bg-slate-950/55 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur">
                <div className="max-w-xl">
                  <div className="text-6xl">{manualMode ? "✏️" : "🗃️"}</div>
                  <h2 className="mt-5 text-4xl text-white" style={headingStyle}>
                    {manualMode ? "Paste one or more card details" : "Drop in a batch of card photos"}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
                    One upload bucket handles multiple photos at once, and saved
                    contacts sync through a shared database so your phone and desktop stay aligned.
                  </p>
                </div>
              </section>
            ) : selectedDraft ? (
              <section className="space-y-6">
                <div className="rounded-[32px] border border-white/10 bg-slate-950/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                        Contact Review
                      </div>
                      <h2 className="mt-2 text-3xl text-white" style={headingStyle}>
                        {contactDisplayName(selectedDraft)}
                      </h2>
                      <p className="mt-2 text-sm text-slate-400">
                        Review each detected card, save the clean contact record to the
                        shared database, and optionally generate a follow-up pack.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void saveCurrentContact()}
                        disabled={working}
                        className="rounded-full border border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-lime-200/40 hover:text-lime-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadVCard(stripDraftMetadata(selectedDraft))}
                        disabled={working}
                        className="rounded-full border border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-200/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Downloads a .vcf file — tap to add to iPhone Contacts"
                      >
                        📲 Save to Phone
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateFollowUps()}
                        disabled={working}
                        className="rounded-full bg-lime-300 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        Generate Follow-Up
                      </button>
                    </div>
                  </div>

                  {draftContacts.length > 1 ? (
                    <div className="mt-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                          Detected Contacts
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => void saveAllDraftContacts()}
                            className="rounded-full border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-lime-200/30 hover:text-lime-100"
                          >
                            Save All
                          </button>
                          <button
                            type="button"
                            onClick={() => void exportDraftsToXlsx()}
                            className="rounded-full border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-lime-200/30 hover:text-lime-100"
                          >
                            Export Batch
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {draftContacts.map((draftContact, index) => {
                          const isActive = draftContact.draft_id === selectedDraftId;
                          const hasOutput = Boolean(
                            followUpsByDraftId[draftContact.draft_id]
                          );
                          const saved = isDraftSaved(draftContact);

                          return (
                            <button
                              key={draftContact.draft_id}
                              type="button"
                              onClick={() => setSelectedDraftById(draftContact.draft_id)}
                              className={`rounded-[20px] border px-4 py-3 text-left transition ${
                                isActive
                                  ? "border-lime-200/40 bg-lime-300/10 text-lime-100"
                                  : "border-white/10 bg-white/[0.03] text-slate-200 hover:border-lime-200/30 hover:text-lime-100"
                              }`}
                            >
                              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                Contact {index + 1}
                              </div>
                              <div className="mt-1 text-sm">
                                {contactDisplayName(draftContact)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {draftContact.company || "Unknown company"}
                              </div>
                              <div className="mt-2 flex gap-2 text-[10px] uppercase tracking-[0.14em]">
                                {saved ? (
                                  <span className="rounded-full border border-lime-200/30 px-2 py-1 text-lime-100">
                                    Saved
                                  </span>
                                ) : null}
                                {hasOutput ? (
                                  <span className="rounded-full border border-cyan-200/30 px-2 py-1 text-cyan-100">
                                    Follow-Up Ready
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Field
                      label="First Name"
                      value={selectedDraft.first_name}
                      onChange={(value) => updateSelectedDraft("first_name", value)}
                    />
                    <Field
                      label="Last Name"
                      value={selectedDraft.last_name}
                      onChange={(value) => updateSelectedDraft("last_name", value)}
                    />
                    <Field
                      label="Title"
                      value={selectedDraft.title}
                      onChange={(value) => updateSelectedDraft("title", value)}
                    />
                    <Field
                      label="Company"
                      value={selectedDraft.company}
                      onChange={(value) => updateSelectedDraft("company", value)}
                    />
                    <Field
                      label="Email"
                      value={selectedDraft.email}
                      onChange={(value) => updateSelectedDraft("email", value)}
                    />
                    <Field
                      label="Website"
                      value={selectedDraft.website}
                      onChange={(value) => updateSelectedDraft("website", value)}
                    />
                    <Field
                      label="LinkedIn"
                      value={selectedDraft.linkedin}
                      onChange={(value) => updateSelectedDraft("linkedin", value)}
                    />
                    <Field
                      label="Contact Type"
                      value={selectedDraft.contact_type}
                      onChange={(value) =>
                        updateSelectedDraft(
                          "contact_type",
                          value as DraftContact["contact_type"]
                        )
                      }
                    />
                    <Field
                      label="Date Met"
                      value={selectedDraft.date_met}
                      onChange={(value) => updateSelectedDraft("date_met", value)}
                    />
                    <Field
                      label="Event"
                      value={selectedDraft.event}
                      onChange={(value) => updateSelectedDraft("event", value)}
                    />
                    <Field
                      label="Main / Unlabeled"
                      value={selectedDraft.phone}
                      onChange={(value) => updateSelectedDraft("phone", value)}
                    />
                    <Field
                      label="Cell / Mobile"
                      value={selectedDraft.cell_phone}
                      onChange={(value) => updateSelectedDraft("cell_phone", value)}
                    />
                    <Field
                      label="Office / Tel"
                      value={selectedDraft.office_phone}
                      onChange={(value) =>
                        updateSelectedDraft("office_phone", value)
                      }
                    />
                    <Field
                      label="Fax"
                      value={selectedDraft.fax_phone}
                      onChange={(value) => updateSelectedDraft("fax_phone", value)}
                    />
                    <Field
                      label="Other / Direct"
                      value={selectedDraft.other_phone}
                      onChange={(value) => updateSelectedDraft("other_phone", value)}
                    />
                  </div>

                  <div className="mt-4 grid gap-4">
                    <Field
                      label="Address"
                      value={selectedDraft.address}
                      onChange={(value) => updateSelectedDraft("address", value)}
                    />
                    <Field
                      label="Notes"
                      value={selectedDraft.notes}
                      onChange={(value) => updateSelectedDraft("notes", value)}
                      textarea
                    />
                  </div>

                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      Phone Summary
                    </div>
                    <div className="mt-2 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                      {formatPhoneSummary(selectedDraft) || "No phone numbers captured yet."}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      Tags
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TAG_OPTIONS.map((tag) => {
                        const active = selectedDraft.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              updateSelectedDraft(
                                "tags",
                                active
                                  ? selectedDraft.tags.filter(
                                      (entry) => entry !== tag
                                    )
                                  : [...selectedDraft.tags, tag]
                              )
                            }
                            className={`rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition ${
                              active
                                ? "border-lime-200/40 bg-lime-300/15 text-lime-100"
                                : "border-white/10 text-slate-300 hover:border-lime-200/30 hover:text-lime-100"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {selectedOutput ? (
                  <div className="rounded-[32px] border border-white/10 bg-slate-950/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                          Follow-Up Pack
                        </div>
                        <h3 className="mt-2 text-3xl text-white" style={headingStyle}>
                          Ready to send
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => void exportContacts()}
                        disabled={!contacts.length}
                        className="rounded-full bg-lime-300 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        Export Contacts
                      </button>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {OUTPUT_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition ${
                            activeTab === tab.id
                              ? "border-lime-200/40 bg-lime-300/15 text-lime-100"
                              : "border-white/10 text-slate-300 hover:border-lime-200/30 hover:text-lime-100"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                      {activeTab === "email" ? (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                Subject
                              </div>
                              <div className="mt-2 text-lg text-white">
                                {selectedOutput.email_subject}
                              </div>
                            </div>
                            <CopyButton
                              text={`Subject: ${selectedOutput.email_subject}\n\n${selectedOutput.email_body}`}
                            />
                          </div>
                          <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            {selectedOutput.email_body}
                          </pre>
                        </div>
                      ) : null}

                      {activeTab === "linkedin" ? (
                        <div>
                          <div className="flex justify-end">
                            <CopyButton text={selectedOutput.linkedin_msg} />
                          </div>
                          <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            {selectedOutput.linkedin_msg}
                          </pre>
                        </div>
                      ) : null}

                      {activeTab === "crm" ? (
                        <div>
                          <div className="flex justify-end">
                            <CopyButton text={selectedOutput.crm_note} />
                          </div>
                          <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            {selectedOutput.crm_note}
                          </pre>
                        </div>
                      ) : null}

                      {activeTab === "task" ? (
                        <div>
                          <div className="flex justify-end">
                            <CopyButton text={selectedOutput.task} />
                          </div>
                          <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            {selectedOutput.task}
                          </pre>
                        </div>
                      ) : null}

                      {activeTab === "json" ? (
                        <div>
                          <div className="flex justify-end">
                            <CopyButton
                              text={JSON.stringify(stripDraftMetadata(selectedDraft), null, 2)}
                            />
                          </div>
                          <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-[20px] bg-slate-950/50 p-4 text-xs leading-6 text-lime-100">
                            {JSON.stringify(stripDraftMetadata(selectedDraft), null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
