import crypto from "node:crypto";

const TIMESTAMP_TOLERANCE_SEC = 5 * 60;

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyResendWebhook(rawBody, headers, secret) {
  if (!secret) return true;

  const id = headers.id;
  const timestamp = headers.timestamp;
  const signatureHeader = headers.signature;
  if (!id || !timestamp || !signatureHeader) {
    throw new Error("Missing webhook signature headers.");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_SEC) {
    throw new Error("Webhook timestamp is stale.");
  }

  const secretPart = String(secret).includes("_")
    ? String(secret).split("_").slice(1).join("_")
    : String(secret);
  const secretBytes = Buffer.from(secretPart, "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const signatures = String(signatureHeader)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(",") ? part.split(",").slice(1).join(",") : part));

  if (!signatures.some((sig) => timingSafeEqualString(sig, expected))) {
    throw new Error("Invalid webhook signature.");
  }
  return true;
}

export function extractEmailAddress(value) {
  if (!value) return "";
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim().toLowerCase();
}

export function extractDisplayName(value) {
  if (!value) return "";
  const match = String(value).match(/^\s*"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : "";
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function isSupportRecipient(addresses) {
  return addresses.some((addr) => extractEmailAddress(addr) === "support@shopguardapp.com");
}
