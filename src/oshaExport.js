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

function buildIncidentPhotosEmailHtml(incidents) {
  const incidentsWithPhotos = incidents.filter((incident) => getIncidentPhotoUrls(incident).length > 0);
  if (!incidentsWithPhotos.length) return "";

  let html = '<h2 style="color:#c83c00;font-size:16px;margin:24px 0 12px;">Incident Photos</h2>';
  incidentsWithPhotos.forEach((incident, index) => {
    const photos = getIncidentPhotoUrls(incident);
    const title = escapeHtml(`${incident.type || "Incident"} — ${incident.location || "Unknown location"}`);
    const reported = escapeHtml(formatTimestamp(incident.created_at));
    const images = photos
      .map(
        (url, photoIndex) =>
          `<img src="${escapeHtml(url)}" alt="Incident photo ${photoIndex + 1}" style="max-width:280px;max-height:280px;border:1px solid #ccc;border-radius:4px;margin:4px;" />`,
      )
      .join("");

    html += `
      <div style="margin-bottom:20px;padding:12px;border:1px solid #ddd;border-radius:4px;">
        <div style="font-weight:bold;margin-bottom:4px;">${index + 1}. ${title}</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px;">Reported: ${reported}</div>
        <div>${images}</div>
      </div>`;
  });

  return html;
}

function buildEmailHtml({ companyName, records }) {
  const exportedAt = formatTimestamp(new Date().toISOString());
  const incidentPhotosHtml = buildIncidentPhotosEmailHtml(records.incidents);

  return `
    <p>OSHA Panic Mode export for <strong>${escapeHtml(companyName)}</strong>.</p>
    <p>All safety records are attached as a PDF${incidentPhotosHtml ? ", including incident photos" : ""}. Exported ${escapeHtml(exportedAt)}.</p>
    ${incidentPhotosHtml}
  `;
}

export async function fetchOshaRecords(companyId) {
  const [machinesRes, inspectionsRes, incidentsRes, trainingRes] = await Promise.all([
    supabase.from("machines").select("*").eq("company_id", companyId).order("name"),
    supabase.from("inspections").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("incidents").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("training_records").select("*").eq("company_id", companyId).order("completed_date", { ascending: false }),
  ]);

  const errors = [machinesRes.error, inspectionsRes.error, incidentsRes.error, trainingRes.error].filter(Boolean);
  if (errors.length) {
    throw new Error(errors[0].message || "Failed to load records from Supabase");
  }

  return {
    machines: machinesRes.data || [],
    inspections: inspectionsRes.data || [],
    incidents: incidentsRes.data || [],
    trainingRecords: trainingRes.data || [],
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
      y = addField(doc, "Requires LOTO", machine.requires_loto ? "Yes" : "No", y);
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
      const machineName = machineMap[inspection.machine_id] || `Machine #${inspection.machine_id || "?"}`;
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

  return doc;
}

export async function sendOshaEmail({ to, companyName, pdfDoc, records }) {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend API key is not configured. Set VITE_RESEND_API_KEY in your environment.");
  }
  if (!to?.trim()) {
    throw new Error("No safety contact email configured. Add one in Supervisor Settings.");
  }

  const pdfBase64 = pdfDoc.output("datauristring").split(",")[1];
  const safeName = (companyName || "company").replace(/[^\w-]+/g, "-").toLowerCase();
  const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL || "ShopGuard <onboarding@resend.dev>";
  const resendUrl = "/api/resend/emails";

  const response = await fetch(resendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to.trim()],
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
