import { buildContactsWorkbookBuffer, contactsExportFilename } from "@/lib/contact-export";
import { contactDisplayName, formatPhoneSummary } from "@/lib/card-flow";
import { listContacts, type StoredContactRecord } from "@/lib/contacts-db";

type SendEmailBinding = {
  send: (message: {
    to: string | string[];
    from: string | { email: string; name: string };
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string | { email: string; name: string };
    attachments?: Array<{
      content: string | ArrayBuffer;
      filename: string;
      type: string;
      disposition: "attachment" | "inline";
      contentId?: string;
    }>;
  }) => Promise<{ messageId: string }>;
};

type NotificationResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

type WorkerEnv = {
  EMAIL?: SendEmailBinding;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_NOTIFICATION_TO?: string;
  EMAIL_REPLY_TO?: string;
};

function getWorkerEnv(): WorkerEnv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const ctx = getCloudflareContext() as { env?: WorkerEnv };
    return ctx?.env ?? null;
  } catch {
    return null;
  }
}

function getConfig() {
  const env = getWorkerEnv();
  return {
    binding: env?.EMAIL,
    from: env?.EMAIL_FROM || process.env.EMAIL_FROM || "",
    fromName: env?.EMAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || "Card Flow",
    to:
      env?.EMAIL_NOTIFICATION_TO ||
      process.env.EMAIL_NOTIFICATION_TO ||
      "josh.dwamena@rockwool.com",
    replyTo:
      env?.EMAIL_REPLY_TO || process.env.EMAIL_REPLY_TO || "joshdwamena@gmail.com",
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contactSummaryText(contact: StoredContactRecord) {
  const lines = [
    `${contactDisplayName(contact)}${contact.company ? ` @ ${contact.company}` : ""}`,
    contact.title ? `Title: ${contact.title}` : "",
    contact.email ? `Email: ${contact.email}` : "",
    formatPhoneSummary(contact) ? `Phones: ${formatPhoneSummary(contact)}` : "",
    contact.contact_type ? `Type: ${contact.contact_type}` : "",
    contact.tags.length ? `Tags: ${contact.tags.join(", ")}` : "",
    contact.notes ? `Notes: ${contact.notes}` : "",
    contact.follow_up_email_subject
      ? `Follow-up subject: ${contact.follow_up_email_subject}`
      : "",
    contact.follow_up_email_body
      ? `Follow-up email:\n${contact.follow_up_email_body}`
      : "",
    contact.follow_up_linkedin_msg
      ? `LinkedIn message:\n${contact.follow_up_linkedin_msg}`
      : "",
    contact.follow_up_crm_note ? `CRM note: ${contact.follow_up_crm_note}` : "",
    contact.follow_up_task ? `Task: ${contact.follow_up_task}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function contactSummaryHtml(contact: StoredContactRecord) {
  const details = [
    contact.title ? `<div><strong>Title:</strong> ${escapeHtml(contact.title)}</div>` : "",
    contact.email ? `<div><strong>Email:</strong> ${escapeHtml(contact.email)}</div>` : "",
    formatPhoneSummary(contact)
      ? `<div><strong>Phones:</strong> ${escapeHtml(formatPhoneSummary(contact))}</div>`
      : "",
    contact.contact_type
      ? `<div><strong>Type:</strong> ${escapeHtml(contact.contact_type)}</div>`
      : "",
    contact.tags.length
      ? `<div><strong>Tags:</strong> ${escapeHtml(contact.tags.join(", "))}</div>`
      : "",
    contact.notes ? `<div><strong>Notes:</strong> ${escapeHtml(contact.notes)}</div>` : "",
    contact.follow_up_email_subject
      ? `<div><strong>Follow-up subject:</strong> ${escapeHtml(contact.follow_up_email_subject)}</div>`
      : "",
    contact.follow_up_email_body
      ? `<div><strong>Follow-up email:</strong><pre style="white-space:pre-wrap;font-family:inherit;margin:6px 0 0">${escapeHtml(contact.follow_up_email_body)}</pre></div>`
      : "",
    contact.follow_up_linkedin_msg
      ? `<div><strong>LinkedIn message:</strong><pre style="white-space:pre-wrap;font-family:inherit;margin:6px 0 0">${escapeHtml(contact.follow_up_linkedin_msg)}</pre></div>`
      : "",
    contact.follow_up_crm_note
      ? `<div><strong>CRM note:</strong> ${escapeHtml(contact.follow_up_crm_note)}</div>`
      : "",
    contact.follow_up_task
      ? `<div><strong>Task:</strong> ${escapeHtml(contact.follow_up_task)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<li style="margin:0 0 16px">
    <div style="font-weight:700">${escapeHtml(contactDisplayName(contact))}${
      contact.company ? ` <span style="font-weight:400">@ ${escapeHtml(contact.company)}</span>` : ""
    }</div>
    ${details}
  </li>`;
}

export async function notifyNewContactsAdded(
  newContacts: StoredContactRecord[]
): Promise<NotificationResult> {
  if (!newContacts.length) {
    return { sent: false, reason: "No new contacts to notify." };
  }

  const { binding, from, fromName, to, replyTo } = getConfig();

  if (!binding) {
    return { sent: false, reason: "Cloudflare EMAIL binding is not configured." };
  }

  if (!from) {
    return {
      sent: false,
      reason: "EMAIL_FROM is not configured. Cloudflare Email Service needs a verified sender address.",
    };
  }

  const allContacts = await listContacts();
  const workbook = await buildContactsWorkbookBuffer(allContacts);
  const filename = contactsExportFilename();

  const subject = `Card Flow: ${newContacts.length} new contact${
    newContacts.length === 1 ? "" : "s"
  } added`;

  const text = [
    `${newContacts.length} new contact${newContacts.length === 1 ? "" : "s"} were added to Card Flow.`,
    "",
    ...newContacts.flatMap((contact, index) => [
      `${index + 1}. ${contactSummaryText(contact)}`,
      "",
    ]),
    `Attached: ${filename}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px">Card Flow new contact notification</h2>
      <p style="margin:0 0 16px">
        ${newContacts.length} new contact${newContacts.length === 1 ? "" : "s"} ${
          newContacts.length === 1 ? "was" : "were"
        } added to the shared database.
      </p>
      <ol style="padding-left:18px;margin:0 0 20px">
        ${newContacts.map(contactSummaryHtml).join("")}
      </ol>
      <p style="margin:0">Attached: <strong>${escapeHtml(filename)}</strong></p>
    </div>
  `;

  const response = await binding.send({
    to,
    from: { email: from, name: fromName },
    replyTo,
    subject,
    text,
    html,
    attachments: [
      {
        content: workbook.toString("base64"),
        filename,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: "attachment",
      },
    ],
  });

  return { sent: true, messageId: response.messageId };
}
