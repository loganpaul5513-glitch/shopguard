import { useState, useRef, useEffect } from "react";
import { supabase } from './supabase'

const SCREENS = {
  LOGIN: "login",
  DASHBOARD: "dashboard",
  MACHINES: "machines",
  MACHINE_DETAIL: "machine_detail",
  MACHINE_INSPECT: "machine_inspect",
  SOP_VIEW: "sop_view",
  SOP_BUILD: "sop_build",
  SOP_REVIEW: "sop_review",
  PENDING_SOPS: "pending_sops",
  MACHINE_ADD: "machine_add",
  TRAINING_MANAGE: "training_manage",
  TRAINING_LOG: "training_log",
  CHECKLIST_EDIT: "checklist_edit",
  LOTOTO_ACTIVE: "lototo_active",
  TRAINING: "training",
  INCIDENTS: "incidents",
  INCIDENT_NEW: "incident_new",
  INCIDENT_DETAIL: "incident_detail",
  OSHA_PANIC: "osha_panic",
  INSPECTION_LOG: "inspection_log",
  TEAM: "team",
  TEAM_MEMBER: "team_member",
  TEAM_ADD: "team_add",
  SAFETY_MEETINGS: "safety_meetings",
  SAFETY_MEETING_NEW: "safety_meeting_new",
  MAINTENANCE_SCHEDULE: "maintenance_schedule",
  MAINTENANCE_NEW: "maintenance_new",
  MY_TASKS: "my_tasks",
};

const ROLES = {
  WORKER: "worker",
  MAINTENANCE: "maintenance",
  SUPERVISOR: "supervisor",
};

const ROLE_COLORS = {
  [ROLES.WORKER]: "#2ecc71",
  [ROLES.MAINTENANCE]: "#f39c12",
  [ROLES.SUPERVISOR]: "#a070ff",
};

const ROLE_DESCRIPTIONS = {
  [ROLES.WORKER]: "Inspections, incidents, view SOPs",
  [ROLES.MAINTENANCE]: "Worker access + full LOTOTO",
  [ROLES.SUPERVISOR]: "Full access + team management",
};

