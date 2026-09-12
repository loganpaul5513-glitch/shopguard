const FROM_EMAIL = "ShopGuard Alerts <alerts@shopguardapp.com>";
const APP_URL = "https://shopguardapp.com";
const SUPPORT_EMAIL = "support@shopguardapp.com";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildWelcomeEmailHtml({ companyName, companyCode, supervisorName }) {
  const safeCompany = escapeHtml(companyName);
  const safeCode = escapeHtml(companyCode);
  const greetingName = supervisorName?.trim();
  const greeting = greetingName
    ? `Welcome aboard, ${escapeHtml(greetingName)}.`
    : "Welcome aboard.";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ShopGuard</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0d13; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #e5e7eb;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0b0d13; width: 100%; margin: 0; padding: 24px 8px;">
    <tr>
      <td align="center" style="vertical-align: top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; width: 100%; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="height: 4px; background-color: #ff6b00; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding: 24px 28px 20px; background-color: #12151d; border-bottom: 1px solid #262b38;">
              <div style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; line-height: 1;">
                SHOP<span style="color: #ff6b00;">GUARD</span>
              </div>
              <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">
                SAFETY MANAGEMENT PLATFORM
              </div>
              <h1 style="margin: 18px 0 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                Welcome to ShopGuard
              </h1>
              <div style="font-size: 13px; color: #9ca3af; margin-top: 6px; line-height: 1.5;">
                ${greeting} Congratulations on joining ShopGuard — your shop is set up and ready.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 28px; background-color: #181c26; border-bottom: 1px solid #262b38;">
              <div style="font-size: 10px; font-weight: 800; color: #ff6b00; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px;">
                COMPANY NAME
              </div>
              <div style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                ${safeCompany}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px;">
              <div style="font-size: 11px; font-weight: 800; color: #ff6b00; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; text-align: center;">
                Your unique company code
              </div>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #12151d; border: 2px solid #ff6b00; border-radius: 6px;">
                <tr>
                  <td style="padding: 28px 16px; text-align: center;">
                    <div style="font-size: 10px; letter-spacing: 3px; color: #888e9b; text-transform: uppercase; margin-bottom: 10px; font-weight: 700;">
                      Share this with your employees
                    </div>
                    <div style="font-size: 36px; font-weight: 800; letter-spacing: 4px; color: #ff6b00; line-height: 1.2;">
                      ${safeCode}
                    </div>
                  </td>
                </tr>
              </table>

              <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin: 28px 0 10px; letter-spacing: 0.3px;">
                Get your team started
              </div>
              <div style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                To get started, have your employees visit
                <a href="${APP_URL}" style="color: #ff6b00; font-weight: 700; text-decoration: none;">shopguardapp.com</a>
                to download the ShopGuard app. Once downloaded, they will enter your company code to get started and set up their PIN.
              </div>

              <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 18px;">
                <tr>
                  <td style="background-color: #ff6b00; border-radius: 4px;">
                    <a href="${APP_URL}" style="display: inline-block; padding: 12px 22px; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #000000; text-decoration: none;">
                      Open ShopGuard
                    </a>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 28px; background-color: #2a1a00; border: 1px solid #ff6b00; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <div style="font-size: 11px; font-weight: 800; color: #ff6b00; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">
                      30-day free trial
                    </div>
                    <div style="font-size: 13px; color: #e5e7eb; line-height: 1.5;">
                      Your 30-day free trial has started. After the trial ends you will be charged <strong style="color: #ffffff;">$99 per month</strong>.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 28px; background-color: #12151d; border-top: 2px solid #ff6b00; text-align: center;">
              <div style="font-size: 13px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin-bottom: 8px;">
                Need help?
              </div>
              <div style="font-size: 13px; color: #9ca3af; line-height: 1.6;">
                Contact us anytime at
                <a href="mailto:${SUPPORT_EMAIL}" style="color: #ff6b00; font-weight: 700; text-decoration: none;">${SUPPORT_EMAIL}</a>
              </div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 14px; letter-spacing: 0.4px;">
                ShopGuard Safety Management Platform
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export async function sendWelcomeEmail({ to, companyName, companyCode, supervisorName }) {
  if (!to?.trim()) {
    throw new Error("Recipient email is required.");
  }
  if (!companyCode?.trim()) {
    throw new Error("Company code is required.");
  }

  const response = await fetch("/api/sendEmail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: to.trim(),
      from: FROM_EMAIL,
      subject: `Welcome to ShopGuard — ${companyName || "Your company code"}`,
      html: buildWelcomeEmailHtml({ companyName, companyCode, supervisorName }),
    }),
  });

  if (!response.ok) {
    let message = `Failed to send welcome email (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}
