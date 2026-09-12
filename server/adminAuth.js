import crypto from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

function hmac(key, value) {
  return crypto.createHmac("sha256", String(key)).update(String(value)).digest("base64url");
}

export function passwordsMatch(provided, expected) {
  if (!expected) return false;
  const a = sha256(provided);
  const b = sha256(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function issueAdminToken(secret) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifyAdminToken(token, secret) {
  if (!token || !secret) return false;
  const [payload, sig] = String(token).split(".");
  if (!payload || !sig) return false;
  const expected = hmac(secret, payload);
  const left = sha256(sig);
  const right = sha256(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return "";
  return value.replace(/^Bearer\s+/i, "").trim();
}
