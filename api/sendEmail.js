export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiKey = process.env.VITE_RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Resend API key is not configured." });
  }

  const { to, subject, html, attachments, from } = req.body || {};

  if (!to?.trim()) {
    return res.status(400).json({ message: "Recipient email is required." });
  }
  if (!subject?.trim()) {
    return res.status(400).json({ message: "Email subject is required." });
  }
  if (!html?.trim()) {
    return res.status(400).json({ message: "Email content is required." });
  }

  const fromEmail =
    from?.trim() ||
    process.env.VITE_RESEND_FROM_EMAIL ||
    "ShopGuard <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to.trim()],
        subject,
        html,
        attachments,
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        message: body.message || `Failed to send email (${response.status})`,
      });
    }

    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to send email",
    });
  }
}
