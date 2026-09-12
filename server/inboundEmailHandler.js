import { envGet, getHeader, readRawBody, sendJson } from "./http.js";
import { createSupabaseAdmin } from "./supabaseAdmin.js";
import {
  extractDisplayName,
  extractEmailAddress,
  htmlToText,
  isSupportRecipient,
  verifyResendWebhook,
} from "./inboundVerify.js";

const SUPPORT_ADDRESS = "support@shopguardapp.com";

function collectAddresses(...lists) {
  return lists.flatMap((list) => {
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
  }).filter(Boolean);
}

export async function handleInboundEmailRequest(req, res, env = process.env) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    sendJson(res, 400, { message: "Could not read webhook body." });
    return;
  }

  try {
    verifyResendWebhook(rawBody, {
      id: getHeader(req, "svix-id") || getHeader(req, "webhook-id"),
      timestamp: getHeader(req, "svix-timestamp") || getHeader(req, "webhook-timestamp"),
      signature: getHeader(req, "svix-signature") || getHeader(req, "webhook-signature"),
    }, envGet(env, "RESEND_WEBHOOK_SECRET"));
  } catch (err) {
    sendJson(res, 400, { message: err.message || "Invalid webhook signature." });
    return;
  }

  let event;
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body" });
    return;
  }

  if (event.type && event.type !== "email.received") {
    sendJson(res, 200, { ignored: true, reason: "not_received_event" });
    return;
  }

  const data = event.data || event;
  const recipients = collectAddresses(data.to, data.received_for, data.cc);
  if (recipients.length && !isSupportRecipient(recipients)) {
    sendJson(res, 200, { ignored: true, reason: "not_support_inbox" });
    return;
  }

  const apiKey = envGet(env, "RESEND_API_KEY");
  const emailId = data.email_id || data.id;
  let email = data;

  if (apiKey && emailId) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const fetched = await response.json().catch(() => ({}));
    if (response.ok) {
      email = fetched;
    }
  }

  const fetchedRecipients = collectAddresses(email.to, email.received_for, email.cc, data.to, data.received_for);
  if (fetchedRecipients.length && !isSupportRecipient(fetchedRecipients)) {
    sendJson(res, 200, { ignored: true, reason: "not_support_inbox" });
    return;
  }

  const fromRaw = email.from || data.from || "";
  const senderEmail = extractEmailAddress(fromRaw) || fromRaw;
  const senderName = extractDisplayName(fromRaw) || extractDisplayName(email.headers?.from) || "";
  const subject = email.subject || data.subject || "";
  const bodyText = (email.text && String(email.text).trim())
    || htmlToText(email.html || email.body || data.text || data.html || "");
  const toEmail = collectAddresses(email.to, email.received_for, data.to, data.received_for)
    .map(extractEmailAddress)
    .find(Boolean) || SUPPORT_ADDRESS;
  const receivedAt = email.created_at || data.created_at || new Date().toISOString();

  if (!senderEmail) {
    sendJson(res, 200, { ignored: true, reason: "missing_sender" });
    return;
  }

  try {
    const supabase = createSupabaseAdmin(env);
    const { error } = emailId
      ? await supabase.from("support_tickets").upsert({
          resend_email_id: emailId,
          sender_email: senderEmail,
          sender_name: senderName || null,
          subject,
          body_text: bodyText,
          body_html: email.html || null,
          to_email: toEmail,
          received_at: receivedAt,
        }, { onConflict: "resend_email_id", ignoreDuplicates: true })
      : await supabase.from("support_tickets").insert({
          sender_email: senderEmail,
          sender_name: senderName || null,
          subject,
          body_text: bodyText,
          body_html: email.html || null,
          to_email: toEmail,
          received_at: receivedAt,
        });

    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, err.statusCode || 500, {
      message: err.message || "Failed to save support ticket.",
    });
  }
}
