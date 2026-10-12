import nodemailer, { type Transporter } from "nodemailer";

// ---------------------------------------------------------------------------
// SMTP mail (Proton). Enabled only when SMTP_USER + SMTP_PASS are set —
// without them every helper degrades to a no-op and /api/mail/status reports
// `enabled: false`, so local dev and CI never attempt a real connection.
//
//   SMTP_FROM   override sender address; defaults to SMTP_USER
//   MAIL_FROM_NAME display name, default "OnchainSUB"
//   MAIL_TEST_TOKEN  shared secret required by POST /api/mail/test
//   BUSINESS_NAME    legal sender name for the compliance footer
//     (docs/LEGAL-COMPLIANCE.md §4); defaults to MAIL_FROM_NAME.
//     Empty/missing keeps the legacy footer — sending never breaks.
//   BUSINESS_ADDRESS correspondence address for the footer (owner-filled).
//     Empty/missing = line omitted, sending never breaks.
//   SUPPORT_EMAIL    support contact for the footer; fallback SMTP_FROM,
//     then SMTP_USER. Empty/missing = line omitted, sending never breaks.
// ---------------------------------------------------------------------------

const DEFAULT_HOST = "smtp.protonmail.ch";
const DEFAULT_PORT = 587;
const DEFAULT_FROM_NAME = "OnchainSUB";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

function mailConfig(): MailConfig | null {
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  if (user === "" || pass === "") return null;
  return {
    host: process.env.SMTP_HOST || DEFAULT_HOST,
    port: Number(process.env.SMTP_PORT || DEFAULT_PORT),
    user,
    pass,
    from: process.env.SMTP_FROM || user,
    fromName: process.env.MAIL_FROM_NAME || DEFAULT_FROM_NAME,
  };
}

/** Non-secret view of the mail config for the status endpoint. */
export function mailStatus(): {
  enabled: boolean;
  host: string | null;
  port: number | null;
  from: string | null;
} {
  const cfg = mailConfig();
  if (cfg === null) return { enabled: false, host: null, port: null, from: null };
  return { enabled: true, host: cfg.host, port: cfg.port, from: cfg.from };
}

export function testTokenRequired(): boolean {
  return (process.env.MAIL_TEST_TOKEN ?? "") !== "";
}

let transporter: Transporter | null = null;