function timeAgo(ts) {
  if (!ts) return "Never";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `Today, ${new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.floor(diff / 86400);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function inspectionStatus(ts) {
  if (!ts) return "critical";
  const hours = (Date.now() - ts) / 3600000;
  if (hours < 24) return "ok";
  if (hours < 72) return "warning";
  return "critical";
}

const COMPANY_ID = "demo-company";

function nameToAvatar(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function employeeRowToMember(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: nameToAvatar(row.name),
    role: (row.role || ROLES.WORKER).toLowerCase(),
    active: row.active !== false,
    trained: [],
    missing: [],
    expiring: null,
  };
}

function incidentRowToIncident(row) {
  const date = row.created_at
    ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  return {
    id: row.id,
    type: row.type || "Near Miss",
    severity: "Low",
    description: row.description || "",
    location: row.location || "General",
    reportedBy: row.reported_by || "",
    date,
    photos: 0,
    photoData: [],
    status: row.status || "Open",
  };
}

const initialMachines = [
  {
    id: 1, name: "Cincinnati Press Brake #33", lastInspectedTs: Date.now() - 1000 * 60 * 60 * 6,
    sop: true, lototo: true, ppe: ["Safety Glasses", "Gloves", "Steel Toes"],
    activeLocks: [],
    lototoSteps: [
      { id: 1, title: "Notify all affected employees", description: "Inform everyone in the area that the machine is being locked out.", energyType: null },
      { id: 2, title: "Shut down machine", description: "Use normal stopping procedure. Press the stop button and wait for full stop.", energyType: null },
      { id: 3, title: "Disconnect main electrical disconnect", description: "Located on the back-left panel. Turn the red handle to the OFF position.", energyType: "⚡ Electrical" },
      { id: 4, title: "Apply lock to electrical disconnect", description: "Place your personal lock on the disconnect. Do not use anyone else's lock.", energyType: "⚡ Electrical" },
      { id: 5, title: "Release stored hydraulic pressure", description: "Press the foot pedal twice after disconnect to release any stored pressure.", energyType: "💧 Hydraulic" },
      { id: 6, title: "Verify zero energy state", description: "Attempt to start the machine. Confirm it does not operate.", energyType: null },
    ],
    inspectionLog: [
      { by: "Joe Martinez", ts: Date.now() - 1000 * 60 * 60 * 6, notes: "All good.", passed: true },
    ],
    inspectionChecklist: [
      { id: 1, item: "Die and punch inspected for damage" },
      { id: 2, item: "Back gauge set correctly" },
      { id: 3, item: "Guards in place" },
      { id: 4, item: "Foot pedal functional" },
      { id: 5, item: "No fluid leaks" },
    ],
    sopSteps: [
      { id: 1, title: "Put on PPE", description: "Safety glasses, gloves, and steel-toed boots required before operating.", warning: "Never operate without proper PPE.", photo: "simulated" },
      { id: 2, title: "Inspect the die and punch", description: "Check for cracks, chips, or damage. Do not operate if damaged.", warning: "Damaged tooling can cause serious injury.", photo: null },
      { id: 3, title: "LOTOTO before adjustments", description: "If you need to reach inside the machine for any reason, lock it out first.", warning: "LOCKOUT REQUIRED before reaching inside.", photo: null },
    ],
    pendingSop: null,
  },
  {
    id: 2, name: "Shear #7", lastInspectedTs: Date.now() - 1000 * 60 * 60 * 24 * 3,
    sop: true, lototo: true, ppe: ["Face Shield", "Gloves", "Steel Toes"],
    activeLocks: [{ by: "Sarah Chen", ts: Date.now() - 1000 * 60 * 25, reason: "Blade guard replacement" }],
    lototoSteps: [
      { id: 1, title: "Shut down machine completely", description: "Allow blade to come to a complete stop before proceeding.", energyType: null },
      { id: 2, title: "Disconnect electrical panel", description: "Located on the right side. Pull main breaker to OFF.", energyType: "⚡ Electrical" },
      { id: 3, title: "Lock electrical panel", description: "Apply personal lock. Tag must include your name and date.", energyType: "⚡ Electrical" },
      { id: 4, title: "Bleed hydraulic pressure", description: "Open bleed valve on hydraulic manifold (lower rear). Wait for pressure gauge to read zero.", energyType: "💧 Hydraulic" },
      { id: 5, title: "Verify zero energy", description: "Try to operate machine. Confirm no movement.", energyType: null },
    ],
    inspectionLog: [{ by: "Dave Wilson", ts: Date.now() - 1000 * 60 * 60 * 24 * 3, notes: "Blade guard checked.", passed: true }],
    inspectionChecklist: [
      { id: 1, item: "Blade guard secure and aligned" },
      { id: 2, item: "Back gauge set to spec" },
      { id: 3, item: "Hold-downs functional" },
      { id: 4, item: "No visible hydraulic leaks" },
    ],
    sopSteps: [{ id: 1, title: "Check blade guard", description: "Verify guard is tight before any operation.", warning: "Never operate with a loose guard.", photo: "simulated" }],
    pendingSop: null,
  },
  {
    id: 3, name: "Roll Former #2", lastInspectedTs: Date.now() - 1000 * 60 * 60 * 7,
    sop: false, lototo: false, ppe: ["Safety Glasses", "Gloves"],
    activeLocks: [],
    lototoSteps: [],
    inspectionLog: [{ by: "Mike Thompson", ts: Date.now() - 1000 * 60 * 60 * 7, notes: "", passed: true }],
    inspectionChecklist: [
      { id: 1, item: "Rollers clean and undamaged" },
      { id: 2, item: "Drive guards in place" },
      { id: 3, item: "Material feed aligned" },
    ],
    sopSteps: [],
    pendingSop: null,
  },
  {
    id: 4, name: "Spot Welder #11", lastInspectedTs: Date.now() - 1000 * 60 * 60 * 24 * 5,
    sop: false, lototo: true, ppe: ["Welding Hood", "Gloves", "Apron"],
    activeLocks: [],
    lototoSteps: [
      { id: 1, title: "Power off welder", description: "Use main power switch on front panel.", energyType: null },
      { id: 2, title: "Disconnect power cord", description: "Unplug from wall outlet or lock out the breaker panel.", energyType: "⚡ Electrical" },
      { id: 3, title: "Allow capacitors to discharge", description: "Wait minimum 5 minutes after disconnect before touching any internal components.", energyType: "⚡ Electrical" },
      { id: 4, title: "Apply personal lock", description: "Lock the breaker or plug receptacle. Tag with name and date.", energyType: "⚡ Electrical" },
      { id: 5, title: "Verify discharge complete", description: "Use voltage meter to confirm zero voltage at electrode tips.", energyType: null },
    ],
    inspectionLog: [],
    inspectionChecklist: [
      { id: 1, item: "Electrode tips in good condition" },
      { id: 2, item: "Cooling water flowing" },
      { id: 3, item: "Pressure arms aligned" },
      { id: 4, item: "No exposed wiring" },
    ],
    sopSteps: [],
    pendingSop: null,
  },
];

const INCIDENT_TYPES = ["Near Miss", "Injury", "Property Damage", "Equipment Failure", "Unsafe Condition", "Other"];
const SEVERITY = ["Low", "Medium", "High", "Critical"];
const ALL_ROLES = [ROLES.WORKER, ROLES.MAINTENANCE, ROLES.SUPERVISOR];

function getS() {
  return {
    app: { fontFamily: "'Barlow Condensed','Roboto Condensed',sans-serif", background: "#0f1117", minHeight: "100vh", color: "#e8e8e0", maxWidth: 430, margin: "0 auto" },
    header: { background: "#161a23", borderBottom: "2px solid #ff6b00", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
    logo: { fontSize: 22, fontWeight: 800, letterSpacing: 2, color: "#ff6b00", textTransform: "uppercase" },
    logoSub: { fontSize: 10, color: "#888", letterSpacing: 3, marginTop: -2 },
    backBtn: { background: "none", border: "1px solid #333", color: "#aaa", padding: "6px 12px", fontSize: 13, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" },
    content: { padding: 16 },
    sectionTitle: { fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", marginBottom: 12, marginTop: 20, fontWeight: 700 },
    bigBtn: { display: "flex", alignItems: "center", gap: 14, background: "#161a23", border: "1px solid #2a2e3a", borderLeft: "4px solid #ff6b00", padding: "16px 16px", marginBottom: 10, cursor: "pointer", width: "100%", textAlign: "left" },
    bigBtnIcon: { fontSize: 28, lineHeight: 1 },
    bigBtnLabel: { fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "#e8e8e0", textTransform: "uppercase" },
    bigBtnSub: { fontSize: 12, color: "#888", marginTop: 2 },
    statRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 },
    stat: { background: "#161a23", border: "1px solid #2a2e3a", padding: "12px 8px", textAlign: "center" },
    statNum: { fontSize: 28, fontWeight: 800, color: "#ff6b00", lineHeight: 1 },
    statLabel: { fontSize: 10, letterSpacing: 2, color: "#888", textTransform: "uppercase", marginTop: 4 },
    machineCard: { background: "#161a23", border: "1px solid #2a2e3a", padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" },
    statusDot: (st) => ({ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, background: st === "ok" ? "#2ecc71" : st === "warning" ? "#f39c12" : "#e74c3c" }),
    badge: (color) => ({
      display: "inline-block", padding: "3px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginRight: 6, marginBottom: 6, textTransform: "uppercase",
      background: color === "green" ? "#1a3a2a" : color === "red" ? "#3a1a1a" : color === "yellow" ? "#2a2200" : color === "purple" ? "#1a1a3a" : color === "orange" ? "#2a1a00" : "#1a1a2a",
      color: color === "green" ? "#2ecc71" : color === "red" ? "#e74c3c" : color === "yellow" ? "#f39c12" : color === "purple" ? "#a070ff" : color === "orange" ? "#f39c12" : "#4a9eff",
      border: `1px solid ${color === "green" ? "#2ecc71" : color === "red" ? "#e74c3c" : color === "yellow" ? "#f39c12" : color === "purple" ? "#a070ff" : color === "orange" ? "#f39c12" : "#4a9eff"}`,
    }),
    checkItem: (checked) => ({ display: "flex", alignItems: "center", gap: 14, background: checked ? "#0f2a1a" : "#161a23", border: `1px solid ${checked ? "#2ecc71" : "#2a2e3a"}`, padding: "14px 16px", marginBottom: 8, cursor: "pointer" }),
    checkbox: (checked) => ({ width: 24, height: 24, border: `2px solid ${checked ? "#2ecc71" : "#444"}`, background: checked ? "#2ecc71" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, color: "#000", fontWeight: 800 }),
    checkLabel: (checked) => ({ fontSize: 16, fontWeight: 600, letterSpacing: 0.5, color: checked ? "#2ecc71" : "#e8e8e0", textDecoration: checked ? "line-through" : "none" }),
    input: { width: "100%", background: "#0f1117", border: "1px solid #333", color: "#e8e8e0", padding: "12px 14px", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 },
    textarea: { width: "100%", background: "#0f1117", border: "1px solid #333", color: "#e8e8e0", padding: "12px 14px", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12, minHeight: 80, resize: "vertical" },
    select: { width: "100%", background: "#0f1117", border: "1px solid #333", color: "#e8e8e0", padding: "12px 14px", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12, appearance: "none" },
    primaryBtn: { background: "#ff6b00", color: "#000", border: "none", padding: "14px 24px", fontSize: 16, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", width: "100%", fontFamily: "inherit" },
    dangerBtn: { background: "#c0392b", color: "#fff", border: "none", padding: "18px 24px", fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", width: "100%", fontFamily: "inherit" },
    detailRow: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1f2330", padding: "10px 0", fontSize: 14 },
    detailLabel: { color: "#888", letterSpacing: 1, fontSize: 12, textTransform: "uppercase" },
    alertBanner: (color) => ({ background: color === "red" ? "#3a0a0a" : color === "orange" ? "#3a1a00" : "#1a1a3a", border: `1px solid ${color === "red" ? "#e74c3c" : color === "orange" ? "#ff6b00" : "#a070ff"}`, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: color === "red" ? "#e74c3c" : color === "orange" ? "#ff6b00" : "#a070ff", letterSpacing: 0.5 }),
    formLabel: { fontSize: 11, letterSpacing: 2, color: "#ff6b00", textTransform: "uppercase", marginBottom: 6, display: "block", fontWeight: 700 },
    incidentCard: { background: "#161a23", border: "1px solid #2a2e3a", padding: "14px 16px", marginBottom: 10, cursor: "pointer" },
    logEntry: { background: "#161a23", border: "1px solid #2a2e3a", padding: "12px 14px", marginBottom: 8, borderLeft: "3px solid #2ecc71" },
    roleTag: (role) => ({ display: "inline-block", padding: "3px 10px", fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", background: role === ROLES.SUPERVISOR ? "#1a1a3a" : role === ROLES.MAINTENANCE ? "#2a1a00" : "#1a2a1a", color: ROLE_COLORS[role], border: `1px solid ${ROLE_COLORS[role]}` }),
    avatar: (role) => ({ width: 44, height: 44, borderRadius: "50%", background: role === ROLES.SUPERVISOR ? "#1a1a3a" : role === ROLES.MAINTENANCE ? "#2a1a00" : "#1a2a1a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: ROLE_COLORS[role], flexShrink: 0, border: `2px solid ${ROLE_COLORS[role]}` }),
    lototoStep: (done) => ({ background: done ? "#0f2a1a" : "#161a23", border: `2px solid ${done ? "#2ecc71" : "#2a2e3a"}`, padding: "14px 16px", marginBottom: 10 }),
    lockCard: { background: "#2a0a0a", border: "2px solid #e74c3c", padding: "12px 14px", marginBottom: 8 },
  };
}

function CameraModal({ onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [captured, setCaptured] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const s = getS();
  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setLoading(false);
      } catch { setError(true); setLoading(false); }
    }
    start();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);
  function capture() {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      setCaptured(canvasRef.current.toDataURL("image/jpeg"));
    }
  }
  function close() { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); onClose(); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 300, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
      <div style={s.header}><button style={s.backBtn} onClick={close}>✕ CLOSE</button><div style={{ ...s.logo, fontSize: 18 }}>📷 CAMERA</div></div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
        {loading && <div style={{ color: "#888", letterSpacing: 2 }}>ACCESSING CAMERA...</div>}
        {error && <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>📷</div>
          <div style={{ color: "#ff6b00", fontWeight: 700, fontSize: 15, letterSpacing: 1, marginBottom: 8 }}>CAMERA NOT AVAILABLE</div>
          <div style={{ color: "#888", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>On a real phone this opens your camera.</div>
          <div style={{ background: "#161a23", border: "2px dashed #333", width: 260, height: 180, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "#444", fontSize: 12, letterSpacing: 2 }}>VIEWFINDER</div>
          <button style={{ ...s.primaryBtn, width: 260 }} onClick={() => { onCapture("simulated"); onClose(); }}>📎 ATTACH PHOTO (SIMULATED)</button>
        </div>}
        {!error && !captured && !loading && <>
          <video ref={videoRef} autoPlay playsInline style={{ width: "100%", maxWidth: 400, border: "2px solid #ff6b00", marginBottom: 20 }} />
          <button style={{ ...s.primaryBtn, width: 180, fontSize: 20, padding: "18px 0" }} onClick={capture}>⬤ CAPTURE</button>
        </>}
        {captured && <>
          <img src={captured} alt="captured" style={{ width: "100%", maxWidth: 400, marginBottom: 20, border: "2px solid #2ecc71" }} />
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
            <button style={{ ...s.backBtn, flex: 1, padding: 14 }} onClick={() => setCaptured(null)}>RETAKE</button>
            <button style={{ ...s.primaryBtn, flex: 2 }} onClick={() => { onCapture(captured); onClose(); }}>✓ USE PHOTO</button>
          </div>
        </>}
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

const LogoMark = ({ size = 18 }) => (
  <svg width={size * 0.85} height={size} viewBox="0 0 240 270" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6, flexShrink: 0 }} aria-hidden="true">
    <path d="M120,8 L212,50 L212,138 Q212,208 120,238 Q28,208 28,138 L28,50 Z" fill="#ff6b00"/>
    <path d="M120,26 L194,64 L194,138 Q194,198 120,224 Q46,198 46,138 L46,64 Z" fill="#0f1117"/>
    <circle cx="52" cy="72" r="5" fill="#ff6b00" opacity="0.45"/>
    <circle cx="188" cy="72" r="5" fill="#ff6b00" opacity="0.45"/>
    <circle cx="52" cy="144" r="5" fill="#ff6b00" opacity="0.45"/>
    <circle cx="188" cy="144" r="5" fill="#ff6b00" opacity="0.45"/>
    <path d="M90,112 L90,78 Q90,52 120,52 Q150,52 150,78 L150,112" fill="none" stroke="#ff6b00" stroke-width="16" stroke-linecap="round"/>
    <rect x="74" y="112" width="92" height="76" rx="6" fill="#ff6b00"/>
    <circle cx="120" cy="140" r="12" fill="#0f1117"/>
    <rect x="114" y="140" width="12" height="18" rx="3" fill="#0f1117"/>
  </svg>
);

function CorrectiveActionForm({ incidentId, team, onSave, s }) {
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <div>
      <label style={s.formLabel}>What needs to be fixed?</label>
      <textarea style={{ ...s.textarea, minHeight: 60 }} placeholder="Describe the corrective action required..." value={description} onChange={e => setDescription(e.target.value)} />
      <label style={s.formLabel}>Assign To</label>
      <select style={s.select} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
        <option value="">Select person...</option>
        {team.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
      </select>
      <label style={s.formLabel}>Due Date</label>
      <input style={s.input} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
      <button style={{ ...s.primaryBtn, opacity: (description && assignedTo && dueDate) ? 1 : 0.4 }}
        disabled={!description || !assignedTo || !dueDate}
        onClick={() => onSave({ description, assignedTo, dueDate, completed: false })}>
        ✓ ASSIGN CORRECTIVE ACTION
      </button>
    </div>
  );
}

export default function ShopGuard() {
  const s = getS();
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState(SCREENS.LOGIN);
  const [machines, setMachines] = useState(initialMachines);
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [newEmployee, setNewEmployee] = useState({ name: "", role: ROLES.WORKER });
  const [employeeAdded, setEmployeeAdded] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null); // "incident" | "sop_step:{id}"
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [newIncident, setNewIncident] = useState({ type: "", severity: "", description: "", location: "", photos: [] });
  const [submitted, setSubmitted] = useState(false);
  const [panicExported, setPanicExported] = useState(false);
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);
  const [sopSteps, setSopSteps] = useState([]);
  const [sopPublished, setSopPublished] = useState(false);
  const [sopSubmittedForReview, setSopSubmittedForReview] = useState(false);
  const [editingStepId, setEditingStepId] = useState(null);
  const [sopNote, setSopNote] = useState("");
  const [inspectChecks, setInspectChecks] = useState([]);
  const [inspectNotes, setInspectNotes] = useState("");
  const [inspectDone, setInspectDone] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // LOTOTO state
  const [lototoChecks, setLototoChecks] = useState([]);
  const [lototoReason, setLototoReason] = useState("");
  const [lototoStarted, setLototoStarted] = useState(false);
  const [lototoComplete, setLototoComplete] = useState(false);
  const [removingLock, setRemovingLock] = useState(false);
  const [newMachine, setNewMachine] = useState({ name: "", ppe: "", lototo: false, sop: false });
  const [machineAdded, setMachineAdded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");

  // Safety meetings state
  const [safetyMeetings, setSafetyMeetings] = useState([
    { id: 1, topic: "Forklift Safety Review", date: "May 12, 2026", ledBy: "Dave Wilson", attendees: ["Joe Martinez", "Sarah Chen", "Mike Thompson"], notes: "Reviewed spotter requirements near dock doors.", ts: Date.now() - 1000 * 60 * 60 * 24 * 8 },
    { id: 2, topic: "Monthly LOTO Refresher", date: "Apr 28, 2026", ledBy: "Linda Park", attendees: ["Sarah Chen", "Tony Reyes"], notes: "Went over updated procedure for Shear #7.", ts: Date.now() - 1000 * 60 * 60 * 24 * 22 },
  ]);
  const [newMeeting, setNewMeeting] = useState({ topic: "", notes: "", attendees: [] });
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);

  // Maintenance scheduling state
  const [maintenanceItems, setMaintenanceItems] = useState([
    { id: 1, machineId: 1, machineName: "Cincinnati Press Brake #33", task: "Hydraulic fluid change", intervalDays: 90, lastDoneTs: Date.now() - 1000 * 60 * 60 * 24 * 75, assignedTo: "Tony Reyes", status: "upcoming" },
    { id: 2, machineId: 2, machineName: "Shear #7", task: "Blade inspection and sharpening", intervalDays: 60, lastDoneTs: Date.now() - 1000 * 60 * 60 * 24 * 65, assignedTo: "Sarah Chen", status: "overdue" },
    { id: 3, machineId: 4, machineName: "Spot Welder #11", task: "Electrode tip replacement", intervalDays: 30, lastDoneTs: Date.now() - 1000 * 60 * 60 * 24 * 18, assignedTo: "Tony Reyes", status: "ok" },
  ]);
  const [newMaintenance, setNewMaintenance] = useState({ machineId: "", task: "", intervalDays: "30", assignedTo: "" });
  const [maintenanceAdded, setMaintenanceAdded] = useState(false);

  // Training management state
  const [trainingTypes, setTrainingTypes] = useState([
    { id: 1, name: "Forklift Certification", frequency: "annual", required: true },
    { id: 2, name: "LOTO", frequency: "annual", required: true },
    { id: 3, name: "Fire Safety", frequency: "annual", required: true },
    { id: 4, name: "Respirator Fit Test", frequency: "annual", required: false },
  ]);
  const [newTrainingType, setNewTrainingType] = useState({ name: "", frequency: "annual", required: true });
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [selectedTrainingMember, setSelectedTrainingMember] = useState(null);
  const [logTrainingType, setLogTrainingType] = useState("");
  const [logTrainingDate, setLogTrainingDate] = useState("");
  const [trainingLogged, setTrainingLogged] = useState(false);

  useEffect(() => {
    async function loadEmployees() {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, active")
        .ilike("company_id", COMPANY_ID);
      if (error) {
        console.error("Failed to load employees:", error);
      } else if (data) {
        setTeam(data.map(employeeRowToMember));
      }
      setTeamLoading(false);
    }
    async function loadIncidents() {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, type, location, description, reported_by, status, created_at")
        .ilike("company_id", COMPANY_ID)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to load incidents:", error);
      } else if (data) {
        setIncidents(data.map(incidentRowToIncident));
      }
    }
    loadEmployees();
    loadIncidents();
  }, []);

  const selectedMachine = () => machines.find(m => m.id === selectedMachineId);
  const selectedMember = () => team.find(m => m.id === selectedMemberId);
  const isSupervisor = () => currentUser?.role === ROLES.SUPERVISOR;
  const isMaintenance = () => currentUser?.role === ROLES.MAINTENANCE || currentUser?.role === ROLES.SUPERVISOR;
  const pendingCount = () => machines.filter(m => m.pendingSop).length;
  const overdueCount = () => machines.filter(m => inspectionStatus(m.lastInspectedTs) === "critical").length;
  const openIncidents = () => incidents.filter(i => i.status === "Open").length;
  const myActiveLocks = () => machines.filter(m => m.activeLocks.some(l => l.by === currentUser?.name));

  function startLototo(machine) {
    setLototoChecks(machine.lototoSteps.map(s => ({ ...s, done: false })));
    setLototoReason("");
    setLototoStarted(false);
    setLototoComplete(false);
    setRemovingLock(false);
    setScreen(SCREENS.LOTOTO);
  }

  function submitLototo() {
    const lock = { by: currentUser.name, ts: Date.now(), reason: lototoReason };
    setMachines(prev => prev.map(m => m.id === selectedMachineId ? { ...m, activeLocks: [...m.activeLocks, lock] } : m));
    setLototoComplete(true);
  }

  function removeLock(machineId) {
    setMachines(prev => prev.map(m => m.id === machineId ? { ...m, activeLocks: m.activeLocks.filter(l => l.by !== currentUser.name) } : m));
    setRemovingLock(false);
    setScreen(SCREENS.MACHINE_DETAIL);
  }

  function startInspection(machine) {
    setInspectChecks(machine.inspectionChecklist.map(i => ({ ...i, checked: false })));
    setInspectNotes("");
    setInspectDone(false);
    setScreen(SCREENS.MACHINE_INSPECT);
  }

  async function submitInspection() {
    const passed = inspectChecks.every(i => i.checked);
    const { error } = await supabase
      .from("inspections")
      .insert({
        company_id: COMPANY_ID,
        machine_id: selectedMachineId,
        employee_id: currentUser.id,
        employee_name: currentUser.name,
        passed,
        notes: inspectNotes,
      });

    if (error) {
      console.error("Failed to save inspection:", error);
      alert("Failed to save inspection. Please try again.");
      return;
    }

    const ts = Date.now();
    setMachines(prev => prev.map(m => m.id === selectedMachineId ? { ...m, lastInspectedTs: ts, inspectionLog: [{ by: currentUser.name, ts, notes: inspectNotes, passed }, ...m.inspectionLog] } : m));
    setInspectDone(true);
  }

  async function submitTrainingLog(member) {
    const { error } = await supabase
      .from("training_records")
      .insert({
        company_id: COMPANY_ID,
        employee_id: member.id,
        employee_name: member.name,
        training_type: logTrainingType,
        completed_date: logTrainingDate,
      });

    if (error) {
      console.error("Failed to save training record:", error);
      alert("Failed to save training record. Please try again.");
      return;
    }

    setTeam(prev => prev.map(m => {
      if (m.id !== member.id) return m;
      const alreadyHas = m.trained.includes(logTrainingType);
      return {
        ...m,
        trained: alreadyHas ? m.trained : [...m.trained, logTrainingType],
        missing: m.missing.filter(x => x !== logTrainingType),
        expiring: null,
      };
    }));
    setTrainingLogged(true);
    setTimeout(() => {
      setTrainingLogged(false);
      setLogTrainingType("");
      setLogTrainingDate("");
      setSelectedTrainingMember(null);
      setScreen(SCREENS.TRAINING);
    }, 1800);
  }

  function addSopStep() {
    const ns = { id: Date.now(), title: "", description: "", warning: "", photo: null };
    setSopSteps(prev => [...prev, ns]);
    setEditingStepId(ns.id);
  }
  function updateSopStep(id, field, val) { setSopSteps(prev => prev.map(st => st.id === id ? { ...st, [field]: val } : st)); }
  function deleteSopStep(id) { setSopSteps(prev => prev.filter(st => st.id !== id)); if (editingStepId === id) setEditingStepId(null); }
  function moveSopStep(id, dir) {
    setSopSteps(prev => {
      const idx = prev.findIndex(st => st.id === id);
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function submitSopForReview() {
    setMachines(prev => prev.map(m => m.id === selectedMachineId ? { ...m, pendingSop: { steps: sopSteps.filter(st => st.title), submittedBy: currentUser.name, submittedTs: Date.now(), note: sopNote } } : m));
    setSopSubmittedForReview(true);
    setTimeout(() => { setSopSubmittedForReview(false); setSopSteps([]); setSopNote(""); setEditingStepId(null); setScreen(SCREENS.MACHINE_DETAIL); }, 2200);
  }

  function publishSop() {
    setMachines(prev => prev.map(m => m.id === selectedMachineId ? { ...m, sop: true, sopSteps: sopSteps.filter(st => st.title), pendingSop: null } : m));
    setSopPublished(true);
    setTimeout(() => { setSopPublished(false); setSopSteps([]); setSopNote(""); setEditingStepId(null); setScreen(SCREENS.MACHINE_DETAIL); }, 2000);
  }

  function approvePendingSop(machineId) {
    setMachines(prev => prev.map(m => m.id === machineId ? { ...m, sop: true, sopSteps: m.pendingSop.steps, pendingSop: null } : m));
    setReviewAction("approved");
  }

  function rejectPendingSop(machineId) {
    setMachines(prev => prev.map(m => m.id === machineId ? { ...m, pendingSop: { ...m.pendingSop, rejected: true, rejectReason } } : m));
    setReviewAction("rejected");
    setShowRejectInput(false);
    setRejectReason("");
  }

  function updateMemberRole(memberId, newRole) {
    setTeam(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
  }

  async function submitIncident() {
    const { data, error } = await supabase
      .from("incidents")
      .insert({
        company_id: COMPANY_ID,
        type: newIncident.type || "Near Miss",
        location: newIncident.location || "General",
        description: newIncident.description,
        reported_by: currentUser?.name,
        status: "Open",
      })
      .select("id, type, location, description, reported_by, status, created_at")
      .single();

    if (error) {
      console.error("Failed to save incident:", error);
      alert("Failed to save incident report. Please try again.");
      return;
    }

    setIncidents(prev => [{
      ...incidentRowToIncident(data),
      severity: newIncident.severity || "Low",
      photos: newIncident.photos.length,
      photoData: newIncident.photos,
    }, ...prev]);
    setSubmitted(true);
    setTimeout(() => {
      setNewIncident({ type: "", severity: "", description: "", location: "", photos: [] });
      setSubmitted(false);
      setScreen(SCREENS.DASHBOARD);
    }, 1800);
  }

  async function updateIncidentStatus(incidentId, newStatus, localPatch = {}) {
    const { error } = await supabase
      .from("incidents")
      .update({ status: newStatus })
      .eq("id", incidentId);

    if (error) {
      console.error("Failed to update incident status:", error);
      alert("Failed to update incident status. Please try again.");
      return;
    }

    setIncidents(prev => prev.map(x => x.id === incidentId ? { ...x, status: newStatus, ...localPatch } : x));
  }

  async function submitNewEmployee() {
    const { data, error } = await supabase
      .from("employees")
      .insert({
        company_id: COMPANY_ID,
        name: newEmployee.name.trim(),
        role: newEmployee.role,
        active: true,
      })
      .select("id, name, role, active")
      .single();

    if (error) {
      console.error("Failed to save employee:", error);
      alert("Failed to save employee. Please try again.");
      return;
    }

    setTeam(prev => [...prev, employeeRowToMember(data)]);
    setEmployeeAdded(true);
    setTimeout(() => {
      setEmployeeAdded(false);
      setNewEmployee({ name: "", role: ROLES.WORKER });
      setScreen(SCREENS.TEAM);
    }, 1800);
  }

  function maintenanceDueStatus(item) {
    if (!item.lastDoneTs) return "overdue";
    const daysSince = (Date.now() - item.lastDoneTs) / (1000 * 60 * 60 * 24);
    const daysLeft = item.intervalDays - daysSince;
    if (daysLeft < 0) return "overdue";
    if (daysLeft < 7) return "upcoming";
    return "ok";
  }

  function maintenanceDueText(item) {
    if (!item.lastDoneTs) return "Never done";
    const daysSince = (Date.now() - item.lastDoneTs) / (1000 * 60 * 60 * 24);
    const daysLeft = Math.round(item.intervalDays - daysSince);
    if (daysLeft < 0) return `${Math.abs(daysLeft)} days overdue`;
    if (daysLeft === 0) return "Due today";
    return `Due in ${daysLeft} days`;
  }

  function severityColor(sev) { return sev === "Critical" ? "red" : sev === "High" ? "yellow" : sev === "Medium" ? "blue" : "green"; }

  function openCamera(target) { setCameraTarget(target); setShowCamera(true); }
  function handleCapture(dataUrl) {
    if (cameraTarget === "incident") {
      setNewIncident(prev => ({ ...prev, photos: [...prev.photos, dataUrl] }));
    } else if (cameraTarget?.startsWith("sop:")) {
      const stepId = parseInt(cameraTarget.split(":")[1]);
      setSopSteps(prev => prev.map(st => st.id === stepId ? { ...st, photo: dataUrl } : st));
    }
    setCameraTarget(null);
  }

  if (showCamera) return <CameraModal onClose={() => setShowCamera(false)} onCapture={handleCapture} />;

  // ── LOGIN ──
  if (screen === SCREENS.LOGIN) {
    return (
      <div style={s.app}>
        <div style={{ padding: 24, paddingTop: 48 }}>
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <div style={{ ...s.logo, fontSize: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={36} /></div>
            <div style={{ ...s.logoSub, fontSize: 12, display: "block" }}>SHOP SAFETY PLATFORM</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 16 }}>On a real device this would be fingerprint login.</div>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>Select your account</div>
          {teamLoading && <div style={{ color: "#888", letterSpacing: 2, marginBottom: 16 }}>LOADING TEAM...</div>}
          {!teamLoading && team.filter(user => user.active).length === 0 && (
            <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>No active employees found. A supervisor can add team members from Team Management.</div>
          )}
          {team.filter(user => user.active).map(user => (
            <button key={user.id} onClick={() => { setCurrentUser(user); setScreen(SCREENS.DASHBOARD); }}
              style={{ display: "flex", alignItems: "center", gap: 14, background: "#161a23", border: "1px solid #2a2e3a", borderLeft: `4px solid ${ROLE_COLORS[user.role]}`, padding: "14px 16px", marginBottom: 10, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit" }}>
              <div style={s.avatar(user.role)}>{user.avatar}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#e8e8e0", marginBottom: 4 }}>{user.name}</div>
                <span style={s.roleTag(user.role)}>{user.role}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── ADD EMPLOYEE (supervisor only) ──
  if (screen === SCREENS.TEAM_ADD) {
    if (employeeAdded) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>EMPLOYEE ADDED</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>{newEmployee.name}</div>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.TEAM)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>ADD EMPLOYEE</div></div>
        <div style={s.content}>
          <div style={{ background: "#1a2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#2ecc71" }}>
            Supervisor access — new employees are saved to your company roster.
          </div>

          <label style={s.formLabel}>Full Name *</label>
          <input style={s.input} placeholder="e.g. Joe Martinez" value={newEmployee.name} onChange={e => setNewEmployee(p => ({ ...p, name: e.target.value }))} />

          <label style={s.formLabel}>Role *</label>
          <select style={s.select} value={newEmployee.role} onChange={e => setNewEmployee(p => ({ ...p, role: e.target.value }))}>
            {ALL_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>

          <button style={{ ...s.primaryBtn, opacity: newEmployee.name.trim() ? 1 : 0.4 }} disabled={!newEmployee.name.trim()} onClick={submitNewEmployee}>
            ✓ ADD EMPLOYEE
          </button>
        </div>
      </div>
    );
  }

  // ── TEAM MANAGEMENT ──
  if (screen === SCREENS.TEAM) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>TEAM MANAGEMENT</div>
            {isSupervisor() && <button onClick={() => setScreen(SCREENS.TEAM_ADD)} style={{ background: "#ff6b00", color: "#000", border: "none", padding: "8px 14px", fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>+ ADD</button>}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 20, letterSpacing: 1 }}>{teamLoading ? "LOADING..." : `${team.length} MEMBERS · TAP TO MANAGE`}</div>
          {team.map(member => (
            <div key={member.id} style={{ ...s.machineCard, borderLeft: `4px solid ${member.active ? ROLE_COLORS[member.role] : "#333"}`, opacity: member.active ? 1 : 0.5 }}
              onClick={() => { setSelectedMemberId(member.id); setScreen(SCREENS.TEAM_MEMBER); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...s.avatar(member.role), opacity: member.active ? 1 : 0.5 }}>{member.avatar}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: member.active ? "#e8e8e0" : "#555" }}>{member.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <span style={s.roleTag(member.role)}>{member.role}</span>
                    {!member.active && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#e74c3c", border: "1px solid #e74c3c", padding: "2px 6px" }}>INACTIVE</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#555" }}>›</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── TEAM MEMBER DETAIL ──
  if (screen === SCREENS.TEAM_MEMBER) {
    const member = selectedMember();
    if (!member) return null;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.TEAM)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ ...s.avatar(member.role), width: 56, height: 56, fontSize: 18 }}>{member.avatar}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{member.name}</div>
              <span style={s.roleTag(member.role)}>{member.role}</span>
            </div>
          </div>

          <div style={s.sectionTitle}>Role Assignment</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Tap a role to assign it. Changes take effect immediately.</div>
          {ALL_ROLES.map(role => (
            <button key={role} onClick={() => { if (member.id !== currentUser?.id) updateMemberRole(member.id, role); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: member.role === role ? ROLE_COLORS[role] + "18" : "#161a23",
                border: `2px solid ${member.role === role ? ROLE_COLORS[role] : "#2a2e3a"}`,
                padding: "14px 16px", marginBottom: 10, cursor: member.id === currentUser?.id ? "not-allowed" : "pointer",
                width: "100%", textAlign: "left", fontFamily: "inherit", opacity: member.id === currentUser?.id ? 0.5 : 1,
              }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: member.role === role ? ROLE_COLORS[role] : "#e8e8e0", textTransform: "uppercase", letterSpacing: 1 }}>{role}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{ROLE_DESCRIPTIONS[role]}</div>
              </div>
              {member.role === role && <div style={{ color: ROLE_COLORS[role], fontSize: 20, fontWeight: 800 }}>✓</div>}
            </button>
          ))}
          {member.id === currentUser?.id && <div style={{ fontSize: 12, color: "#555", textAlign: "center", marginTop: -4, marginBottom: 16 }}>You cannot change your own role.</div>}

          <div style={s.sectionTitle}>Account Status</div>
          {member.active ? (
            <div>
              <div style={{ background: "#0f2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#2ecc71" }}>● Active — can log in and use ShopGuard</div>
              {member.id !== currentUser?.id && (
                <button style={{ ...s.primaryBtn, background: "#1a0a0a", border: "2px solid #e74c3c", color: "#e74c3c" }}
                  onClick={() => setTeam(prev => prev.map(m => m.id === member.id ? { ...m, active: false } : m))}>
                  DEACTIVATE EMPLOYEE
                </button>
              )}
              <div style={{ fontSize: 11, color: "#555", marginTop: 8, lineHeight: 1.5 }}>Deactivating locks them out immediately but keeps all their records and history intact for OSHA documentation.</div>
            </div>
          ) : (
            <div>
              <div style={{ background: "#2a0a0a", border: "1px solid #e74c3c", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#e74c3c" }}>● Inactive — locked out of ShopGuard</div>
              <button style={{ ...s.primaryBtn, background: "#0f2a1a", border: "2px solid #2ecc71", color: "#2ecc71" }}
                onClick={() => setTeam(prev => prev.map(m => m.id === member.id ? { ...m, active: true } : m))}>
                ↩ REACTIVATE EMPLOYEE
              </button>
            </div>
          )}

          <div style={s.sectionTitle}>Training Status</div>
          <div style={{ background: "#161a23", border: "1px solid #2a2e3a", padding: "14px 16px" }}>
            <div style={{ marginBottom: 8 }}>
              {member.trained.map(t => <span key={t} style={s.badge("green")}>{t}</span>)}
              {member.missing.map(t => <span key={t} style={s.badge("red")}>MISSING: {t}</span>)}
            </div>
            {member.expiring && <div style={{ fontSize: 12, color: "#f39c12" }}>⚠ {member.expiring}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── LOTOTO PROCEDURE ──
  if (screen === SCREENS.LOTOTO) {
    const m = selectedMachine();
    if (!m) return null;
    const myLock = m.activeLocks.find(l => l.by === currentUser?.name);
    const allDone = lototoChecks.every(s => s.done);

    if (lototoComplete) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e74c3c", letterSpacing: 2, marginBottom: 8 }}>MACHINE LOCKED OUT</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 4, textAlign: "center" }}>{m.name}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 32 }}>Lock placed by {currentUser?.name} · Just now</div>
          <div style={{ background: "#2a0a0a", border: "2px solid #e74c3c", padding: "14px 20px", fontSize: 13, color: "#e74c3c", marginBottom: 24, textAlign: "center", width: "100%", boxSizing: "border-box" }}>
            🔒 Your personal lock is now active on this machine.<br />Only YOU can remove it.
          </div>
          <button style={{ ...s.primaryBtn, width: "100%" }} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK TO MACHINE</button>
        </div>
      </div>
    );

    // View if machine already locked by someone else (or me)
    if (myLock && !lototoStarted) return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17, color: "#e74c3c" }}>🔒 LOCKED OUT</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{m.name}</div>
          <div style={{ fontSize: 13, color: "#e74c3c", marginBottom: 20, fontWeight: 700 }}>YOUR LOCK IS ACTIVE</div>
          <div style={{ background: "#2a0a0a", border: "2px solid #e74c3c", padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e74c3c", marginBottom: 8 }}>🔒 {currentUser?.name}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Applied {timeAgo(myLock.ts)}</div>
            {myLock.reason && <div style={{ fontSize: 13, color: "#ccc", fontStyle: "italic" }}>"{myLock.reason}"</div>}
          </div>
          {!removingLock ? (
            <button style={{ ...s.dangerBtn }} onClick={() => setRemovingLock(true)}>🔓 REMOVE MY LOCK</button>
          ) : (
            <div style={{ background: "#1a0a0a", border: "2px solid #e74c3c", padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e74c3c", marginBottom: 12 }}>Confirm lock removal?</div>
              <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>Only remove your lock when work is complete and the machine is safe to operate.</div>
              <button style={{ ...s.dangerBtn, marginBottom: 10 }} onClick={() => removeLock(m.id)}>YES — REMOVE MY LOCK</button>
              <button style={{ ...s.backBtn, width: "100%", padding: 12 }} onClick={() => setRemovingLock(false)}>CANCEL</button>
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17, color: "#f39c12" }}>⚡ LOTOTO</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 13, color: "#888", letterSpacing: 1, marginBottom: 4 }}>LOCKOUT / TAGOUT PROCEDURE</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{m.name}</div>

          {/* Active locks by others */}
          {m.activeLocks.filter(l => l.by !== currentUser?.name).length > 0 && (
            <div style={{ background: "#2a0a0a", border: "2px solid #e74c3c", padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e74c3c", marginBottom: 8, letterSpacing: 1 }}>🔒 ACTIVE LOCKS ON THIS MACHINE</div>
              {m.activeLocks.filter(l => l.by !== currentUser?.name).map((lock, i) => (
                <div key={i} style={{ fontSize: 13, color: "#ccc", marginBottom: 4 }}>🔒 {lock.by} · {timeAgo(lock.ts)}</div>
              ))}
            </div>
          )}

          {!lototoStarted ? (
            <div>
              <div style={{ background: "#2a1500", border: "1px solid #f39c12", padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f39c12", marginBottom: 8 }}>⚠ READ BEFORE PROCEEDING</div>
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>You are about to initiate a lockout procedure. Follow every step in order. Do not skip steps. Your personal lock must remain on until work is complete.</div>
              </div>
              <label style={s.formLabel}>Reason for lockout</label>
              <input style={s.input} placeholder="e.g. Blade guard replacement, jam clearance..." value={lototoReason} onChange={e => setLototoReason(e.target.value)} />
              <button style={{ ...s.primaryBtn, background: "#f39c12", opacity: lototoReason.trim() ? 1 : 0.4 }} disabled={!lototoReason.trim()} onClick={() => setLototoStarted(true)}>
                ⚡ START LOCKOUT PROCEDURE
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: "#f39c12", fontWeight: 700, marginBottom: 16 }}>
                {lototoChecks.filter(s => s.done).length}/{lototoChecks.length} steps complete
              </div>
              {lototoChecks.map((step, idx) => (
                <div key={step.id} style={s.lototoStep(step.done)}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div onClick={() => setLototoChecks(prev => prev.map(s => s.id === step.id ? { ...s, done: !s.done } : s))}
                      style={{ width: 28, height: 28, border: `2px solid ${step.done ? "#2ecc71" : "#f39c12"}`, background: step.done ? "#2ecc71" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, color: "#000", fontWeight: 800, cursor: "pointer", marginTop: 2 }}>
                      {step.done ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ background: "#f39c12", color: "#000", fontWeight: 800, fontSize: 11, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: step.done ? "#2ecc71" : "#e8e8e0", textDecoration: step.done ? "line-through" : "none" }}>{step.title}</div>
                      </div>
                      {step.energyType && <div style={{ fontSize: 11, color: "#f39c12", fontWeight: 700, marginBottom: 6 }}>{step.energyType}</div>}
                      <div style={{ fontSize: 13, color: step.done ? "#888" : "#ccc", lineHeight: 1.5 }}>{step.description}</div>
                    </div>
                  </div>
                </div>
              ))}

              {allDone && (
                <div style={{ background: "#161a23", border: "2px solid #f39c12", padding: 16, marginTop: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f39c12", marginBottom: 8 }}>ALL STEPS COMPLETE</div>
                  <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>By tapping below you confirm all energy sources are isolated and your personal lock is applied.</div>
                  <button style={{ ...s.primaryBtn, background: "#e74c3c" }} onClick={submitLototo}>
                    🔒 CONFIRM & PLACE MY LOCK
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LOTOTO ACTIVE VIEW (read-only for workers) ──
  if (screen === SCREENS.LOTOTO_ACTIVE) {
    const m = selectedMachine();
    if (!m) return null;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17, color: "#e74c3c" }}>🔒 LOCKED OUT</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{m.name}</div>
          <div style={{ fontSize: 13, color: "#e74c3c", marginBottom: 20, fontWeight: 700, letterSpacing: 1 }}>THIS MACHINE IS CURRENTLY LOCKED OUT</div>
          <div style={{ background: "#2a0a0a", border: "2px solid #e74c3c", padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e74c3c", marginBottom: 12, letterSpacing: 1 }}>🔒 ACTIVE LOCKS</div>
            {m.activeLocks.map((lock, i) => (
              <div key={i} style={{ borderBottom: i < m.activeLocks.length - 1 ? "1px solid #3a1a1a" : "none", paddingBottom: i < m.activeLocks.length - 1 ? 10 : 0, marginBottom: i < m.activeLocks.length - 1 ? 10 : 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#e74c3c" }}>🔒 {lock.by}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{timeAgo(lock.ts)}</div>
                {lock.reason && <div style={{ fontSize: 12, color: "#aaa", marginTop: 4, fontStyle: "italic" }}>"{lock.reason}"</div>}
              </div>
            ))}
          </div>
          <div style={{ background: "#161a23", border: "1px solid #2a2e3a", padding: "12px 14px", fontSize: 13, color: "#888" }}>
            Do not attempt to operate this machine. Contact the person listed above if you have questions.
          </div>
        </div>
      </div>
    );
  }

  // ── PENDING SOPS ──
  if (screen === SCREENS.PENDING_SOPS) {
    const pending = machines.filter(m => m.pendingSop);
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 20 }}>PENDING SOP REVIEWS</div>
          {pending.length === 0 && <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 32, textAlign: "center" }}><div style={{ fontSize: 13, color: "#555" }}>No SOPs waiting for review.</div></div>}
          {pending.map(m => (
            <div key={m.id} style={{ background: "#161a23", border: "2px solid #a070ff", padding: 16, marginBottom: 12, cursor: "pointer" }}
              onClick={() => { setSelectedMachineId(m.id); setReviewAction(null); setShowRejectInput(false); setRejectReason(""); setScreen(SCREENS.SOP_REVIEW); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{m.name}</div>
                <span style={s.badge("purple")}>PENDING</span>
              </div>
              <div style={{ fontSize: 13, color: "#888" }}>From {m.pendingSop.submittedBy} · {timeAgo(m.pendingSop.submittedTs)} · {m.pendingSop.steps.length} steps</div>
              {m.pendingSop.note && <div style={{ fontSize: 12, color: "#aaa", marginTop: 8, borderLeft: "2px solid #a070ff", paddingLeft: 10, fontStyle: "italic" }}>"{m.pendingSop.note}"</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── SOP REVIEW ──
  if (screen === SCREENS.SOP_REVIEW) {
    const m = selectedMachine();
    if (reviewAction) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>{reviewAction === "approved" ? "✓" : "✕"}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: reviewAction === "approved" ? "#2ecc71" : "#e74c3c", letterSpacing: 2, marginBottom: 8 }}>{reviewAction === "approved" ? "SOP APPROVED & LIVE" : "SOP REJECTED"}</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 32, textAlign: "center" }}>{reviewAction === "approved" ? `${m?.name} SOP is now live.` : `Worker will be notified.`}</div>
          <button style={{ ...s.primaryBtn, width: 220 }} onClick={() => { setReviewAction(null); setScreen(SCREENS.PENDING_SOPS); }}>← BACK TO REVIEWS</button>
        </div>
      </div>
    );
    if (!m?.pendingSop) return null;
    const pending = m.pendingSop;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.PENDING_SOPS)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>SOP REVIEW</div></div>
        <div style={s.content}>
          <div style={{ background: "#1a1a3a", border: "2px solid #a070ff", padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{m.name}</div>
            <div style={{ fontSize: 13, color: "#aaa" }}>By {pending.submittedBy} · {timeAgo(pending.submittedTs)} · {pending.steps.length} steps</div>
            {pending.note && <div style={{ fontSize: 13, color: "#ccc", marginTop: 10, borderLeft: "2px solid #a070ff", paddingLeft: 10, fontStyle: "italic" }}>"{pending.note}"</div>}
          </div>
          {pending.steps.map((step, idx) => (
            <div key={step.id} style={{ background: "#161a23", border: "1px solid #2a2e3a", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #1f2330", background: "#1a1a23" }}>
                <div style={{ background: "#ff6b00", color: "#000", fontWeight: 800, fontSize: 12, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{step.title}</div>
              </div>
              <div style={{ padding: "10px 14px" }}>
                {step.photo && <div style={{ background: "#1a2a1a", border: "1px solid #2ecc71", padding: "10px", fontSize: 12, color: "#2ecc71", marginBottom: 8, textAlign: "center" }}>📷 Photo attached</div>}
                {step.description && <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: step.warning ? 8 : 0 }}>{step.description}</div>}
                {step.warning && <div style={{ background: "#2a1500", border: "1px solid #f39c12", padding: "6px 10px", fontSize: 12, color: "#f39c12", fontWeight: 700 }}>⚠ {step.warning}</div>}
              </div>
            </div>
          ))}
          <button style={{ ...s.primaryBtn, background: "#2ecc71", marginBottom: 10 }} onClick={() => approvePendingSop(m.id)}>✓ APPROVE & PUBLISH</button>
          {!showRejectInput ? (
            <button style={{ ...s.primaryBtn, background: "#1a0a0a", border: "2px solid #e74c3c", color: "#e74c3c" }} onClick={() => setShowRejectInput(true)}>✕ REJECT WITH FEEDBACK</button>
          ) : (
            <div style={{ background: "#1a0a0a", border: "2px solid #e74c3c", padding: 16 }}>
              <label style={{ ...s.formLabel, color: "#e74c3c" }}>Reason for rejection</label>
              <textarea style={s.textarea} placeholder="Tell the worker what needs to change..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              <button style={{ ...s.dangerBtn, fontSize: 15, padding: "12px 0", opacity: rejectReason.trim() ? 1 : 0.4 }} disabled={!rejectReason.trim()} onClick={() => rejectPendingSop(m.id)}>SEND REJECTION</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SOP BUILD ──
  if (screen === SCREENS.SOP_BUILD) {
    const m = selectedMachine();
    const isWorker = !isSupervisor();
    if (sopSubmittedForReview) return <div style={s.app}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, textAlign: "center" }}><div style={{ fontSize: 64, marginBottom: 16 }}>📋</div><div style={{ fontSize: 22, fontWeight: 800, color: "#a070ff", letterSpacing: 2, marginBottom: 8 }}>SUBMITTED FOR REVIEW</div><div style={{ fontSize: 14, color: "#888" }}>Your supervisor will review and approve your SOP.</div></div></div>;
    if (sopPublished) return <div style={s.app}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><div style={{ fontSize: 64, marginBottom: 16 }}>✓</div><div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>SOP PUBLISHED</div><div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Live on {m?.name}</div></div></div>;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => { setScreen(SCREENS.MACHINE_DETAIL); setSopSteps([]); setEditingStepId(null); setSopNote(""); }}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>SOP BUILDER</div></div>
        <div style={s.content}>
          {isWorker && <div style={{ background: "#1a2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#2ecc71" }}>✏️ Writing a draft — supervisor approves before it goes live.</div>}
          <div style={{ fontSize: 13, color: "#888", marginBottom: 4, letterSpacing: 1 }}>BUILDING SOP FOR</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>{m?.name}</div>
          {sopSteps.length === 0 && <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 32, textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div><div style={{ fontSize: 14, color: "#888" }}>No steps yet. Add your first step below.</div></div>}
          {sopSteps.map((step, idx) => (
            <div key={step.id} style={{ background: "#161a23", border: `2px solid ${editingStepId === step.id ? "#ff6b00" : "#2a2e3a"}`, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #2a2e3a", gap: 10 }}>
                <div style={{ background: "#ff6b00", color: "#000", fontWeight: 800, fontSize: 13, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: step.title ? "#e8e8e0" : "#555" }}>{step.title || "Untitled step"}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => moveSopStep(step.id, -1)} style={{ ...s.backBtn, padding: "3px 7px", fontSize: 11 }}>↑</button>
                  <button onClick={() => moveSopStep(step.id, 1)} style={{ ...s.backBtn, padding: "3px 7px", fontSize: 11 }}>↓</button>
                  <button onClick={() => setEditingStepId(editingStepId === step.id ? null : step.id)} style={{ ...s.backBtn, padding: "3px 7px", fontSize: 11, color: "#ff6b00", borderColor: "#ff6b00" }}>{editingStepId === step.id ? "DONE" : "EDIT"}</button>
                  <button onClick={() => deleteSopStep(step.id)} style={{ ...s.backBtn, padding: "3px 7px", fontSize: 11, color: "#e74c3c", borderColor: "#e74c3c" }}>✕</button>
                </div>
              </div>
              {editingStepId === step.id ? (
                <div style={{ padding: 14 }}>
                  <label style={s.formLabel}>Step Title *</label>
                  <input style={s.input} placeholder="e.g. Put on PPE" value={step.title} onChange={e => updateSopStep(step.id, "title", e.target.value)} />
                  <label style={s.formLabel}>Instructions</label>
                  <textarea style={s.textarea} placeholder="Describe what the worker should do..." value={step.description} onChange={e => updateSopStep(step.id, "description", e.target.value)} />
                  <label style={s.formLabel}>⚠ Warning (optional)</label>
                  <input style={{ ...s.input, borderColor: step.warning ? "#f39c12" : "#333", color: "#f39c12" }} placeholder="e.g. Never reach inside without LOTOTO" value={step.warning || ""} onChange={e => updateSopStep(step.id, "warning", e.target.value)} />
                  <label style={s.formLabel}>Photo</label>
                  {step.photo ? (
                    <div style={{ marginBottom: 12 }}>
                      {step.photo === "simulated"
                        ? <div style={{ background: "#1a2a1a", border: "2px solid #2ecc71", padding: "16px", fontSize: 13, color: "#2ecc71", textAlign: "center", marginBottom: 8 }}>📷 PHOTO ATTACHED</div>
                        : <img src={step.photo} alt="" style={{ width: "100%", border: "2px solid #2ecc71", marginBottom: 8 }} />}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...s.backBtn, flex: 1, padding: 10, fontSize: 12 }} onClick={() => updateSopStep(step.id, "photo", null)}>REMOVE</button>
                        <button style={{ ...s.primaryBtn, flex: 2, padding: 10, fontSize: 13 }} onClick={() => openCamera(`sop:${step.id}`)}>📷 REPLACE</button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...s.primaryBtn, background: "#161a23", border: "2px dashed #ff6b00", color: "#ff6b00", padding: 14, marginBottom: 12 }} onClick={() => openCamera(`sop:${step.id}`)}>
                      📷 ADD PHOTO OF THIS STEP
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ padding: "10px 14px" }}>
                  {step.description && <div style={{ fontSize: 13, color: "#aaa" }}>{step.description.substring(0, 80)}{step.description.length > 80 ? "..." : ""}</div>}
                  {step.warning && <div style={{ fontSize: 12, color: "#f39c12", marginTop: 4 }}>⚠ {step.warning}</div>}
                  {!step.description && !step.warning && <div style={{ fontSize: 12, color: "#444" }}>Tap EDIT to add details</div>}
                </div>
              )}
            </div>
          ))}
          <button style={{ ...s.primaryBtn, background: "#1a2030", border: "2px dashed #4a9eff", color: "#4a9eff", marginBottom: 16 }} onClick={addSopStep}>+ ADD STEP</button>
          {sopSteps.some(st => st.title) && (
            isWorker ? (
              <>
                <label style={s.formLabel}>Note to supervisor (optional)</label>
                <textarea style={{ ...s.textarea, borderColor: "#a070ff" }} placeholder="Explain what you changed or why..." value={sopNote} onChange={e => setSopNote(e.target.value)} />
                <button style={{ ...s.primaryBtn, background: "#1a1a3a", border: "2px solid #a070ff", color: "#a070ff" }} onClick={submitSopForReview}>📋 SUBMIT FOR SUPERVISOR REVIEW</button>
              </>
            ) : (
              <button style={s.primaryBtn} onClick={publishSop}>✓ PUBLISH SOP ({sopSteps.filter(st => st.title).length} STEPS)</button>
            )
          )}
        </div>
      </div>
    );
  }

  // ── SOP VIEW ──
  if (screen === SCREENS.SOP_VIEW) {
    const m = selectedMachine();
    const steps = m?.sopSteps || [];
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>SOP</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 4, letterSpacing: 1 }}>STANDARD OPERATING PROCEDURE</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{m?.name}</div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 20, letterSpacing: 1 }}>{steps.length} STEPS</div>
          {steps.map((step, idx) => (
            <div key={step.id} style={{ background: "#161a23", border: "1px solid #2a2e3a", marginBottom: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid #1f2330", background: "#1a1a23" }}>
                <div style={{ background: "#ff6b00", color: "#000", fontWeight: 800, fontSize: 14, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{step.title}</div>
              </div>
              <div style={{ padding: "12px 14px" }}>
                {step.description && <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6, marginBottom: step.warning ? 10 : 0 }}>{step.description}</div>}
                {step.warning && <div style={{ background: "#2a1500", border: "1px solid #f39c12", padding: "8px 12px", fontSize: 13, color: "#f39c12", fontWeight: 700 }}>⚠ {step.warning}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── MACHINE INSPECT ──
  if (screen === SCREENS.MACHINE_INSPECT) {
    const m = selectedMachine();
    if (!m) return null;
    const allChecked = inspectChecks.every(i => i.checked);
    const checkedCount = inspectChecks.filter(i => i.checked).length;
    if (inspectDone) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2, marginBottom: 8 }}>INSPECTION LOGGED</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 4 }}>{m.name}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 32 }}>Signed by {currentUser?.name} · Just now</div>
          <div style={{ background: "#0f2a1a", border: "1px solid #2ecc71", padding: "12px 20px", fontSize: 13, color: "#2ecc71", marginBottom: 24, textAlign: "center" }}>✓ "Last Inspected" updated to: Just now</div>
          <button style={{ ...s.primaryBtn, width: 220 }} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK TO MACHINE</button>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>INSPECTION</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{m.name}</div>
          <div style={{ fontSize: 13, color: checkedCount === inspectChecks.length ? "#2ecc71" : "#ff6b00", fontWeight: 700, marginBottom: 16 }}>{checkedCount}/{inspectChecks.length} items checked</div>
          {inspectChecks.map(item => (
            <div key={item.id} style={s.checkItem(item.checked)} onClick={() => setInspectChecks(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}>
              <div style={s.checkbox(item.checked)}>{item.checked ? "✓" : ""}</div>
              <div style={s.checkLabel(item.checked)}>{item.item}</div>
            </div>
          ))}
          {allChecked && (
            <div style={{ background: "#161a23", border: "2px solid #ff6b00", padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ff6b00", marginBottom: 12 }}>SIGN OFF TO COMPLETE</div>
              <div style={{ background: "#0f2a1a", border: "1px solid #2ecc71", padding: "10px 14px", fontSize: 14, color: "#2ecc71", marginBottom: 12 }}>Signing as: {currentUser?.name}</div>
              <label style={s.formLabel}>Notes (optional)</label>
              <textarea style={{ ...s.textarea, minHeight: 60 }} placeholder="Any issues or observations..." value={inspectNotes} onChange={e => setInspectNotes(e.target.value)} />
              <button style={s.primaryBtn} onClick={submitInspection}>✓ SIGN & LOG INSPECTION</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── INSPECTION LOG ──
  if (screen === SCREENS.INSPECTION_LOG) {
    const m = selectedMachine();
    if (!m) return null;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINE_DETAIL)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>INSPECTION LOG</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>{m.name}</div>
          {m.inspectionLog.length === 0 && <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 32, textAlign: "center" }}><div style={{ fontSize: 13, color: "#555" }}>No inspections logged yet.</div></div>}
          {m.inspectionLog.map((entry, i) => (
            <div key={i} style={s.logEntry}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{entry.by}</div><span style={s.badge("green")}>PASSED</span></div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: entry.notes ? 8 : 0 }}>{new Date(entry.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {timeAgo(entry.ts)}</div>
              {entry.notes && <div style={{ fontSize: 13, color: "#ccc", fontStyle: "italic" }}>"{entry.notes}"</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── CHECKLIST EDIT (supervisor only) ──
  if (screen === SCREENS.CHECKLIST_EDIT) {
    const m = selectedMachine();
    if (!m) return null;
    return (
      <div style={s.app}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => { setScreen(SCREENS.MACHINE_DETAIL); setNewChecklistItem(""); }}>← BACK</button>
          <div style={{ ...s.logo, fontSize: 17 }}>EDIT CHECKLIST</div>
        </div>
        <div style={s.content}>
          <div style={{ background: "#1a2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#2ecc71" }}>
            Supervisor access — customizing inspection checklist for {m.name}
          </div>

          <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            Current Items ({editingChecklist.length})
          </div>

          {editingChecklist.length === 0 && (
            <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 24, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#555" }}>No checklist items yet. Add some below.</div>
            </div>
          )}

          {editingChecklist.map((item, idx) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#161a23", border: "1px solid #2a2e3a", padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ background: "#ff6b00", color: "#000", fontWeight: 800, fontSize: 11, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
              <input
                style={{ ...s.input, marginBottom: 0, flex: 1, fontSize: 14, padding: "8px 10px" }}
                value={item.item}
                onChange={e => setEditingChecklist(prev => prev.map(i => i.id === item.id ? { ...i, item: e.target.value } : i))}
              />
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => setEditingChecklist(prev => {
                  const next = [...prev];
                  const i = next.findIndex(x => x.id === item.id);
                  if (i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  return next;
                })} style={{ ...s.backBtn, padding: "4px 7px", fontSize: 11 }}>↑</button>
                <button onClick={() => setEditingChecklist(prev => {
                  const next = [...prev];
                  const i = next.findIndex(x => x.id === item.id);
                  if (i < next.length - 1) [next[i], next[i + 1]] = [next[i + 1], next[i]];
                  return next;
                })} style={{ ...s.backBtn, padding: "4px 7px", fontSize: 11 }}>↓</button>
                <button onClick={() => setEditingChecklist(prev => prev.filter(i => i.id !== item.id))}
                  style={{ ...s.backBtn, padding: "4px 7px", fontSize: 11, color: "#e74c3c", borderColor: "#e74c3c" }}>✕</button>
              </div>
            </div>
          ))}

          {/* Add new item */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 20 }}>
            <input
              style={{ ...s.input, marginBottom: 0, flex: 1 }}
              placeholder="Add checklist item..."
              value={newChecklistItem}
              onChange={e => setNewChecklistItem(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newChecklistItem.trim()) {
                  setEditingChecklist(prev => [...prev, { id: Date.now(), item: newChecklistItem.trim(), checked: false }]);
                  setNewChecklistItem("");
                }
              }}
            />
            <button
              style={{ ...s.primaryBtn, width: "auto", padding: "12px 16px", opacity: newChecklistItem.trim() ? 1 : 0.4 }}
              disabled={!newChecklistItem.trim()}
              onClick={() => {
                setEditingChecklist(prev => [...prev, { id: Date.now(), item: newChecklistItem.trim(), checked: false }]);
                setNewChecklistItem("");
              }}>
              + ADD
            </button>
          </div>

          <button
            style={{ ...s.primaryBtn, opacity: editingChecklist.length > 0 ? 1 : 0.4 }}
            disabled={editingChecklist.length === 0}
            onClick={() => {
              setMachines(prev => prev.map(mac => mac.id === selectedMachineId ? { ...mac, inspectionChecklist: editingChecklist } : mac));
              setScreen(SCREENS.MACHINE_DETAIL);
              setNewChecklistItem("");
            }}>
            ✓ SAVE CHECKLIST
          </button>
        </div>
      </div>
    );
  }

  // ── MACHINE DETAIL ──
  if (screen === SCREENS.MACHINE_DETAIL) {
    const m = selectedMachine();
    if (!m) return null;
    const st = inspectionStatus(m.lastInspectedTs);
    const isLockedOut = m.activeLocks.length > 0;
    const myLock = m.activeLocks.find(l => l.by === currentUser?.name);
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINES)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={s.statusDot(isLockedOut ? "critical" : st)}></div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{m.name}</div>
          </div>

          {/* Lockout warning */}
          {isLockedOut && (
            <div style={{ background: "#2a0a0a", border: "2px solid #e74c3c", padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e74c3c", marginBottom: 6 }}>🔒 MACHINE IS LOCKED OUT</div>
              {m.activeLocks.map((lock, i) => <div key={i} style={{ fontSize: 12, color: "#aaa" }}>🔒 {lock.by} · {timeAgo(lock.ts)}</div>)}
            </div>
          )}

          {/* Last inspected */}
          <div style={{ background: st === "ok" ? "#0f2a1a" : st === "warning" ? "#2a1a00" : "#2a0a0a", border: `2px solid ${st === "ok" ? "#2ecc71" : st === "warning" ? "#f39c12" : "#e74c3c"}`, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#888", marginBottom: 4, textTransform: "uppercase" }}>Last Inspected</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: st === "ok" ? "#2ecc71" : st === "warning" ? "#f39c12" : "#e74c3c" }}>{timeAgo(m.lastInspectedTs)}</div>
            {m.inspectionLog[0] && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>by {m.inspectionLog[0].by}</div>}
          </div>

          <div style={s.detailRow}><span style={s.detailLabel}>SOP</span><span style={s.badge(m.sop ? "green" : "red")}>{m.sop ? `ON FILE (${m.sopSteps?.length || 0} steps)` : "MISSING"}</span></div>
          <div style={s.detailRow}><span style={s.detailLabel}>LOTOTO</span><span style={s.badge(m.lototo ? "green" : "red")}>{m.lototo ? "ON FILE" : "MISSING"}</span></div>
          <div style={{ padding: "10px 0", borderBottom: "1px solid #1f2330" }}>
            <div style={s.detailLabel}>PPE REQUIRED</div>
            <div style={{ marginTop: 8 }}>{m.ppe.map(p => <span key={p} style={s.badge("green")}>{p}</span>)}</div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={s.sectionTitle}>Inspection</div>
            <button style={s.primaryBtn} onClick={() => startInspection(m)}>✓ RUN INSPECTION NOW</button>
            {isMaintenance() && (
              <>
                <div style={{ height: 10 }} />
                <button style={{ ...s.primaryBtn, background: "#161a23", border: "1px solid #4a9eff", color: "#4a9eff" }} onClick={() => setScreen(SCREENS.INSPECTION_LOG)}>📋 VIEW LOG ({m.inspectionLog.length})</button>
              </>
            )}
            {isSupervisor() && (
              <>
                <div style={{ height: 10 }} />
                <button style={{ ...s.primaryBtn, background: "#161a23", border: "1px solid #a070ff", color: "#a070ff" }}
                  onClick={() => { setEditingChecklist([...m.inspectionChecklist]); setScreen(SCREENS.CHECKLIST_EDIT); }}>
                  ✏️ EDIT INSPECTION CHECKLIST ({m.inspectionChecklist.length} items)
                </button>
              </>
            )}

            {/* LOTOTO — only maintenance and supervisor */}
            {isMaintenance() && m.lototo && (
              <>
                <div style={s.sectionTitle}>LOTOTO</div>
                {myLock ? (
                  <button style={{ ...s.primaryBtn, background: "#2a0a0a", border: "2px solid #e74c3c", color: "#e74c3c" }} onClick={() => startLototo(m)}>🔒 MANAGE MY LOCK</button>
                ) : (
                  <button style={{ ...s.primaryBtn, background: "#2a1500", border: "2px solid #f39c12", color: "#f39c12" }} onClick={() => startLototo(m)}>⚡ INITIATE LOCKOUT</button>
                )}
              </>
            )}
            {!isMaintenance() && m.lototo && isLockedOut && (
              <>
                <div style={s.sectionTitle}>LOTOTO</div>
                <button style={{ ...s.primaryBtn, background: "#2a0a0a", border: "1px solid #e74c3c", color: "#e74c3c" }} onClick={() => setScreen(SCREENS.LOTOTO_ACTIVE)}>🔒 VIEW LOCKOUT STATUS</button>
              </>
            )}

            <div style={s.sectionTitle}>SOP</div>
            {m.pendingSop && !isSupervisor() && (
              <div style={{ background: "#1a1a3a", border: "2px solid #a070ff", padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#a070ff", marginBottom: 4 }}>⏳ SOP PENDING REVIEW</div>
                <div style={{ fontSize: 12, color: "#888" }}>From {m.pendingSop.submittedBy} · {timeAgo(m.pendingSop.submittedTs)}</div>
                {m.pendingSop.rejected && <div style={{ fontSize: 12, color: "#e74c3c", marginTop: 6, fontWeight: 700 }}>✕ Rejected: {m.pendingSop.rejectReason}</div>}
              </div>
            )}
            {m.pendingSop && isSupervisor() && (
              <div style={{ background: "#1a1a3a", border: "2px solid #a070ff", padding: "12px 14px", marginBottom: 10, cursor: "pointer" }} onClick={() => { setReviewAction(null); setShowRejectInput(false); setScreen(SCREENS.SOP_REVIEW); }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#a070ff" }}>⏳ SOP AWAITING YOUR REVIEW →</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>From {m.pendingSop.submittedBy} · {m.pendingSop.steps.length} steps</div>
              </div>
            )}
            {m.sop && m.sopSteps?.length > 0 && <button style={{ ...s.primaryBtn, marginBottom: 10 }} onClick={() => setScreen(SCREENS.SOP_VIEW)}>📋 VIEW SOP ({m.sopSteps.length} STEPS)</button>}
            {!m.pendingSop && (
              <button style={{ ...s.primaryBtn, background: "#1a2030", border: `2px solid ${isSupervisor() ? "#ff6b00" : "#a070ff"}`, color: isSupervisor() ? "#ff6b00" : "#a070ff", marginBottom: 16 }}
                onClick={() => { setSopSteps(m.sopSteps?.length ? [...m.sopSteps] : []); setSopNote(""); setScreen(SCREENS.SOP_BUILD); }}>
                ✏️ {m.sop && m.sopSteps?.length ? (isSupervisor() ? "EDIT SOP" : "SUGGEST EDITS") : (isSupervisor() ? "CREATE SOP" : "WRITE DRAFT SOP")}
              </button>
            )}
            {m.pendingSop?.rejected && !isSupervisor() && (
              <button style={{ ...s.primaryBtn, background: "#1a2030", border: "2px solid #a070ff", color: "#a070ff", marginBottom: 16 }}
                onClick={() => { setSopSteps([...m.pendingSop.steps]); setSopNote(""); setScreen(SCREENS.SOP_BUILD); }}>
                ✏️ REVISE AND RESUBMIT
              </button>
            )}

            <div style={s.sectionTitle}>Actions</div>
            <button style={{ ...s.primaryBtn, background: "#1a1a2a", color: "#e74c3c", border: "1px solid #e74c3c" }}
              onClick={() => { setNewIncident(p => ({ ...p, location: m.name })); setScreen(SCREENS.INCIDENT_NEW); }}>
              🚨 REPORT INCIDENT HERE
            </button>
            {isSupervisor() && (
              <div style={{ marginTop: 10 }}>
                {!confirmRemove ? (
                  <button style={{ ...s.primaryBtn, background: "none", border: "1px solid #3a1a1a", color: "#555", marginTop: 0 }} onClick={() => setConfirmRemove(true)}>
                    REMOVE THIS MACHINE
                  </button>
                ) : (
                  <div style={{ background: "#1a0a0a", border: "2px solid #e74c3c", padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e74c3c", marginBottom: 8 }}>Remove {m.name}?</div>
                    <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>This will permanently delete this machine and all its records. This cannot be undone.</div>
                    <button style={{ ...s.dangerBtn, fontSize: 14, padding: "12px 0", marginBottom: 10 }} onClick={() => { setMachines(prev => prev.filter(mac => mac.id !== m.id)); setConfirmRemove(false); setScreen(SCREENS.MACHINES); }}>
                      YES — REMOVE MACHINE
                    </button>
                    <button style={{ ...s.backBtn, width: "100%", padding: 12 }} onClick={() => setConfirmRemove(false)}>CANCEL</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  async function submitNewMachine() {
    const ppeList = newMachine.ppe ? newMachine.ppe.split(",").map(p => p.trim()).filter(Boolean) : [];

    const { data, error } = await supabase
      .from("machines")
      .insert({
        company_id: COMPANY_ID,
        name: newMachine.name.trim(),
        requires_loto: newMachine.lototo,
        ppe: ppeList,
        active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save machine:", error);
      alert("Failed to save machine. Please try again.");
      return;
    }

    const m = {
      id: data.id,
      name: newMachine.name,
      lastInspectedTs: null,
      sop: false,
      lototo: newMachine.lototo,
      ppe: ppeList,
      activeLocks: [],
      lototoSteps: [],
      inspectionLog: [],
      inspectionChecklist: [
        { id: 1, item: "Visual inspection — no visible damage" },
        { id: 2, item: "Guards and safety devices in place" },
        { id: 3, item: "No fluid leaks" },
        { id: 4, item: "Area around machine clear" },
      ],
      sopSteps: [],
      pendingSop: null,
    };
    setMachines(prev => [...prev, m]);
    setMachineAdded(true);
    setTimeout(() => { setMachineAdded(false); setNewMachine({ name: "", ppe: "", lototo: false, sop: false }); setScreen(SCREENS.MACHINES); }, 1800);
  }

  // ── ADD MACHINE (supervisor only) ──
  if (screen === SCREENS.MACHINE_ADD) {
    if (machineAdded) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>MACHINE ADDED</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>{newMachine.name}</div>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINES)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>ADD MACHINE</div></div>
        <div style={s.content}>
          <div style={{ background: "#1a2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#2ecc71" }}>
            Supervisor access — only you can add or remove machines.
          </div>

          <label style={s.formLabel}>Machine Name *</label>
          <input style={s.input} placeholder="e.g. Cincinnati Press Brake #33" value={newMachine.name} onChange={e => setNewMachine(p => ({ ...p, name: e.target.value }))} />

          <label style={s.formLabel}>PPE Required</label>
          <input style={s.input} placeholder="e.g. Safety Glasses, Gloves, Steel Toes" value={newMachine.ppe} onChange={e => setNewMachine(p => ({ ...p, ppe: e.target.value }))} />
          <div style={{ fontSize: 11, color: "#555", marginTop: -8, marginBottom: 12 }}>Separate multiple items with commas</div>

          <label style={s.formLabel}>Requires LOTO?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[true, false].map(val => (
              <button key={String(val)} onClick={() => setNewMachine(p => ({ ...p, lototo: val }))}
                style={{ background: newMachine.lototo === val ? (val ? "#2a1500" : "#0f2a1a") : "#161a23", border: `2px solid ${newMachine.lototo === val ? (val ? "#f39c12" : "#2ecc71") : "#2a2e3a"}`, color: newMachine.lototo === val ? (val ? "#f39c12" : "#2ecc71") : "#888", padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>
                {val ? "YES" : "NO"}
              </button>
            ))}
          </div>

          <button style={{ ...s.primaryBtn, opacity: newMachine.name.trim() ? 1 : 0.4 }} disabled={!newMachine.name.trim()} onClick={submitNewMachine}>
            ✓ ADD MACHINE
          </button>
        </div>
      </div>
    );
  }

  // ── MACHINES LIST ──
  if (screen === SCREENS.MACHINES) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>MACHINES</div>
            <div style={{ display: "flex", gap: 8 }}>
              {isMaintenance() && <button onClick={() => setScreen(SCREENS.MAINTENANCE_SCHEDULE)} style={{ background: "#161a23", color: "#f39c12", border: "1px solid #f39c12", padding: "8px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>🔧 MAINT</button>}
              {isSupervisor() && <button onClick={() => setScreen(SCREENS.MACHINE_ADD)} style={{ background: "#ff6b00", color: "#000", border: "none", padding: "8px 14px", fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>+ ADD</button>}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 16, letterSpacing: 1 }}>TAP TO INSPECT OR VIEW DOCUMENTS</div>
          {machines.map(m => {
            const st = inspectionStatus(m.lastInspectedTs);
            const locked = m.activeLocks.length > 0;
            return (
              <div key={m.id} style={s.machineCard} onClick={() => { setSelectedMachineId(m.id); setScreen(SCREENS.MACHINE_DETAIL); }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: locked ? "#e74c3c" : st === "ok" ? "#2ecc71" : st === "warning" ? "#f39c12" : "#e74c3c", marginTop: 3, fontWeight: 700 }}>
                    {locked ? `🔒 LOCKED OUT (${m.activeLocks.length})` : timeAgo(m.lastInspectedTs)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.pendingSop && <span style={{ fontSize: 10, color: "#a070ff", fontWeight: 700 }}>PENDING</span>}
                  {!m.sop && <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 700 }}>NO SOP</span>}
                  <div style={s.statusDot(locked ? "critical" : st)}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── INCIDENTS ──
  if (screen === SCREENS.INCIDENT_NEW) {
    if (submitted) return <div style={s.app}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><div style={{ fontSize: 64, marginBottom: 16 }}>✓</div><div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>REPORT SUBMITTED</div></div></div>;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>NEW INCIDENT REPORT</div>
          <div style={{ background: "#0f2a1a", border: "1px solid #2ecc71", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#2ecc71" }}>Filing as: {currentUser?.name}</div>
          <label style={s.formLabel}>Incident Type</label>
          <select style={s.select} value={newIncident.type} onChange={e => setNewIncident(p => ({ ...p, type: e.target.value }))}><option value="">Select type...</option>{INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <label style={s.formLabel}>Severity</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {SEVERITY.map(sev => { const active = newIncident.severity === sev; const col = sev === "Critical" ? "#e74c3c" : sev === "High" ? "#f39c12" : sev === "Medium" ? "#4a9eff" : "#2ecc71"; return <button key={sev} onClick={() => setNewIncident(p => ({ ...p, severity: sev }))} style={{ background: active ? col + "22" : "#161a23", border: `2px solid ${active ? col : "#2a2e3a"}`, color: active ? col : "#888", padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>{sev}</button>; })}
          </div>
          <label style={s.formLabel}>Location / Machine</label>
          <input style={s.input} placeholder="e.g. Press Brake #33" value={newIncident.location} onChange={e => setNewIncident(p => ({ ...p, location: e.target.value }))} />
          <label style={s.formLabel}>What happened?</label>
          <textarea style={s.textarea} placeholder="Describe the incident clearly..." value={newIncident.description} onChange={e => setNewIncident(p => ({ ...p, description: e.target.value }))} />
          <label style={s.formLabel}>Photos ({newIncident.photos.length} attached)</label>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {newIncident.photos.map((p, i) => (
              p === "simulated"
                ? <div key={i} style={{ width: 72, height: 72, background: "#1a2a1a", border: "2px solid #2ecc71", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#2ecc71", letterSpacing: 1, textAlign: "center", flexShrink: 0 }}>📷<br />PHOTO {i + 1}</div>
                : <img key={i} src={p} alt="" style={{ width: 72, height: 72, objectFit: "cover", border: "2px solid #2ecc71" }} />
            ))}
            <button onClick={() => openCamera("incident")} style={{ width: 72, height: 72, background: "#161a23", border: "2px dashed #ff6b00", color: "#ff6b00", fontSize: 24, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0, fontFamily: "inherit" }}>
              <span>📷</span><span style={{ fontSize: 9, letterSpacing: 1 }}>ADD</span>
            </button>
          </div>
          <button style={{ ...s.primaryBtn, opacity: newIncident.description ? 1 : 0.4 }} disabled={!newIncident.description}
            onClick={submitIncident}>SUBMIT REPORT</button>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.INCIDENT_DETAIL && selectedIncident) {
    const inc = incidents.find(i => i.id === selectedIncident.id) || selectedIncident;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.INCIDENTS)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}><span style={s.badge(severityColor(inc.severity))}>{inc.severity}</span><span style={s.badge(inc.status === "Open" ? "yellow" : "green")}>{inc.status}</span></div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{inc.type} — {inc.location}</div>
          <div style={s.detailRow}><span style={s.detailLabel}>Date</span><span>{inc.date}</span></div>
          <div style={s.detailRow}><span style={s.detailLabel}>Reported By</span><span style={{ fontWeight: 700 }}>{inc.reportedBy}</span></div>
          <div style={{ padding: "12px 0", borderBottom: "1px solid #1f2330" }}><div style={s.detailLabel}>Description</div><div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "#ccc" }}>{inc.description}</div></div>
          <div style={{ marginTop: 20 }}>
            <button style={{ ...s.primaryBtn, background: inc.status === "Open" ? "#2ecc71" : "#444", color: "#000" }} onClick={() => updateIncidentStatus(inc.id, inc.status === "Open" ? "Closed" : "Open")}>{inc.status === "Open" ? "✓ MARK CLOSED" : "↩ REOPEN"}</button>
          </div>
          {isSupervisor() && inc.status === "Open" && (
            <div style={{ background: "#161a23", border: "2px solid #ff6b00", padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b00", letterSpacing: 1, marginBottom: 12 }}>CORRECTIVE ACTION</div>
              {inc.correctiveAction ? (
                <div>
                  <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6, marginBottom: 6 }}>{inc.correctiveAction.description}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Assigned to {inc.correctiveAction.assignedTo} · Due {inc.correctiveAction.dueDate}</div>
                  <button style={{ ...s.primaryBtn, background: "#0f2a1a", border: "1px solid #2ecc71", color: "#2ecc71", padding: "8px 0", fontSize: 12, marginTop: 10 }}
                    onClick={() => updateIncidentStatus(inc.id, "Closed", { correctiveAction: { ...inc.correctiveAction, completed: true } })}>
                    ✓ MARK CORRECTIVE ACTION COMPLETE
                  </button>
                </div>
              ) : (
                <CorrectiveActionForm incidentId={inc.id} team={team} onSave={(data) => setIncidents(prev => prev.map(x => x.id === inc.id ? { ...x, correctiveAction: data } : x))} s={s} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === SCREENS.INCIDENTS) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 20 }}>INCIDENT REPORTS</div>
          {incidents.map(inc => (
            <div key={inc.id} style={s.incidentCard} onClick={() => { setSelectedIncident(inc); setScreen(SCREENS.INCIDENT_DETAIL); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ display: "flex", gap: 6 }}><span style={s.badge(severityColor(inc.severity))}>{inc.severity}</span><span style={s.badge(inc.status === "Open" ? "yellow" : "green")}>{inc.status}</span></div><span style={{ fontSize: 11, color: "#555" }}>{inc.date}</span></div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{inc.type} — {inc.location}</div>
              <div style={{ fontSize: 12, color: "#888" }}>By {inc.reportedBy}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── OSHA PANIC ──
  if (screen === SCREENS.OSHA_PANIC) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => { setScreen(SCREENS.DASHBOARD); setPanicExported(false); setShowPanicConfirm(false); }}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ background: "#1a0a0a", border: "2px solid #c0392b", padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#e74c3c", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>🚨 OSHA PANIC MODE</div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>Inspector on site? Export everything in one tap.</div>
            {["Training Logs", "Machine Inspection Logs", "Approved SOPs", "LOTOTO Procedures & Logs", `Incident Reports (${incidents.length} total)`].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #2a1a1a", fontSize: 14 }}>
                <span style={{ color: panicExported ? "#2ecc71" : "#e74c3c" }}>{panicExported ? "✓" : "○"}</span>
                <span style={{ color: panicExported ? "#2ecc71" : "#ccc" }}>{item}</span>
              </div>
            ))}
          </div>
          {!panicExported ? (!showPanicConfirm
            ? <button style={s.dangerBtn} onClick={() => setShowPanicConfirm(true)}>EXPORT ALL RECORDS NOW</button>
            : <div style={{ background: "#1a0a0a", border: "2px solid #c0392b", padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e74c3c", marginBottom: 12 }}>Confirm export?</div>
                <button style={{ ...s.dangerBtn, marginBottom: 10 }} onClick={() => { setPanicExported(true); setShowPanicConfirm(false); }}>YES — EXPORT NOW</button>
                <button style={{ ...s.backBtn, width: "100%", padding: 12 }} onClick={() => setShowPanicConfirm(false)}>CANCEL</button>
              </div>
          ) : (
            <div style={{ background: "#0f2a1a", border: "2px solid #2ecc71", padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>RECORDS EXPORTED</div>
              <div style={{ fontSize: 13, color: "#aaa", marginTop: 8 }}>PDF ready · Only approved SOPs included</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SAFETY MEETING NEW ──
  if (screen === SCREENS.SAFETY_MEETING_NEW) {
    if (meetingSubmitted) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>MEETING LOGGED</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>{newMeeting.topic}</div>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.SAFETY_MEETINGS)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>NEW MEETING</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>LOG SAFETY MEETING</div>

          <label style={s.formLabel}>Topic *</label>
          <input style={s.input} placeholder="e.g. Monthly LOTO Refresher" value={newMeeting.topic} onChange={e => setNewMeeting(p => ({ ...p, topic: e.target.value }))} />

          <label style={s.formLabel}>Attendees</label>
          <div style={{ marginBottom: 12 }}>
            {team.map(member => {
              const attending = newMeeting.attendees.includes(member.name);
              return (
                <div key={member.id} onClick={() => setNewMeeting(p => ({ ...p, attendees: attending ? p.attendees.filter(a => a !== member.name) : [...p.attendees, member.name] }))}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: attending ? "#0f2a1a" : "#161a23", border: `1px solid ${attending ? "#2ecc71" : "#2a2e3a"}`, padding: "10px 14px", marginBottom: 6, cursor: "pointer" }}>
                  <div style={{ width: 20, height: 20, border: `2px solid ${attending ? "#2ecc71" : "#444"}`, background: attending ? "#2ecc71" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#000", fontWeight: 800, flexShrink: 0 }}>{attending ? "✓" : ""}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: attending ? "#2ecc71" : "#e8e8e0" }}>{member.name}</div>
                  <span style={s.roleTag(member.role)}>{member.role}</span>
                </div>
              );
            })}
          </div>

          <label style={s.formLabel}>Notes / Topics Covered</label>
          <textarea style={s.textarea} placeholder="What was discussed, any action items..." value={newMeeting.notes} onChange={e => setNewMeeting(p => ({ ...p, notes: e.target.value }))} />

          <button style={{ ...s.primaryBtn, opacity: (newMeeting.topic && newMeeting.attendees.length > 0) ? 1 : 0.4 }}
            disabled={!newMeeting.topic || newMeeting.attendees.length === 0}
            onClick={() => {
              setSafetyMeetings(prev => [{
                id: prev.length + 1, topic: newMeeting.topic,
                date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                ledBy: currentUser?.name, attendees: newMeeting.attendees,
                notes: newMeeting.notes, ts: Date.now()
              }, ...prev]);
              setMeetingSubmitted(true);
              setTimeout(() => { setMeetingSubmitted(false); setNewMeeting({ topic: "", notes: "", attendees: [] }); setScreen(SCREENS.SAFETY_MEETINGS); }, 1800);
            }}>
            ✓ LOG MEETING
          </button>
        </div>
      </div>
    );
  }

  // ── SAFETY MEETINGS LIST ──
  if (screen === SCREENS.SAFETY_MEETINGS) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.TRAINING)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>SAFETY MEETINGS</div>
            {isSupervisor() && <button onClick={() => setScreen(SCREENS.SAFETY_MEETING_NEW)} style={{ background: "#ff6b00", color: "#000", border: "none", padding: "8px 14px", fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>+ LOG MEETING</button>}
          </div>
          {safetyMeetings.length === 0 && <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 32, textAlign: "center" }}><div style={{ fontSize: 13, color: "#555" }}>No meetings logged yet.</div></div>}
          {safetyMeetings.map(meeting => (
            <div key={meeting.id} style={{ background: "#161a23", border: "1px solid #2a2e3a", borderLeft: "4px solid #2ecc71", padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{meeting.topic}</div>
                <span style={{ fontSize: 11, color: "#555" }}>{meeting.date}</span>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Led by {meeting.ledBy} · {meeting.attendees.length} attendees</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: meeting.notes ? 8 : 0 }}>
                {meeting.attendees.map(a => <span key={a} style={{ ...s.badge("green"), marginBottom: 0 }}>{a.split(" ")[0]}</span>)}
              </div>
              {meeting.notes && <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic", borderLeft: "2px solid #2ecc71", paddingLeft: 10, marginTop: 6 }}>"{meeting.notes}"</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── MAINTENANCE NEW ──
  if (screen === SCREENS.MAINTENANCE_NEW) {
    if (maintenanceAdded) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>TASK ADDED</div>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MAINTENANCE_SCHEDULE)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>ADD TASK</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>NEW MAINTENANCE TASK</div>

          <label style={s.formLabel}>Machine</label>
          <select style={s.select} value={newMaintenance.machineId} onChange={e => setNewMaintenance(p => ({ ...p, machineId: e.target.value }))}>
            <option value="">Select machine...</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <label style={s.formLabel}>Task Description *</label>
          <input style={s.input} placeholder="e.g. Hydraulic fluid change" value={newMaintenance.task} onChange={e => setNewMaintenance(p => ({ ...p, task: e.target.value }))} />

          <label style={s.formLabel}>Repeat Every</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[["30", "30 Days"], ["60", "60 Days"], ["90", "90 Days"], ["180", "6 Months"], ["365", "1 Year"], ["custom", "Custom"]].map(([val, label]) => (
              <button key={val} onClick={() => setNewMaintenance(p => ({ ...p, intervalDays: val }))}
                style={{ background: newMaintenance.intervalDays === val ? "#1a2a1a" : "#161a23", border: `2px solid ${newMaintenance.intervalDays === val ? "#2ecc71" : "#2a2e3a"}`, color: newMaintenance.intervalDays === val ? "#2ecc71" : "#888", padding: "8px 4px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>
                {label}
              </button>
            ))}
          </div>

          <label style={s.formLabel}>Assign To</label>
          <select style={s.select} value={newMaintenance.assignedTo} onChange={e => setNewMaintenance(p => ({ ...p, assignedTo: e.target.value }))}>
            <option value="">Select person...</option>
            {team.filter(m => m.role === ROLES.MAINTENANCE || m.role === ROLES.SUPERVISOR).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>

          <button style={{ ...s.primaryBtn, opacity: (newMaintenance.task && newMaintenance.machineId) ? 1 : 0.4 }}
            disabled={!newMaintenance.task || !newMaintenance.machineId}
            onClick={() => {
              const machine = machines.find(m => String(m.id) === String(newMaintenance.machineId));
              setMaintenanceItems(prev => [...prev, {
                id: prev.length + 1, machineId: parseInt(newMaintenance.machineId),
                machineName: machine?.name || "", task: newMaintenance.task,
                intervalDays: parseInt(newMaintenance.intervalDays) || 30,
                lastDoneTs: null, assignedTo: newMaintenance.assignedTo, status: "overdue"
              }]);
              setMaintenanceAdded(true);
              setTimeout(() => { setMaintenanceAdded(false); setNewMaintenance({ machineId: "", task: "", intervalDays: "30", assignedTo: "" }); setScreen(SCREENS.MAINTENANCE_SCHEDULE); }, 1800);
            }}>
            ✓ ADD TASK
          </button>
        </div>
      </div>
    );
  }

  // ── MAINTENANCE SCHEDULE ──
  if (screen === SCREENS.MAINTENANCE_SCHEDULE) {
    const overdueItems = maintenanceItems.filter(i => maintenanceDueStatus(i) === "overdue");
    const upcomingItems = maintenanceItems.filter(i => maintenanceDueStatus(i) === "upcoming");
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.MACHINES)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>MAINTENANCE</div>
            {isSupervisor() && <button onClick={() => setScreen(SCREENS.MAINTENANCE_NEW)} style={{ background: "#ff6b00", color: "#000", border: "none", padding: "8px 14px", fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>+ ADD TASK</button>}
          </div>

          {overdueItems.length > 0 && <div style={s.alertBanner("red")}>🔧 {overdueItems.length} maintenance task{overdueItems.length > 1 ? "s" : ""} overdue</div>}
          {upcomingItems.length > 0 && <div style={s.alertBanner("orange")}>⚠ {upcomingItems.length} task{upcomingItems.length > 1 ? "s" : ""} due within 7 days</div>}

          {maintenanceItems.map(item => {
            const status = maintenanceDueStatus(item);
            const dueText = maintenanceDueText(item);
            const color = status === "overdue" ? "#e74c3c" : status === "upcoming" ? "#f39c12" : "#2ecc71";
            return (
              <div key={item.id} style={{ background: "#161a23", border: `1px solid #2a2e3a`, borderLeft: `4px solid ${color}`, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, flex: 1, marginRight: 10 }}>{item.task}</div>
                  <span style={{ ...s.badge(status === "overdue" ? "red" : status === "upcoming" ? "yellow" : "green"), marginBottom: 0, flexShrink: 0 }}>{dueText}</span>
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{item.machineName}</div>
                {item.assignedTo && <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>Assigned to {item.assignedTo}</div>}
                <div style={{ fontSize: 11, color: "#555" }}>Every {item.intervalDays} days · Last done: {item.lastDoneTs ? timeAgo(item.lastDoneTs) : "Never"}</div>
                {isMaintenance() && (
                  <button style={{ ...s.primaryBtn, background: "#0f2a1a", border: "1px solid #2ecc71", color: "#2ecc71", padding: "8px 0", fontSize: 12, marginTop: 10 }}
                    onClick={() => setMaintenanceItems(prev => prev.map(i => i.id === item.id ? { ...i, lastDoneTs: Date.now(), status: "ok" } : i))}>
                    ✓ MARK COMPLETE
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (screen === SCREENS.TRAINING_LOG) {
    const member = team.find(m => m.id === selectedTrainingMember);
    if (!member) return null;
    if (trainingLogged) return (
      <div style={s.app}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2ecc71", letterSpacing: 2 }}>TRAINING LOGGED</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>{member.name} · {logTrainingType}</div>
        </div>
      </div>
    );
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.TRAINING)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>LOG TRAINING</div></div>
        <div style={s.content}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ ...s.avatar(member.role), width: 44, height: 44, fontSize: 14 }}>{member.avatar}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{member.name}</div>
              <span style={s.roleTag(member.role)}>{member.role}</span>
            </div>
          </div>

          <label style={s.formLabel}>Training Type</label>
          <select style={s.select} value={logTrainingType} onChange={e => setLogTrainingType(e.target.value)}>
            <option value="">Select training...</option>
            {trainingTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>

          <label style={s.formLabel}>Completion Date</label>
          <input style={s.input} type="date" value={logTrainingDate} onChange={e => setLogTrainingDate(e.target.value)} />

          <button
            style={{ ...s.primaryBtn, opacity: (logTrainingType && logTrainingDate) ? 1 : 0.4 }}
            disabled={!logTrainingType || !logTrainingDate}
            onClick={() => submitTrainingLog(member)}>
            ✓ LOG COMPLETION
          </button>
        </div>
      </div>
    );
  }

  // ── TRAINING MANAGE (supervisor manages training types) ──
  if (screen === SCREENS.TRAINING_MANAGE) {
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.TRAINING)}>← BACK</button><div style={{ ...s.logo, fontSize: 17 }}>MANAGE TRAINING</div></div>
        <div style={s.content}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 20, letterSpacing: 1 }}>Define what training your company tracks. Workers are measured against these requirements.</div>

          {trainingTypes.map(t => (
            <div key={t.id} style={{ background: "#161a23", border: "1px solid #2a2e3a", borderLeft: `4px solid ${t.required ? "#ff6b00" : "#2a2e3a"}`, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={s.badge(t.required ? "yellow" : "blue")}>{t.required ? "REQUIRED" : "OPTIONAL"}</span>
                  <span style={s.badge("green")}>{t.frequency === "annual" ? "ANNUAL" : t.frequency === "3year" ? "3 YEARS" : t.frequency === "5year" ? "5 YEARS" : "ONE TIME"}</span>
                </div>
              </div>
              <button onClick={() => setTrainingTypes(prev => prev.filter(x => x.id !== t.id))}
                style={{ background: "none", border: "1px solid #3a1a1a", color: "#555", padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1 }}>
                REMOVE
              </button>
            </div>
          ))}

          {!showAddTraining ? (
            <button style={{ ...s.primaryBtn, background: "#1a2030", border: "2px dashed #4a9eff", color: "#4a9eff", marginTop: 8 }} onClick={() => setShowAddTraining(true)}>
              + ADD TRAINING TYPE
            </button>
          ) : (
            <div style={{ background: "#161a23", border: "2px solid #ff6b00", padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b00", letterSpacing: 1, marginBottom: 14 }}>NEW TRAINING TYPE</div>

              <label style={s.formLabel}>Training Name</label>
              <input style={s.input} placeholder="e.g. Respirator Fit Test" value={newTrainingType.name} onChange={e => setNewTrainingType(p => ({ ...p, name: e.target.value }))} />

              <label style={s.formLabel}>Renewal Frequency</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[["annual", "Annual"], ["3year", "Every 3 Years"], ["5year", "Every 5 Years"], ["once", "One Time Only"]].map(([val, label]) => (
                  <button key={val} onClick={() => setNewTrainingType(p => ({ ...p, frequency: val }))}
                    style={{ background: newTrainingType.frequency === val ? "#1a2a1a" : "#0f1117", border: `2px solid ${newTrainingType.frequency === val ? "#2ecc71" : "#2a2e3a"}`, color: newTrainingType.frequency === val ? "#2ecc71" : "#888", padding: "10px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>
                    {label}
                  </button>
                ))}
              </div>

              <label style={s.formLabel}>Required for all employees?</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {[true, false].map(val => (
                  <button key={String(val)} onClick={() => setNewTrainingType(p => ({ ...p, required: val }))}
                    style={{ background: newTrainingType.required === val ? (val ? "#2a1500" : "#0f2a1a") : "#0f1117", border: `2px solid ${newTrainingType.required === val ? (val ? "#f39c12" : "#2ecc71") : "#2a2e3a"}`, color: newTrainingType.required === val ? (val ? "#f39c12" : "#2ecc71") : "#888", padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>
                    {val ? "REQUIRED" : "OPTIONAL"}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...s.backBtn, flex: 1, padding: 12 }} onClick={() => { setShowAddTraining(false); setNewTrainingType({ name: "", frequency: "annual", required: true }); }}>CANCEL</button>
                <button
                  style={{ ...s.primaryBtn, flex: 2, opacity: newTrainingType.name.trim() ? 1 : 0.4 }}
                  disabled={!newTrainingType.name.trim()}
                  onClick={() => {
                    setTrainingTypes(prev => [...prev, { id: Date.now(), ...newTrainingType }]);
                    setNewTrainingType({ name: "", frequency: "annual", required: true });
                    setShowAddTraining(false);
                  }}>
                  ✓ ADD
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── TRAINING ──
  if (screen === SCREENS.TRAINING) {
    const missingCount = team.filter(m => trainingTypes.some(t => t.required && !m.trained.includes(t.name))).length;
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>TRAINING RECORDS</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setScreen(SCREENS.SAFETY_MEETINGS)} style={{ background: "#161a23", color: "#2ecc71", border: "1px solid #2ecc71", padding: "8px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>MEETINGS</button>
              {isSupervisor() && <button onClick={() => setScreen(SCREENS.TRAINING_MANAGE)} style={{ background: "#161a23", color: "#ff6b00", border: "1px solid #ff6b00", padding: "8px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>MANAGE</button>}
            </div>
          </div>

          {isSupervisor() && missingCount > 0 && <div style={s.alertBanner("orange")}>⚠ {missingCount} employee{missingCount > 1 ? "s" : ""} missing required training</div>}

          {isSupervisor() && <>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>Required Training Types</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {trainingTypes.map(t => (
                <span key={t.id} style={{ ...s.badge(t.required ? "yellow" : "blue"), marginBottom: 0 }}>{t.name}</span>
              ))}
            </div>
          </>}

          {!isSupervisor() && (
            <div style={{ background: "#161a23", border: "1px solid #2a2e3a", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#888" }}>
              Showing your training record only.
            </div>
          )}

          <div style={{ fontSize: 11, letterSpacing: 3, color: "#ff6b00", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>Employee Records</div>
          {team.filter(member => isSupervisor() ? true : member.id === currentUser?.id).map((member) => {
            const missing = trainingTypes.filter(t => t.required && !member.trained.includes(t.name)).map(t => t.name);
            const hasAll = missing.length === 0;
            return (
              <div key={member.id} style={{ background: "#161a23", border: `1px solid #2a2e3a`, borderLeft: `4px solid ${hasAll ? "#2ecc71" : "#e74c3c"}`, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...s.avatar(member.role), width: 32, height: 32, fontSize: 11 }}>{member.avatar}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{member.name}</div>
                      <span style={s.roleTag(member.role)}>{member.role}</span>
                    </div>
                  </div>
                  {isSupervisor() && (
                    <button onClick={() => { setSelectedTrainingMember(member.id); setScreen(SCREENS.TRAINING_LOG); }}
                      style={{ background: "#ff6b00", color: "#000", border: "none", padding: "6px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>
                      + LOG
                    </button>
                  )}
                </div>
                <div style={{ marginBottom: 6 }}>
                  {member.trained.map(t => <span key={t} style={s.badge("green")}>{t}</span>)}
                  {missing.map(t => <span key={t} style={s.badge("red")}>MISSING: {t}</span>)}
                </div>
                {member.expiring && <div style={{ fontSize: 12, color: "#f39c12" }}>⚠ {member.expiring}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── MY TASKS ──
  if (screen === SCREENS.MY_TASKS) {
    const myTasks = incidents.filter(i => i.correctiveAction && !i.correctiveAction.completed && i.correctiveAction.assignedTo === currentUser?.name);
    return (
      <div style={s.app}>
        <div style={s.header}><button style={s.backBtn} onClick={() => setScreen(SCREENS.DASHBOARD)}>← BACK</button><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div></div>
        <div style={s.content}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>MY TASKS</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 20, letterSpacing: 1 }}>CORRECTIVE ACTIONS ASSIGNED TO YOU</div>

          {myTasks.length === 0 && (
            <div style={{ background: "#161a23", border: "2px dashed #2a2e3a", padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, color: "#2ecc71", fontWeight: 700 }}>All caught up</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>No open tasks assigned to you</div>
            </div>
          )}

          {myTasks.map(inc => (
            <div key={inc.id} style={{ background: "#161a23", border: "2px solid #f39c12", padding: "16px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#f39c12", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>📋 Corrective Action</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{inc.correctiveAction.description}</div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Related Incident</span>
                <span style={{ fontSize: 13, color: "#aaa" }}>{inc.type} — {inc.location}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Assigned By</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e8e8e0" }}>{inc.reportedBy}</span>
              </div>
              <div style={{ ...s.detailRow, borderBottom: "none" }}>
                <span style={s.detailLabel}>Due Date</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f39c12" }}>{inc.correctiveAction.dueDate}</span>
              </div>
              <button style={{ ...s.primaryBtn, background: "#0f2a1a", border: "2px solid #2ecc71", color: "#2ecc71", marginTop: 14 }}
                onClick={() => setIncidents(prev => prev.map(x => x.id === inc.id ? { ...x, correctiveAction: { ...x.correctiveAction, completed: true } } : x))}>
                ✓ MARK COMPLETE
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── DASHBOARD ──
  const lockedMachines = machines.filter(m => m.activeLocks.length > 0).length;
  return (
    <div style={s.app}>
      <div style={s.header}>
        <div><div style={{ ...s.logo, display: "flex", alignItems: "center" }}>Shop<span style={{ color: "#ff6b00" }}>Guard</span><LogoMark size={22} /></div><div style={s.logoSub}>SHOP SAFETY PLATFORM</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8e0" }}>{currentUser?.name.split(" ")[0]}</div>
            <span style={{ ...s.roleTag(currentUser?.role), fontSize: 9, padding: "2px 7px", letterSpacing: 1 }}>{currentUser?.role}</span>
          </div>
          <button onClick={() => { setCurrentUser(null); setScreen(SCREENS.LOGIN); }} style={{ ...s.backBtn, fontSize: 11, padding: "4px 8px" }}>SWITCH</button>
        </div>
      </div>
      <div style={s.content}>
        {overdueCount() > 0 && <div style={s.alertBanner("orange")}>⚠ {overdueCount()} machine{overdueCount() > 1 ? "s" : ""} overdue for inspection</div>}
        {lockedMachines > 0 && <div style={s.alertBanner("red")}>🔒 {lockedMachines} machine{lockedMachines > 1 ? "s" : ""} currently locked out</div>}
        {isSupervisor() && pendingCount() > 0 && (
          <div onClick={() => setScreen(SCREENS.PENDING_SOPS)} style={{ background: "#1a1a3a", border: "2px solid #a070ff", padding: "14px 16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#a070ff", letterSpacing: 1, marginBottom: 2 }}>⏳ SOP REVIEW NEEDED</div>
              <div style={{ fontSize: 12, color: "#888" }}>{pendingCount()} draft{pendingCount() > 1 ? "s" : ""} submitted by workers — tap to review</div>
            </div>
            <div style={{ background: "#a070ff", color: "#000", fontWeight: 900, fontSize: 18, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{pendingCount()}</div>
          </div>
        )}
        {!isSupervisor() && (() => {
          const myTasks = incidents.filter(i => i.correctiveAction && !i.correctiveAction.completed && i.correctiveAction.assignedTo === currentUser?.name);
          return myTasks.length > 0 ? (
            <div onClick={() => setScreen(SCREENS.MY_TASKS)} style={{ background: "#2a1a00", border: "2px solid #f39c12", padding: "14px 16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#f39c12", letterSpacing: 1, marginBottom: 2 }}>📋 YOU HAVE OPEN TASKS</div>
                <div style={{ fontSize: 12, color: "#888" }}>{myTasks.length} corrective action{myTasks.length > 1 ? "s" : ""} assigned to you</div>
              </div>
              <div style={{ background: "#f39c12", color: "#000", fontWeight: 900, fontSize: 18, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{myTasks.length}</div>
            </div>
          ) : null;
        })()}

        <div style={s.statRow}>
          <div style={s.stat}><div style={s.statNum}>{machines.length}</div><div style={s.statLabel}>Machines</div></div>
          {isSupervisor()
            ? <div style={s.stat} onClick={() => setScreen(SCREENS.INCIDENTS)} style={{...s.stat, cursor:"pointer"}}><div style={{ ...s.statNum, color: openIncidents() > 0 ? "#e74c3c" : "#2ecc71" }}>{openIncidents()}</div><div style={s.statLabel}>Incidents</div></div>
            : (() => {
                const myTasks = incidents.filter(i => i.correctiveAction && !i.correctiveAction.completed && i.correctiveAction.assignedTo === currentUser?.name);
                return (
                  <div style={{ ...s.stat, cursor: "pointer" }} onClick={() => setScreen(SCREENS.MY_TASKS)}>
                    <div style={{ ...s.statNum, color: myTasks.length > 0 ? "#f39c12" : "#555" }}>{myTasks.length}</div>
                    <div style={s.statLabel}>My Tasks</div>
                  </div>
                );
              })()
          }
          <div style={s.stat}><div style={{ ...s.statNum, color: lockedMachines > 0 ? "#e74c3c" : "#555" }}>{lockedMachines}</div><div style={s.statLabel}>Locked Out</div></div>
        </div>

        <div style={s.sectionTitle}>Quick Actions</div>
        <button style={s.bigBtn} onClick={() => setScreen(SCREENS.MACHINES)}>
          <span style={s.bigBtnIcon}>⚙️</span>
          <div style={{ flex: 1 }}>
            <div style={s.bigBtnLabel}>Machines</div>
            <div style={s.bigBtnSub}>Inspect, SOPs, LOTO, logs</div>
          </div>
          {isSupervisor() && pendingCount() > 0 && (
            <div style={{ background: "#a070ff", color: "#000", fontWeight: 900, fontSize: 12, minWidth: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>{pendingCount()}</div>
          )}
        </button>
        <button style={s.bigBtn} onClick={() => setScreen(SCREENS.INCIDENT_NEW)}><span style={s.bigBtnIcon}>🚨</span><div><div style={s.bigBtnLabel}>Report Incident</div><div style={s.bigBtnSub}>File a new incident report</div></div></button>
        {isSupervisor() && <button style={s.bigBtn} onClick={() => setScreen(SCREENS.INCIDENTS)}><span style={s.bigBtnIcon}>📂</span><div><div style={s.bigBtnLabel}>Incident Reports</div><div style={s.bigBtnSub}>{openIncidents()} open · supervisor view</div></div></button>}
        {isSupervisor() && <button style={s.bigBtn} onClick={() => setScreen(SCREENS.TEAM)}><span style={s.bigBtnIcon}>👥</span><div><div style={s.bigBtnLabel}>Team Management</div><div style={s.bigBtnSub}>{team.length} members · assign roles</div></div></button>}
        <button style={s.bigBtn} onClick={() => setScreen(SCREENS.TRAINING)}><span style={s.bigBtnIcon}>🎓</span><div><div style={s.bigBtnLabel}>Training Records</div><div style={s.bigBtnSub}>Certs, expirations, missing training</div></div></button>
        {isSupervisor() && pendingCount() > 0 && <button style={{ ...s.bigBtn, borderLeft: "4px solid #a070ff" }} onClick={() => setScreen(SCREENS.PENDING_SOPS)}><span style={s.bigBtnIcon}>📋</span><div><div style={{ ...s.bigBtnLabel, color: "#a070ff" }}>Review SOPs</div><div style={s.bigBtnSub}>{pendingCount()} draft{pendingCount() > 1 ? "s" : ""} from workers</div></div></button>}
        {isSupervisor() && <button style={{ ...s.bigBtn, borderLeft: "4px solid #e74c3c" }} onClick={() => setScreen(SCREENS.OSHA_PANIC)}><span style={s.bigBtnIcon}>📤</span><div><div style={{ ...s.bigBtnLabel, color: "#e74c3c" }}>OSHA Panic Mode</div><div style={s.bigBtnSub}>Export all records instantly</div></div></button>}
      </div>
    </div>
  );
}
