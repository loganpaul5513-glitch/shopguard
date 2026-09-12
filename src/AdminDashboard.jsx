import { useEffect, useMemo, useState } from "react";
import { ADMIN_TOKEN_KEY, adminRequest, closeAdminRoute } from "./adminAccess";

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(value) {
  if (!value) return "Never";
  const ts = new Date(value).getTime();
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `Today, ${new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.floor(diff / 86400);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function trialEnded(company) {
  return company.status === "trial" && company.trialEndsAt && new Date(company.trialEndsAt).getTime() < Date.now();
}

export default function AdminDashboard({ s, LogoMark, onExit }) {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState("companies");
  const [companies, setCompanies] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [ticketFilter, setTicketFilter] = useState("open");
  const [resolvingId, setResolvingId] = useState("");

  const appStyle = {
    ...s.app,
    maxWidth: 640,
    textAlign: "left",
    minHeight: "100vh",
  };

  async function persistToken(next) {
    setToken(next);
    try {
      if (next) sessionStorage.setItem(ADMIN_TOKEN_KEY, next);
      else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignore storage failures */
    }
  }

  async function handleLogin() {
    setLoginError("");
    if (!password.trim()) {
      setLoginError("Enter the admin password.");
      return;
    }
    setLoginLoading(true);
    try {
      const data = await adminRequest("login", { password });
      await persistToken(data.token);
      setPassword("");
    } catch (err) {
      setLoginError(err.message || "Invalid admin password.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleExit() {
    persistToken("");
    const redirected = closeAdminRoute();
    if (!redirected) onExit();
  }

  async function loadData(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    setError("");
    try {
      const [overview, inbox] = await Promise.all([
        adminRequest("overview", {}, activeToken),
        adminRequest("tickets", {}, activeToken),
      ]);
      setCompanies(overview.companies || []);
      setTickets(inbox.tickets || []);
      setOpenCount(inbox.openCount || 0);
    } catch (err) {
      if (/expired|sign in/i.test(err.message || "")) {
        persistToken("");
        setLoginError("Admin session expired. Sign in again.");
      } else {
        setError(err.message || "Failed to load admin data.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadData(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResolve(ticket, resolved) {
    setResolvingId(ticket.id);
    try {
      await adminRequest(resolved ? "resolve" : "reopen", { ticketId: ticket.id }, token);
      setTickets((prev) => prev.map((item) => (
        item.id === ticket.id
          ? { ...item, resolved, resolvedAt: resolved ? new Date().toISOString() : null }
          : item
      )));
      setOpenCount((prev) => Math.max(0, prev + (resolved ? -1 : 1)));
    } catch (err) {
      setError(err.message || "Could not update ticket.");
    } finally {
      setResolvingId("");
    }
  }

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) =>
      [company.name, company.companyCode, company.email].some((value) =>
        String(value || "").toLowerCase().includes(q),
      ),
    );
  }, [companies, search]);

  const visibleTickets = useMemo(() => {
    if (ticketFilter === "resolved") return tickets.filter((ticket) => ticket.resolved);
    if (ticketFilter === "open") return tickets.filter((ticket) => !ticket.resolved);
    return tickets;
  }, [tickets, ticketFilter]);

  if (!token) {
    return (
      <div style={appStyle}>
        <div style={{ padding: 24, paddingTop: 48 }}>
          <button style={{ ...s.backBtn, marginBottom: 24 }} onClick={handleExit}>← BACK</button>
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <div style={{ ...s.logo, fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
              Shop<span style={{ color: "#ff6b00" }}>Guard</span>{LogoMark ? <LogoMark size={32} /> : null}
            </div>
            <div style={{ ...s.logoSub, fontSize: 12, display: "block" }}>OWNER ACCESS</div>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
            Admin password
          </div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.5 }}>
            This console is for the ShopGuard owner only. Company supervisors cannot access it.
          </div>
          <input
            style={s.input}
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            autoFocus
          />
          {loginError && <div style={{ color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>{loginError}</div>}
          <button
            style={{ ...s.primaryBtn, opacity: loginLoading ? 0.6 : 1 }}
            disabled={loginLoading}
            onClick={handleLogin}
          >
            {loginLoading ? "VERIFYING..." : "ENTER ADMIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={appStyle}>
      <div style={s.header}>
        <div>
          <div style={{ ...s.logo, fontSize: 18, display: "flex", alignItems: "center" }}>
            Shop<span style={{ color: "#ff6b00" }}>Guard</span>{LogoMark ? <LogoMark size={18} /> : null}
          </div>
          <div style={s.logoSub}>OWNER DASHBOARD</div>
        </div>
        <button style={s.backBtn} onClick={handleExit}>SIGN OUT</button>
      </div>

      <div style={s.content}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setTab("companies")}
            style={{
              background: tab === "companies" ? "#2a1a00" : "#161a23",
              border: `1px solid ${tab === "companies" ? "#ff6b00" : "#2a2e3a"}`,
              color: tab === "companies" ? "#ff6b00" : "#888",
              padding: "12px 8px",
              fontFamily: "inherit",
              fontWeight: 800,
              letterSpacing: 2,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            COMPANIES
          </button>
          <button
            onClick={() => setTab("inbox")}
            style={{
              background: tab === "inbox" ? "#2a1a00" : "#161a23",
              border: `1px solid ${tab === "inbox" ? "#ff6b00" : "#2a2e3a"}`,
              color: tab === "inbox" ? "#ff6b00" : "#888",
              padding: "12px 8px",
              fontFamily: "inherit",
              fontWeight: 800,
              letterSpacing: 2,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            SUPPORT INBOX{openCount > 0 ? ` (${openCount})` : ""}
          </button>
        </div>

        {error && <div style={s.alertBanner("red")}>{error}</div>}

        {tab === "companies" && (
          <>
            <div style={s.statRow}>
              <div style={s.stat}>
                <div style={s.statNum}>{companies.length}</div>
                <div style={s.statLabel}>Signed up</div>
              </div>
              <div style={s.stat}>
                <div style={{ ...s.statNum, color: "#f39c12" }}>{companies.filter((c) => c.status === "trial").length}</div>
                <div style={s.statLabel}>Trial</div>
              </div>
              <div style={s.stat}>
                <div style={{ ...s.statNum, color: "#2ecc71" }}>{companies.filter((c) => c.status === "active").length}</div>
                <div style={s.statLabel}>Active</div>
              </div>
            </div>

            <input
              style={s.input}
              placeholder="Search name, code, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <button
              style={{ ...s.backBtn, width: "100%", padding: 10, marginBottom: 16 }}
              onClick={() => loadData()}
              disabled={loading}
            >
              {loading ? "REFRESHING..." : "REFRESH"}
            </button>

            {loading && companies.length === 0 && (
              <div style={{ color: "#888", letterSpacing: 2, textAlign: "center", padding: 24 }}>LOADING COMPANIES...</div>
            )}

            {!loading && filteredCompanies.length === 0 && (
              <div style={{ color: "#888", fontSize: 13, lineHeight: 1.5 }}>No companies found.</div>
            )}

            {filteredCompanies.map((company) => {
              const ended = trialEnded(company);
              return (
                <div key={company.id} style={{ ...s.incidentCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: "#e8e8e0" }}>{company.name}</div>
                      <div style={{ fontSize: 13, color: "#ff6b00", letterSpacing: 1, marginTop: 2 }}>{company.companyCode || "NO CODE"}</div>
                    </div>
                    <span style={s.badge(company.status === "active" ? "green" : ended ? "red" : "orange")}>
                      {company.status === "active" ? "ACTIVE" : ended ? "TRIAL ENDED" : "TRIAL"}
                    </span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Email</span>
                    <span style={{ color: "#ccc", textAlign: "right" }}>{company.email || "—"}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Signed up</span>
                    <span>{formatDate(company.signedUpAt)}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Employees</span>
                    <span>{company.employeeCount}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Machines</span>
                    <span>{company.machineCount}</span>
                  </div>
                  <div style={{ ...s.detailRow, borderBottom: "none" }}>
                    <span style={s.detailLabel}>Last activity</span>
                    <span>{timeAgo(company.lastActivityAt)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "inbox" && (
          <>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              support@shopguardapp.com
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
              Inbound mail is saved by the Resend webhook into support_tickets.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {["open", "resolved", "all"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTicketFilter(filter)}
                  style={{
                    background: ticketFilter === filter ? "#161a23" : "#0f1117",
                    border: `1px solid ${ticketFilter === filter ? "#ff6b00" : "#2a2e3a"}`,
                    color: ticketFilter === filter ? "#ff6b00" : "#888",
                    padding: "8px 6px",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    letterSpacing: 1,
                    fontSize: 11,
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>

            {loading && tickets.length === 0 && (
              <div style={{ color: "#888", letterSpacing: 2, textAlign: "center", padding: 24 }}>LOADING INBOX...</div>
            )}

            {!loading && visibleTickets.length === 0 && (
              <div style={{ color: "#888", fontSize: 13, lineHeight: 1.5 }}>
                {ticketFilter === "open" ? "No open support messages." : "No messages yet."}
              </div>
            )}

            {visibleTickets.map((ticket) => {
              const expanded = expandedTicketId === ticket.id;
              return (
                <div key={ticket.id} style={{ ...s.incidentCard, cursor: "default", opacity: ticket.resolved ? 0.72 : 1 }}>
                  <button
                    onClick={() => setExpandedTicketId(expanded ? null : ticket.id)}
                    style={{ background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", color: "inherit", fontFamily: "inherit", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#e8e8e0" }}>{ticket.subject}</div>
                      <span style={s.badge(ticket.resolved ? "green" : "orange")}>
                        {ticket.resolved ? "RESOLVED" : "OPEN"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>{ticket.sender}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{formatDateTime(ticket.date)}</div>
                  </button>
                  {expanded && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #2a2e3a", paddingTop: 12 }}>
                      <div style={{ fontSize: 14, color: "#e8e8e0", whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: 14 }}>
                        {ticket.body || "No message body."}
                      </div>
                      {ticket.resolved ? (
                        <button
                          style={{ ...s.backBtn, width: "100%", padding: 12 }}
                          disabled={resolvingId === ticket.id}
                          onClick={() => handleResolve(ticket, false)}
                        >
                          {resolvingId === ticket.id ? "UPDATING..." : "REOPEN"}
                        </button>
                      ) : (
                        <button
                          style={{ ...s.primaryBtn, opacity: resolvingId === ticket.id ? 0.6 : 1 }}
                          disabled={resolvingId === ticket.id}
                          onClick={() => handleResolve(ticket, true)}
                        >
                          {resolvingId === ticket.id ? "SAVING..." : "MARK AS RESOLVED"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
