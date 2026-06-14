import { jsPDF } from "jspdf";
import { PHOTO_BUCKET, isPhotoUrl } from "./photoStorage";
import { supabase } from "./supabase";

const MARGIN = 20;
const LINE_HEIGHT = 6;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ensureSpace(doc, y, needed = 24) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function addWrappedText(doc, text, x, y, maxWidth) {
  const lines = doc.splitTextToSize(text || "—", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

function addSectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(200, 60, 0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 2, PAGE_WIDTH - MARGIN, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  return y + 12;
}

function addField(doc, label, value, y) {
  const valueText = String(value || "—");
  const lines = doc.splitTextToSize(`${label}: ${valueText}`, CONTENT_WIDTH);
  y = ensureSpace(doc, y, lines.length * LINE_HEIGHT + 4);
  doc.text(lines, MARGIN, y);
  return y + lines.length * LINE_HEIGHT + 2;
}

function addRecordDivider(doc, y) {
  y = ensureSpace(doc, y, 10);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 8;
}

function parsePpe(ppe) {
  if (Array.isArray(ppe)) return ppe.join(", ");
  if (typeof ppe === "string") {
    try {
      const parsed = JSON.parse(ppe);
      return Array.isArray(parsed) ? parsed.join(", ") : ppe;
    } catch {
      return ppe;
    }
  }
  return "—";
}

function formatSopSteps(steps) {
  if (!steps?.length) return "No SOP steps on file";
  return steps
    .map((step, i) => {
      const parts = [`${i + 1}. ${step.title || "Untitled step"}`];
      if (step.description) parts.push(`   ${step.description}`);
      if (step.warning) parts.push(`   WARNING: ${step.warning}`);
      return parts.join("\n");
    })
    .join("\n");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getIncidentPhotoUrls(incident) {
  const urls = incident?.photo_urls;
  if (!Array.isArray(urls)) return [];
  return urls.filter(isPhotoUrl);
}

function storagePathFromPublicUrl(url) {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchPhotoAsDataUrl(url) {
  const path = storagePathFromPublicUrl(url);
  if (path) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
    if (!error && data) return blobToDataUrl(data);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load photo (${response.status})`);
  return blobToDataUrl(await response.blob());
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function imageFormatFromDataUrl(dataUrl) {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/gif")) return "GIF";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return null;
}

async function addIncidentPhotosToPdf(doc, photoUrls, y) {
  if (!photoUrls.length) return y;

  y = addField(doc, "Photos", `${photoUrls.length} attached`, y);

  for (let i = 0; i < photoUrls.length; i++) {
    try {
      const dataUrl = await fetchPhotoAsDataUrl(photoUrls[i]);
      const format = imageFormatFromDataUrl(dataUrl);
      if (!format) {
        y = addField(doc, `Photo ${i + 1}`, "(unsupported image format)", y);
        continue;
      }

      const { width, height } = await loadImageDimensions(dataUrl);
      const maxWidth = CONTENT_WIDTH;
      const maxHeight = 80;
      let imgWidth = maxWidth;
      let imgHeight = (height / width) * imgWidth;
      if (imgHeight > maxHeight) {
        imgHeight = maxHeight;
        imgWidth = (width / height) * imgHeight;
      }

      y = ensureSpace(doc, y, imgHeight + 10);
      doc.addImage(dataUrl, format, MARGIN, y, imgWidth, imgHeight);
      y += imgHeight + 6;
    } catch {
      y = addField(doc, `Photo ${i + 1}`, "(unable to load)", y);
    }
  }

  return y;
}

function formatLotoStatus(machine) {
  return machine.requires_loto ? "LOTO Required" : "No LOTO Required";
}

function formatAttendees(attendees) {
  if (Array.isArray(attendees)) return attendees.length ? attendees.join(", ") : "—";
  if (typeof attendees === "string") {
    try {
      const parsed = JSON.parse(attendees);
      return Array.isArray(parsed) ? (parsed.length ? parsed.join(", ") : "—") : attendees;
    } catch {
      return attendees || "—";
    }
  }
  return "—";
}

function getInspectionMachineName(inspection, machineMap) {
  return inspection.machines?.name || machineMap[inspection.machine_id] || `Machine #${inspection.machine_id || "?"}`;
}

function emailSectionTitle(title, count) {
  return `<h2 style="color:#c83c00;font-size:16px;margin:28px 0 12px;border-bottom:2px solid #c83c00;padding-bottom:4px;">${escapeHtml(title)} (${count})</h2>`;
}

function emailEmptySection(message) {
  return `<p style="color:#666;font-style:italic;margin:0 0 8px;">${escapeHtml(message)}</p>`;
}

function emailRecordCard(content) {
  return `<div style="margin-bottom:14px;padding:12px;border:1px solid #ddd;border-radius:4px;background:#fafafa;">${content}</div>`;
}

function buildMachinesEmailHtml(machines) {
  let html = emailSectionTitle("Machines", machines.length);
  if (!machines.length) {
    return html + emailEmptySection("No machine records on file.");
  }

  machines.forEach((machine, index) => {
    html += emailRecordCard(`
      <div style="font-weight:bold;margin-bottom:6px;">${index + 1}. ${escapeHtml(machine.name || "Unnamed machine")}</div>
      <div style="font-size:13px;line-height:1.6;">
        <div><strong>Recorded:</strong> ${escapeHtml(formatTimestamp(machine.created_at))}</div>
        <div><strong>Required PPE:</strong> ${escapeHtml(parsePpe(machine.ppe))}</div>
        <div><strong>LOTO Status:</strong> ${escapeHtml(formatLotoStatus(machine))}</div>
      </div>
    `);
  });

  return html;
}

function buildInspectionsEmailHtml(inspections, machineMap) {
  let html = emailSectionTitle("Inspections", inspections.length);
  if (!inspections.length) {
    return html + emailEmptySection("No inspection records on file.");
  }

  inspections.forEach((inspection, index) => {
    const machineName = getInspectionMachineName(inspection, machineMap);
    html += emailRecordCard(`
      <div style="font-weight:bold;margin-bottom:6px;">${index + 1}. ${escapeHtml(machineName)}</div>
      <div style="font-size:13px;line-height:1.6;">
        <div><strong>Date &amp; Time:</strong> ${escapeHtml(formatTimestamp(inspection.created_at))}</div>
        <div><strong>Employee:</strong> ${escapeHtml(inspection.employee_name)}</div>
        <div><strong>Result:</strong> ${inspection.passed ? "PASSED" : "FAILED"}</div>
        <div><strong>Notes:</strong> ${escapeHtml(inspection.notes)}</div>
      </div>
    `);
  });

  return html;
}

function buildIncidentsEmailHtml(incidents) {
  let html = emailSectionTitle("Incidents", incidents.length);
  if (!incidents.length) {
    return html + emailEmptySection("No incident records on file.");
  }

  incidents.forEach((incident, index) => {
    const photos = getIncidentPhotoUrls(incident);
    const images = photos
      .map(
        (url, photoIndex) =>
          `<img src="${escapeHtml(url)}" alt="Incident photo ${photoIndex + 1}" style="max-width:280px;max-height:280px;border:1px solid #ccc;border-radius:4px;margin:4px 4px 0 0;" />`,
      )
      .join("");

    html += emailRecordCard(`
      <div style="font-weight:bold;margin-bottom:6px;">${index + 1}. ${escapeHtml(incident.type || "Incident")} — ${escapeHtml(incident.location || "Unknown location")}</div>
      <div style="font-size:13px;line-height:1.6;">
        <div><strong>Reported:</strong> ${escapeHtml(formatTimestamp(incident.created_at))}</div>
        <div><strong>Reported By:</strong> ${escapeHtml(incident.reported_by)}</div>
        <div><strong>Status:</strong> ${escapeHtml(incident.status)}</div>
        <div><strong>Description:</strong> ${escapeHtml(incident.description)}</div>
        ${photos.length ? `<div style="margin-top:8px;"><strong>Photos (${photos.length}):</strong><div>${images}</div></div>` : ""}
      </div>
    `);
  });

  return html;
}

function buildTrainingEmailHtml(trainingRecords) {
  let html = emailSectionTitle("Training Records", trainingRecords.length);
  if (!trainingRecords.length) {
    return html + emailEmptySection("No training records on file.");
  }

  trainingRecords.forEach((record, index) => {
    html += emailRecordCard(`
      <div style="font-weight:bold;margin-bottom:6px;">${index + 1}. ${escapeHtml(record.training_type || "Training")}</div>
      <div style="font-size:13px;line-height:1.6;">
        <div><strong>Employee:</strong> ${escapeHtml(record.employee_name)}</div>
        <div><strong>Completed Date:</strong> ${escapeHtml(formatDate(record.completed_date))}</div>
        <div><strong>Logged:</strong> ${escapeHtml(formatTimestamp(record.created_at))}</div>
      </div>
    `);
  });

  return html;
}

function buildSafetyMeetingsEmailHtml(meetings) {
  let html = emailSectionTitle("Safety Meetings", meetings.length);
  if (!meetings.length) {
    return html + emailEmptySection("No safety meeting records on file.");
  }

  meetings.forEach((meeting, index) => {
    const meetingDate = meeting.meeting_date || meeting.created_at;
    const covered = meeting.notes || meeting.topic;
    html += emailRecordCard(`
      <div style="font-weight:bold;margin-bottom:6px;">${index + 1}. ${escapeHtml(meeting.topic || "Safety Meeting")}</div>
      <div style="font-size:13px;line-height:1.6;">
        <div><strong>Date:</strong> ${escapeHtml(formatTimestamp(meetingDate))}</div>
        <div><strong>Topics Covered:</strong> ${escapeHtml(covered)}</div>
        <div><strong>Attendees:</strong> ${escapeHtml(formatAttendees(meeting.attendees))}</div>
        ${meeting.led_by ? `<div><strong>Led By:</strong> ${escapeHtml(meeting.led_by)}</div>` : ""}
        <div><strong>Logged:</strong> ${escapeHtml(formatTimestamp(meeting.created_at))}</div>
      </div>
    `);
  });

  return html;
}

function buildEmailHtml({ companyName, records }) {
  const exportedAt = formatTimestamp(new Date().toISOString());
  const machineMap = Object.fromEntries(records.machines.map((machine) => [machine.id, machine.name]));

  return `
    <div style="font-family:Arial,sans-serif;color:#222;max-width:720px;">
      <p>OSHA Panic Mode export for <strong>${escapeHtml(companyName)}</strong>.</p>
      <p>Exported ${escapeHtml(exportedAt)}. A full PDF copy is attached to this email.</p>
      ${buildMachinesEmailHtml(records.machines)}
      ${buildInspectionsEmailHtml(records.inspections, machineMap)}
      ${buildIncidentsEmailHtml(records.incidents)}
      ${buildTrainingEmailHtml(records.trainingRecords)}
      ${buildSafetyMeetingsEmailHtml(records.safetyMeetings || [])}
    </div>
  `;
}

export async function fetchOshaRecords(companyId) {
  if (!companyId) {
    throw new Error("Company ID is required to export OSHA records.");
  }

  const [machinesRes, inspectionsRes, incidentsRes, trainingRes, meetingsRes] = await Promise.all([
    supabase
      .from("machines")
      .select("id, created_at, company_id, name, requires_loto, ppe, active, sop_steps")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("inspections")
      .select("id, created_at, company_id, machine_id, employee_id, employee_name, passed, notes, machines(name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("incidents")
      .select("id, created_at, company_id, type, location, description, reported_by, status, photo_urls")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("training_records")
      .select("id, created_at, company_id, employee_id, employee_name, training_type, completed_date")
      .eq("company_id", companyId)
      .order("completed_date", { ascending: false }),
    supabase
      .from("safety_meetings")
      .select("id, created_at, company_id, meeting_date, topic, notes, led_by, attendees")
      .eq("company_id", companyId)
      .order("meeting_date", { ascending: false }),
  ]);

  const errors = [machinesRes.error, inspectionsRes.error, incidentsRes.error, trainingRes.error].filter(Boolean);
  if (errors.length) {
    throw new Error(errors[0].message || "Failed to load records from Supabase");
  }

  if (meetingsRes.error && meetingsRes.error.code !== "PGRST205") {
    throw new Error(meetingsRes.error.message || "Failed to load safety meetings from Supabase");
  }

  return {
    machines: machinesRes.data || [],
    inspections: inspectionsRes.data || [],
    incidents: incidentsRes.data || [],
    trainingRecords: trainingRes.data || [],
    safetyMeetings: meetingsRes.error ? [] : (meetingsRes.data || []),
  };
}

export async function generateOshaPdf({ companyName, records }) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const exportedAt = formatTimestamp(new Date().toISOString());
  const machineMap = Object.fromEntries(records.machines.map(m => [m.id, m.name]));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(200, 60, 0);
  doc.text("ShopGuard OSHA Records Export", MARGIN, 28);

  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  doc.text(`Company: ${companyName}`, MARGIN, 40);
  doc.text(`Exported: ${exportedAt}`, MARGIN, 48);
  doc.text(`Generated by ShopGuard Panic Mode`, MARGIN, 56);

  let y = 72;

  y = addSectionTitle(doc, `MACHINES (${records.machines.length})`, y);
  if (!records.machines.length) {
    y = addWrappedText(doc, "No machine records on file.", MARGIN, y, CONTENT_WIDTH) + 6;
  } else {
    records.machines.forEach((machine, index) => {
      y = ensureSpace(doc, y, 40);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${machine.name || "Unnamed machine"}`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += LINE_HEIGHT + 2;
      y = addField(doc, "Recorded", formatTimestamp(machine.created_at), y);
      y = addField(doc, "Status", machine.active === false ? "Inactive" : "Active", y);
      y = addField(doc, "LOTO Status", formatLotoStatus(machine), y);
      y = addField(doc, "Required PPE", parsePpe(machine.ppe), y);
      y = addField(doc, "SOP Steps", formatSopSteps(machine.sop_steps), y);
      y = addRecordDivider(doc, y);
    });
  }

  y = addSectionTitle(doc, `INSPECTIONS (${records.inspections.length})`, y);
  if (!records.inspections.length) {
    y = addWrappedText(doc, "No inspection records on file.", MARGIN, y, CONTENT_WIDTH) + 6;
  } else {
    records.inspections.forEach((inspection, index) => {
      y = ensureSpace(doc, y, 36);
      const machineName = getInspectionMachineName(inspection, machineMap);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${machineName}`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += LINE_HEIGHT + 2;
      y = addField(doc, "Date & Time", formatTimestamp(inspection.created_at), y);
      y = addField(doc, "Performed By", inspection.employee_name, y);
      y = addField(doc, "Result", inspection.passed ? "PASSED" : "FAILED", y);
      y = addField(doc, "Notes", inspection.notes, y);
      y = addRecordDivider(doc, y);
    });
  }

  y = addSectionTitle(doc, `INCIDENTS (${records.incidents.length})`, y);
  if (!records.incidents.length) {
    y = addWrappedText(doc, "No incident records on file.", MARGIN, y, CONTENT_WIDTH) + 6;
  } else {
    for (let index = 0; index < records.incidents.length; index++) {
      const incident = records.incidents[index];
      y = ensureSpace(doc, y, 44);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${incident.type || "Incident"} — ${incident.location || "Unknown location"}`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += LINE_HEIGHT + 2;
      y = addField(doc, "Reported", formatTimestamp(incident.created_at), y);
      y = addField(doc, "Reported By", incident.reported_by, y);
      y = addField(doc, "Status", incident.status, y);
      y = addField(doc, "Description", incident.description, y);
      y = await addIncidentPhotosToPdf(doc, getIncidentPhotoUrls(incident), y);
      y = addRecordDivider(doc, y);
    }
  }

  y = addSectionTitle(doc, `TRAINING RECORDS (${records.trainingRecords.length})`, y);
  if (!records.trainingRecords.length) {
    y = addWrappedText(doc, "No training records on file.", MARGIN, y, CONTENT_WIDTH) + 6;
  } else {
    records.trainingRecords.forEach((record, index) => {
      y = ensureSpace(doc, y, 32);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${record.training_type || "Training"}`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += LINE_HEIGHT + 2;
      y = addField(doc, "Employee", record.employee_name, y);
      y = addField(doc, "Completed Date", formatDate(record.completed_date), y);
      y = addField(doc, "Logged", formatTimestamp(record.created_at), y);
      y = addRecordDivider(doc, y);
    });
  }

  y = addSectionTitle(doc, `SAFETY MEETINGS (${(records.safetyMeetings || []).length})`, y);
  if (!(records.safetyMeetings || []).length) {
    y = addWrappedText(doc, "No safety meeting records on file.", MARGIN, y, CONTENT_WIDTH) + 6;
  } else {
    (records.safetyMeetings || []).forEach((meeting, index) => {
      y = ensureSpace(doc, y, 40);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${meeting.topic || "Safety Meeting"}`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += LINE_HEIGHT + 2;
      y = addField(doc, "Date", formatTimestamp(meeting.meeting_date || meeting.created_at), y);
      y = addField(doc, "Topics Covered", meeting.notes || meeting.topic, y);
      y = addField(doc, "Attendees", formatAttendees(meeting.attendees), y);
      if (meeting.led_by) y = addField(doc, "Led By", meeting.led_by, y);
      y = addField(doc, "Logged", formatTimestamp(meeting.created_at), y);
      y = addRecordDivider(doc, y);
    });
  }

  return doc;
}

export async function sendOshaEmail({ to, companyName, pdfDoc, records }) {
  if (!to?.trim()) {
    throw new Error("No safety contact email configured. Add one in Supervisor Settings.");
  }

  const pdfBase64 = pdfDoc.output("datauristring").split(",")[1];
  const safeName = (companyName || "company").replace(/[^\w-]+/g, "-").toLowerCase();
  const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL || "ShopGuard <onboarding@resend.dev>";

  const response = await fetch("/api/sendEmail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: to.trim(),
      from: fromEmail,
      subject: `OSHA Records Export — ${companyName}`,
      html: buildEmailHtml({ companyName, records }),
      attachments: [
        {
          filename: `osha-records-${safeName}.pdf`,
          content: pdfBase64,
        },
      ],
    }),
  });

  if (!response.ok) {
    let message = `Failed to send email (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}

export async function exportAndEmailOshaRecords({ companyId, companyName, safetyEmail }) {
  const records = await fetchOshaRecords(companyId);
  const pdfDoc = await generateOshaPdf({ companyName, records });
  await sendOshaEmail({ to: safetyEmail, companyName, pdfDoc, records });
  return records;
}
