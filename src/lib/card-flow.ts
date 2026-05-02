import { z } from "zod";

export const CARD_FLOW_STORAGE_KEY = "card-flow-contacts";

export const TAG_OPTIONS = [
  "AEC",
  "Architect",
  "GC",
  "Developer",
  "Consultant",
  "Distributor",
  "ROCKWOOL Lead",
  "BCWCA",
  "CSC",
  "Follow Up Required",
] as const;

export const CONTACT_TYPE_OPTIONS = [
  "Architect",
  "GC",
  "Consultant",
  "Developer",
  "Distributor",
  "Owner",
  "PM",
  "Engineer",
  "Other",
] as const;

export const DB_COLS = [
  "id",
  "first_name",
  "last_name",
  "title",
  "company",
  "email",
  "phone",
  "cell_phone",
  "office_phone",
  "fax_phone",
  "other_phone",
  "website",
  "linkedin",
  "address",
  "contact_type",
  "tags",
  "source",
  "date_met",
  "event",
  "notes",
  "follow_up_email_subject",
  "follow_up_email_body",
  "follow_up_linkedin_msg",
  "follow_up_crm_note",
  "follow_up_task",
  "follow_up_status",
  "added_at",
] as const;

const tagEnum = z.enum(TAG_OPTIONS);
const contactTypeEnum = z.enum(CONTACT_TYPE_OPTIONS);

export const contactExtractionSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  title: z.string(),
  company: z.string(),
  email: z.string(),
  phone: z.string(),
  cell_phone: z.string(),
  office_phone: z.string(),
  fax_phone: z.string(),
  other_phone: z.string(),
  website: z.string(),
  linkedin: z.string(),
  address: z.string(),
  contact_type: contactTypeEnum,
  tags: z.array(tagEnum),
  notes: z.string(),
});

export const contactExtractionBatchSchema = z.object({
  contacts: z.array(contactExtractionSchema).min(1),
});

export const cardFlowContactRecordSchema = contactExtractionSchema
  .extend({
    id: z.string().optional(),
    source: z.string().default("Business Card"),
    date_met: z.string().default(""),
    event: z.string().default(""),
    follow_up_email_subject: z.string().default(""),
    follow_up_email_body: z.string().default(""),
    follow_up_linkedin_msg: z.string().default(""),
    follow_up_crm_note: z.string().default(""),
    follow_up_task: z.string().default(""),
    follow_up_status: z.string().default("Needed"),
    added_at: z.string().optional(),
  })
  .passthrough();

export const followUpSchema = z.object({
  email_subject: z.string(),
  email_body: z.string(),
  linkedin_msg: z.string(),
  crm_note: z.string(),
  task: z.string(),
});

export const extractRequestSchema = z
  .object({
    manualText: z.string().trim().min(1).optional(),
    images: z.array(z.string().startsWith("data:image/")).min(1).optional(),
  })
  .refine((value) => Boolean(value.manualText || value.images?.length), {
    message: "Provide pasted card text or at least a front image.",
    path: ["manualText"],
  });

export const generateRequestSchema = z.object({
  contact: cardFlowContactRecordSchema,
});

export const exportRequestSchema = z.object({
  contacts: z.array(cardFlowContactRecordSchema).min(1),
});

export type CardFlowContact = z.infer<typeof cardFlowContactRecordSchema>;
export type ContactExtraction = z.infer<typeof contactExtractionSchema>;
export type ContactExtractionBatch = z.infer<typeof contactExtractionBatchSchema>;
export type FollowUpOutput = z.infer<typeof followUpSchema>;
export type CardFlowTag = (typeof TAG_OPTIONS)[number];

export function buildExtractionSystemPrompt() {
  return [
    "You extract structured contact data from business cards.",
    "You may receive one or more images.",
    "Some images may show the front and back of the same card.",
    "Some images may contain multiple distinct cards in a single photo.",
    "Merge images that obviously belong to the same person or card.",
    "Create a separate contact entry for each distinct business card you can identify.",
    "Return only fields supported by the schema.",
    "Use empty strings when a value is not visible or not present.",
    "Never invent a phone number, email, address, website, or title.",
    "Map phone numbers by label when present:",
    "put unlabeled or general numbers in phone,",
    "mobile or cell numbers in cell_phone,",
    "office, tel, telephone, or main desk numbers in office_phone,",
    "fax numbers in fax_phone,",
    "and clearly labeled alternates such as direct or other in other_phone.",
    "Use indicators like C, M, Cell, Mobile, O, Office, T, Tel, P, Phone, Dir, Direct, and F, Fax to classify the numbers.",
    `For contact_type choose exactly one of: ${CONTACT_TYPE_OPTIONS.join(", ")}.`,
    `For tags only choose from: ${TAG_OPTIONS.join(", ")}.`,
    "Infer contact_type from the title, company, and context when possible.",
    "Add a short note only when something visible on the card is genuinely useful for follow-up.",
  ].join(" ");
}

export function buildGenerationSystemPrompt() {
  return [
    "You are a concise, practical follow-up assistant for Josh,",
    "an Architectural Specifications Manager in Western Canada.",
    "Write warm, professional follow-up content that sounds human.",
    "Keep email and LinkedIn copy brief and specific.",
    "Do not use hype, emojis, or canned sales language.",
  ].join(" ");
}

export function buildGenerationUserPrompt(
  contact: CardFlowContact,
  followUpDate: string
) {
  return [
    "Generate follow-up content for this business card contact.",
    `Assume the next follow-up task is due on ${followUpDate}.`,
    "Output structured content using the provided schema.",
    "",
    JSON.stringify(contact, null, 2),
  ].join("\n");
}

export function normalizeTags(tags: readonly string[]) {
  const valid = new Set(TAG_OPTIONS);
  return Array.from(new Set(tags)).filter((tag): tag is CardFlowTag =>
    valid.has(tag as CardFlowTag)
  );
}

export function contactDisplayName(contact: Pick<CardFlowContact, "first_name" | "last_name">) {
  return `${contact.first_name} ${contact.last_name}`.trim() || "Unknown Contact";
}

export function formatPhoneSummary(
  contact: Pick<
    CardFlowContact,
    "phone" | "cell_phone" | "office_phone" | "fax_phone" | "other_phone"
  >
) {
  const values = [
    contact.phone.trim()
      ? {
          label:
            contact.cell_phone.trim() ||
            contact.office_phone.trim() ||
            contact.fax_phone.trim() ||
            contact.other_phone.trim()
              ? "Main"
              : "",
          value: contact.phone.trim(),
        }
      : null,
    contact.cell_phone.trim()
      ? { label: "Cell", value: contact.cell_phone.trim() }
      : null,
    contact.office_phone.trim()
      ? { label: "Office", value: contact.office_phone.trim() }
      : null,
    contact.fax_phone.trim()
      ? { label: "Fax", value: contact.fax_phone.trim() }
      : null,
    contact.other_phone.trim()
      ? { label: "Other", value: contact.other_phone.trim() }
      : null,
  ].filter(
    (
      entry
    ): entry is {
      label: string;
      value: string;
    } => Boolean(entry)
  );

  return values
    .map((entry) => (entry.label ? `${entry.label}: ${entry.value}` : entry.value))
    .join(" | ");
}
