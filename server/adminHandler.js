import { envGet, getHeader, readJsonBody, sendJson } from "./http.js";
import { getBearerToken, issueAdminToken, passwordsMatch, verifyAdminToken } from "./adminAuth.js";
import { createSupabaseAdmin } from "./supabaseAdmin.js";

function requireAdmin(req, body, env) {
  const password = envGet(env, "ADMIN_PASSWORD");
  if (!password) {
    const error = new Error("Admin password is not configured.");
    error.statusCode = 500;
    throw error;
  }
  const token = getBearerToken(req) || body?.token || "";
  if (!verifyAdminToken(token, password)) {
    const error = new Error("Admin session expired. Sign in again.");
    error.statusCode = 401;
    throw error;
  }
  return password;
}

function planLabel(row) {
  const status = String(row.subscription_status || "").toLowerCase();
  if (status === "active") return "active";
  if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() < Date.now() && status !== "active") {
    return "trial";
  }
  return status === "trial" ? "trial" : "trial";
}

async function loadOverview(supabase) {
  const rpc = await supabase.rpc("admin_company_overview");
  if (!rpc.error && Array.isArray(rpc.data)) {
    return rpc.data.map(shapeCompany);
  }

  const companiesResult = await supabase
    .from("companies")
    .select("id, name, company_code, email, created_at, active, subscription_status, trial_ends_at")
    .order("created_at", { ascending: false });

  let companies = companiesResult.data;
  if (companiesResult.error) {
    const fallback = await supabase
      .from("companies")
      .select("id, name, company_code, email, created_at, active");
    if (fallback.error) throw fallback.error;
    companies = fallback.data;
  }

  const [employees, machines, inspections, incidents, training, meetings] = await Promise.all([
    supabase.from("employees").select("company_id, company_code"),
    supabase.from("machines").select("company_id"),
    supabase.from("inspections").select("company_id, created_at"),
    supabase.from("incidents").select("company_id, created_at"),
    supabase.from("training_records").select("company_id, created_at"),
    supabase.from("safety_meetings").select("company_id, created_at"),
  ]);

  const countByCompany = (rows, company) => {
    const keys = new Set([String(company.id), company.company_code].filter(Boolean));
    return (rows.data || []).filter((row) =>
      keys.has(row.company_id) || keys.has(row.company_code),
    ).length;
  };

  const lastActivity = (rowsList, company) => {
    const keys = new Set([String(company.id), company.company_code].filter(Boolean));
    let latest = company.created_at ? new Date(company.created_at).getTime() : 0;
    for (const rows of rowsList) {
      for (const row of rows.data || []) {
        if (!keys.has(row.company_id)) continue;
        const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (ts > latest) latest = ts;
      }
    }
    return latest ? new Date(latest).toISOString() : null;
  };

  return (companies || []).map((company) => shapeCompany({
    ...company,
    account_active: company.account_active ?? company.active,
    employee_count: countByCompany(employees, company),
    machine_count: countByCompany(machines, company),
    last_activity_at: lastActivity([inspections, incidents, training, meetings], company),
  }));
}

function shapeCompany(row) {
  const trialEndsAt = row.trial_ends_at || null;
  const status = planLabel(row);
  return {
    id: row.id,
    name: row.name || "Untitled company",
    companyCode: row.company_code || "",
    email: row.email || "",
    signedUpAt: row.created_at || null,
    accountActive: row.account_active !== false,
    status,
    trialEndsAt,
    employeeCount: Number(row.employee_count || 0),
    machineCount: Number(row.machine_count || 0),
    lastActivityAt: row.last_activity_at || row.created_at || null,
  };
}

async function loadTickets(supabase) {
  let result = await supabase
    .from("support_tickets")
    .select("id, sender_email, sender_name, company_name, subject, body_text, received_at, created_at, resolved, resolved_at")
    .order("received_at", { ascending: false });
  if (result.error && /company_name/i.test(result.error.message || "")) {
    result = await supabase
      .from("support_tickets")
      .select("id, sender_email, sender_name, subject, body_text, received_at, created_at, resolved, resolved_at")
      .order("received_at", { ascending: false });
  }
  const { data, error } = result;
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    sender: row.sender_name ? `${row.sender_name} <${row.sender_email}>` : row.sender_email,
    senderEmail: row.sender_email,
    senderName: row.sender_name || "",
    companyName: row.company_name || "",
    subject: row.subject || "(no subject)",
    body: row.body_text || "",
    date: row.received_at || row.created_at,
    resolved: row.resolved === true,
    resolvedAt: row.resolved_at || null,
  }));
}

export async function handleAdminRequest(req, res, env = process.env) {
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body" });
    return;
  }

  const action = String(body?.action || getHeader(req, "x-admin-action") || "overview").toLowerCase();

  try {
    if (action === "login") {
      const password = envGet(env, "ADMIN_PASSWORD");
      if (!password) {
        sendJson(res, 500, { message: "Admin password is not configured." });
        return;
      }
      if (!passwordsMatch(body?.password || "", password)) {
        sendJson(res, 401, { message: "Invalid admin password." });
        return;
      }
      sendJson(res, 200, { token: issueAdminToken(password) });
      return;
    }

    requireAdmin(req, body, env);
    const supabase = createSupabaseAdmin(env);

    if (action === "overview") {
      const companies = await loadOverview(supabase);
      sendJson(res, 200, { total: companies.length, companies });
      return;
    }

    if (action === "tickets") {
      const tickets = await loadTickets(supabase);
      sendJson(res, 200, {
        tickets,
        openCount: tickets.filter((ticket) => !ticket.resolved).length,
      });
      return;
    }

    if (action === "resolve" || action === "reopen") {
      const ticketId = body?.ticketId;
      if (!ticketId) {
        sendJson(res, 400, { message: "Ticket id is required." });
        return;
      }
      const resolved = action === "resolve";
      const { data, error } = await supabase
        .from("support_tickets")
        .update({
          resolved,
          resolved_at: resolved ? new Date().toISOString() : null,
        })
        .eq("id", ticketId)
        .select("id, resolved, resolved_at")
        .single();
      if (error) throw error;
      sendJson(res, 200, { ticket: data });
      return;
    }

    sendJson(res, 400, { message: "Unknown admin action." });
  } catch (err) {
    sendJson(res, err.statusCode || 500, {
      message: err.message || "Admin request failed.",
    });
  }
}