function getTransporter(cfg: MailConfig): Transporter {
  if (transporter === null) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: false, // 587 STARTTLS — nodemailer upgrades via requireTLS
      requireTLS: true,
      auth: { user: cfg.user, pass: cfg.pass },
      // Bounded SMTP stall: all three well under the Bun idleTimeout (60s,
      // index.ts) — a hung SMTP server must never pin the receipt flow.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(mail: OutgoingMail): Promise<{ sent: boolean; error?: string }> {
  const cfg = mailConfig();
  if (cfg === null) return { sent: false, error: "SMTP not configured (SMTP_USER/SMTP_PASS missing)." };
  try {
    const info = await getTransporter(cfg).sendMail({
      from: `"${cfg.fromName}" <${cfg.from}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    console.log(`[mail] delivered to ${mail.to}: ${info.messageId}`);
    return { sent: true };
  } catch (e) {
    // Opaque client-facing error: SMTP detail (host, auth, response codes)
    // stays in the server log only — sendMail's result is returned to HTTP
    // callers by POST /api/mail/test.
    console.error(`[mail] delivery to ${mail.to} failed:`, e);
    return { sent: false, error: "delivery failed" };
  }
}

// --- Branded receipt ---------------------------------------------------------

/** Escape every client-influenced string before it enters receipt HTML —
 *  invoice/metadata content is merchant input and must never carry markup. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Collapse CR/LF — the subject is a mail header, never allow raw newlines. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

// --- Compliance footer (docs/LEGAL-COMPLIANCE.md §4) ---------------------------
// Every transactional mail carries: business name + correspondence address +
// "Transactional message about your payment — no marketing." + support contact.
// All three envs are optional: missing/empty falls back to the legacy footer
// lines, never throws, never blocks sending.
const TRANSACTIONAL_LINE = "Transactional message about your payment \u2014 no marketing.";

/** Resolve the compliance footer identity from env with safe fallbacks —
 *  BUSINESS_NAME defaults to MAIL_FROM_NAME/OnchainSUB, SUPPORT_EMAIL
 *  falls back to SMTP_FROM then SMTP_USER; address/support lines stay empty
 *  when unconfigured so sending never breaks. */
function footerIdentity(): { name: string; address: string; support: string } {
  const rawName = (process.env.BUSINESS_NAME ?? "").trim();
  const name = rawName !== "" ? rawName : (process.env.MAIL_FROM_NAME ?? "").trim() || DEFAULT_FROM_NAME;
  const address = (process.env.BUSINESS_ADDRESS ?? "").trim();
  const directSupport = (process.env.SUPPORT_EMAIL ?? "").trim();
  const fallbackSupport = (process.env.SMTP_FROM ?? "").trim() || (process.env.SMTP_USER ?? "").trim();
  return { name, address, support: directSupport !== "" ? directSupport : fallbackSupport };
}

/** Plain-text footer lines for transactional mails (appended after body). */
function footerTextLines(): string[] {
  const identity = footerIdentity();
  const lines = ["--", identity.name];
  if (identity.address !== "") lines.push(identity.address);
  lines.push(TRANSACTIONAL_LINE);
  if (identity.support !== "") lines.push(`Support: ${identity.support}`);
  return lines;
}

/** HTML footer for transactional mails — every value escaped, mailto only for valid emails. */
function footerHtml(): string {
  const identity = footerIdentity();
  const name = escapeHtml(identity.name);
  const addressHtml = identity.address === "" ? "" : `<br>${escapeHtml(identity.address)}`;
  let supportHtml = "";
  if (identity.support !== "") {
    supportHtml = isEmail(identity.support)
      ? `<br>Support: <a href="mailto:${escapeHtml(identity.support)}" style="color:#7df4ff">${escapeHtml(identity.support)}</a>`
      : `<br>Support: ${escapeHtml(identity.support)}`;
  }
  return `<div style="margin:20px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#8e93a6;line-height:1.6">${name}${addressHtml}<br>${escapeHtml(TRANSACTIONAL_LINE)}${supportHtml}</div>`;
}

function receiptHtml(input: {
  invoice: string;
  amountUi: string;
  planLine: string;
  signature: string;
  explorerUrl: string;
  cluster: string;
}): string {
  return `<!doctype html><html><body style="margin:0;background:#11131d;font-family:Inter,Arial,sans-serif;color:#e1e1f0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#191b25;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px">
    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#cec2d8">OnchainSUB · charge receipt</p>
    <h1 style="margin:8px 0 16px;font-size:22px;color:#ffffff">Payment received ✓</h1>
    <p style="margin:0 0 20px;font-size:26px;font-weight:700;color:#14f195;font-family:monospace">${escapeHtml(input.amountUi)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#8e93a6">Invoice</td><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);font-family:monospace;color:#e1e1f0">${escapeHtml(input.invoice)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#8e93a6">Plan</td><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#e1e1f0">${escapeHtml(input.planLine)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#8e93a6">Network</td><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#e1e1f0">${escapeHtml(input.cluster)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);color:#8e93a6">Signature</td><td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);font-family:monospace;word-break:break-all"><a href="${escapeHtml(input.explorerUrl)}" style="color:#7df4ff">${escapeHtml(input.signature)}</a></td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#8e93a6;line-height:1.6">Zero custody: this charge moved exactly one billing period via an SPL token delegate you approved. Funds never left a vault — they went straight from your wallet, capped at the allowance you signed.</p>
    ${footerHtml()}
  </div>
</body></html>`;
}

export interface ChargeReceipt {
  to: string;
  invoice: string;
  /** Human amount, e.g. "15.00 USDC" (already decimals-aware). */
  amountUi: string;
  /** Optional "plan #id · merchant ab…cd" line. */
  planLine: string;
  signature: string;
  explorerUrl: string;
  cluster: string;
}

export async function sendChargeReceipt(input: ChargeReceipt): Promise<{ sent: boolean; error?: string }> {
  return sendMail({
    to: input.to,
    subject: oneLine(`OnchainSUB receipt — ${input.amountUi} (${input.invoice})`),
    text: [
      `Payment received: ${input.amountUi}`,
      `Invoice: ${input.invoice}`,
      `Plan: ${input.planLine}`,
      `Network: ${input.cluster}`,
      `Signature: ${input.signature}`,
      `Explorer: ${input.explorerUrl}`,
      "",
      "Zero custody: this charge moved exactly one billing period via an SPL token delegate you approved.",
      "",
      ...footerTextLines(),
    ].join("\n"),
    html: receiptHtml({
      invoice: input.invoice,
      amountUi: input.amountUi,
      planLine: input.planLine,
      signature: input.signature,
      explorerUrl: input.explorerUrl,
      cluster: input.cluster,
    }),
  });
}
