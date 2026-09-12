export const ADMIN_TOKEN_KEY = "shopguard_admin_token";

function normalizePath(pathname) {
  const trimmed = String(pathname || "/").split("?")[0].split("#")[0];
  const noSlash = trimmed.replace(/\/+$/, "");
  return (noSlash || "/").toLowerCase();
}

export function isAdminPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const path = normalizePath(pathname);
  return path === "/admin" || path.endsWith("/admin");
}

export function isAdminRoute() {
  if (typeof window === "undefined") return false;
  if (isAdminPath(window.location.pathname)) return true;
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0].toLowerCase();
  if (hash === "admin") return true;
  return new URLSearchParams(window.location.search).has("admin");
}

export function openAdminRoute() {
  if (typeof window === "undefined") return;
  if (isAdminPath(window.location.pathname)) return;
  window.history.pushState({}, "", "/admin");
}

export function closeAdminRoute() {
  if (typeof window === "undefined") return;
  if (isAdminPath(window.location.pathname)) {
    window.location.assign("/");
    return true;
  }
  const url = new URL(window.location.href);
  url.hash = "";
  if (url.searchParams.has("admin")) {
    url.searchParams.delete("admin");
  }
  window.history.replaceState(null, "", url.pathname + url.search || "/");
  return false;
}

export async function adminRequest(action, extra = {}, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch("/api/admin", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Admin request failed.");
  }
  return data;
}
