export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function readRawBody(req) {
  if (typeof req.body === "string") {
    return Promise.resolve(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body.toString("utf8"));
  }
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(JSON.stringify(req.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

export async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

export function envGet(env, key, fallback = "") {
  return env?.[key] || process.env[key] || fallback;
}

export function getHeader(req, name) {
  const headers = req.headers || {};
  const direct = headers[name] || headers[name.toLowerCase()];
  if (direct) return Array.isArray(direct) ? direct[0] : direct;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return "";
}
