import { jsPDF } from "jspdf";
import { applyCompanyIdFilter, fetchCompanyRecordIds } from "./companyIds";
import { isPhotoUrl } from "./photoStorage";
import { supabase } from "./supabase";

const PAGE_WIDTH = 215.9; // Standard Letter width in mm (8.5 inches)
const PAGE_HEIGHT = 279.4; // Standard Letter height in mm (11 inches)
const MARGIN_LEFT = 14;
const MARGIN_RIGHT = 14;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 187.9 mm

const BRAND_ORANGE = [255, 107, 0]; // ShopGuard Orange (#ff6b00)
const BRAND_DARK = [18, 21, 29]; // #12151d
const BRAND_SLATE = [30, 41, 59]; // #1e293b
const BRAND_MUTED = [100, 116, 139]; // #64748b
const BRAND_BORDER = [226, 232, 240]; // #e2e8f0
const BRAND_BG_LIGHT = [248, 250, 252]; // #f8fafc

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

function parsePpe(ppe) {
  if (!ppe) return "None required";
  if (Array.isArray(ppe)) return ppe.length ? ppe.join(", ") : "None required";
  if (typeof ppe === "string") {
    try {
      const parsed = JSON.parse(ppe);
      if (Array.isArray(parsed)) return parsed.length ? parsed.join(", ") : "None required";
      return ppe.trim() || "None required";
    } catch {
      return ppe.trim() || "None required";
    }
  }
  return "None required";
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

function emailSectionHeader(title, count) {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 28px; margin-bottom: 10px; border-bottom: 2px solid #ff6b00;">
      <tr>
        <td style="padding-bottom: 8px; vertical-align: middle;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width: 4px; height: 16px; background-color: #ff6b00; border-radius: 2px;"></td>
              <td style="padding-left: 10px;">
                <span style="font-size: 14px; font-weight: 800; color: #ffffff; letter-spacing: 1.5px; text-transform: uppercase;">${escapeHtml(title)}</span>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding-bottom: 8px; text-align: right; vertical-align: middle;">
          <span style="display: inline-block; padding: 2px 10px; font-size: 11px; font-weight: 700; color: #ff6b00; background-color: #2a1a00; border: 1px solid #ff6b00; border-radius: 12px; letter-spacing: 0.5px;">${count} RECORD${count === 1 ? "" : "S"}</span>
        </td>
      </tr>
    </table>
  `;
}

function emailEmptyTable(message) {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #12151d; border: 1px dashed #2a2e3a; border-radius: 6px;">
      <tr>
        <td style="padding: 20px; text-align: center; color: #888e9b; font-size: 13px; font-style: italic;">
          ${escapeHtml(message)}
        </td>
      </tr>
    </table>
  `;
}

function buildMachinesEmailHtml(machines) {
  const html = emailSectionHeader("Machines", machines.length);
  if (!machines.length) {
    return html + emailEmptyTable("No machine records on file.");
  }

  const rows = machines
    .map((machine, index) => {
      const bg = index % 2 === 0 ? "#161a23" : "#12151d";
      const activeBadge =
        machine.active === false
          ? `<span style="background-color: #2a2e3a; color: #9ca3af; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">INACTIVE</span>`
          : `<span style="background-color: #0f2a1a; color: #2ecc71; border: 1px solid #2ecc71; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">ACTIVE</span>`;

      const lotoBadge = machine.requires_loto
        ? `<span style="background-color: #2a1a00; color: #ff9800; border: 1px solid #ff6b00; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;">REQUIRED</span>`
        : `<span style="background-color: #1a1f2c; color: #888e9b; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600;">NOT REQUIRED</span>`;

      const sopCount = Array.isArray(machine.sop_steps) && machine.sop_steps.length;
      const sopDisplay = sopCount
        ? `<span style="color: #2ecc71; font-weight: 600;">${sopCount} step${sopCount === 1 ? "" : "s"}</span>`
        : `<span style="color: #6b7280;">None</span>`;

      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #232836;">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
            <div>${escapeHtml(machine.name || "Unnamed machine")}</div>
            <div style="margin-top: 4px;">${activeBadge}</div>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; vertical-align: middle;">
            ${lotoBadge}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: middle;">
            ${escapeHtml(parsePpe(machine.ppe))}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; vertical-align: middle;">
            ${sopDisplay}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; vertical-align: middle; white-space: nowrap;">
            ${escapeHtml(formatDate(machine.created_at))}
          </td>
        </tr>
      `;
    })
    .join("");

  return (
    html +
    `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e2433; border-bottom: 2px solid #ff6b00;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Machine</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">LOTO</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Required PPE</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">SOP</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Date Added</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );
}

function buildInspectionsEmailHtml(inspections, machineMap) {
  const html = emailSectionHeader("Inspections", inspections.length);
  if (!inspections.length) {
    return html + emailEmptyTable("No inspection records on file.");
  }

  const rows = inspections
    .map((inspection, index) => {
      const bg = index % 2 === 0 ? "#161a23" : "#12151d";
      const machineName = getInspectionMachineName(inspection, machineMap);
      const passedBadge = inspection.passed
        ? `<span style="background-color: #0f2a1a; color: #2ecc71; border: 1px solid #2ecc71; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">✓ PASSED</span>`
        : `<span style="background-color: #3a1a1a; color: #e74c3c; border: 1px solid #e74c3c; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">✗ FAILED</span>`;

      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #232836;">
          <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(formatTimestamp(inspection.created_at))}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
            ${escapeHtml(machineName)}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #e5e7eb; vertical-align: top;">
            ${escapeHtml(inspection.employee_name || "—")}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; vertical-align: top; text-align: center;">
            ${passedBadge}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: top;">
            ${escapeHtml(inspection.notes || "No notes entered")}
          </td>
        </tr>
      `;
    })
    .join("");

  return (
    html +
    `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e2433; border-bottom: 2px solid #ff6b00;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Date &amp; Time</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Machine</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Inspector</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: center; text-transform: uppercase; letter-spacing: 1px;">Result</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );
}

function buildIncidentsEmailHtml(incidents) {
  const html = emailSectionHeader("Incidents", incidents.length);
  if (!incidents.length) {
    return html + emailEmptyTable("No incident records on file.");
  }

  const rows = incidents
    .map((incident, index) => {
      const bg = index % 2 === 0 ? "#161a23" : "#12151d";
      const photos = getIncidentPhotoUrls(incident);

      const statusLower = String(incident.status || "").toLowerCase();
      let statusBadge = `<span style="background-color: #1a2030; color: #93c5fd; border: 1px solid #3b82f6; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHtml(incident.status || "REPORTED")}</span>`;
      if (statusLower.includes("resolv") || statusLower.includes("closed")) {
        statusBadge = `<span style="background-color: #0f2a1a; color: #2ecc71; border: 1px solid #2ecc71; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHtml(incident.status || "RESOLVED")}</span>`;
      } else if (statusLower.includes("open") || statusLower.includes("critical")) {
        statusBadge = `<span style="background-color: #3a1a1a; color: #e74c3c; border: 1px solid #e74c3c; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHtml(incident.status || "OPEN")}</span>`;
      } else if (statusLower.includes("investigat")) {
        statusBadge = `<span style="background-color: #2a1a00; color: #ff9800; border: 1px solid #ff6b00; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">INVESTIGATING</span>`;
      }

      const photoElements = photos.length
        ? `<div style="margin-top: 8px;">
            <div style="font-size: 10px; font-weight: 800; color: #ff6b00; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;">Attached Photos (${photos.length}):</div>
            ${photos
              .map(
                (url, photoIndex) =>
                  `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration: none; display: inline-block;"><img src="${escapeHtml(url)}" alt="Incident Photo ${photoIndex + 1}" width="68" height="68" style="width: 68px; height: 68px; object-fit: cover; border-radius: 4px; border: 1px solid #ff6b00; margin: 2px 4px 2px 0; display: inline-block; vertical-align: middle;" /></a>`,
              )
              .join("")}
          </div>`
        : "";

      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #232836;">
          <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(formatTimestamp(incident.created_at))}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
            <div>${escapeHtml(incident.type || "Incident")}</div>
            <div style="margin-top: 4px;">${statusBadge}</div>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: top;">
            <div style="font-weight: 700; color: #ffffff;">${escapeHtml(incident.location || "Unknown location")}</div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">By: ${escapeHtml(incident.reported_by || "—")}</div>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: top;">
            <div>${escapeHtml(incident.description || "No description provided")}</div>
            ${photoElements}
          </td>
        </tr>
      `;
    })
    .join("");

  return (
    html +
    `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e2433; border-bottom: 2px solid #ff6b00;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Reported</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Type &amp; Status</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Location / Reporter</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Description &amp; Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );
}

function buildTrainingEmailHtml(trainingRecords) {
  const html = emailSectionHeader("Training Records", trainingRecords.length);
  if (!trainingRecords.length) {
    return html + emailEmptyTable("No training records on file.");
  }

  const rows = trainingRecords
    .map((record, index) => {
      const bg = index % 2 === 0 ? "#161a23" : "#12151d";
      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #232836;">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
            ${escapeHtml(record.employee_name || "—")}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #ff6b00; font-weight: 600; vertical-align: top;">
            ${escapeHtml(record.training_type || "Training")}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #2ecc71; font-weight: 600; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(formatDate(record.completed_date))}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(formatTimestamp(record.created_at))}
          </td>
        </tr>
      `;
    })
    .join("");

  return (
    html +
    `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e2433; border-bottom: 2px solid #ff6b00;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Employee</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Training Type</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Completed Date</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Logged In System</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );
}

function buildSafetyMeetingsEmailHtml(meetings) {
  const html = emailSectionHeader("Safety Meetings", meetings.length);
  if (!meetings.length) {
    return html + emailEmptyTable("No safety meeting records on file.");
  }

  const rows = meetings
    .map((meeting, index) => {
      const bg = index % 2 === 0 ? "#161a23" : "#12151d";
      const meetingDate = meeting.meeting_date || meeting.created_at;
      const notes = meeting.notes || meeting.topic || "—";
      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #232836;">
          <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(formatDate(meetingDate))}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
            ${escapeHtml(meeting.topic || "Safety Meeting")}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #e5e7eb; vertical-align: top;">
            ${escapeHtml(meeting.led_by || "—")}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: top;">
            ${escapeHtml(formatAttendees(meeting.attendees))}
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #cbd5e1; vertical-align: top;">
            ${escapeHtml(notes)}
          </td>
        </tr>
      `;
    })
    .join("");

  return (
    html +
    `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e2433; border-bottom: 2px solid #ff6b00;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Meeting Date</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Topic</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Led By</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Attendees</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 800; color: #ff6b00; text-align: left; text-transform: uppercase; letter-spacing: 1px;">Notes / Summary</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );
}

function buildEmailHtml({ companyName, records }) {
  const exportedAt = formatTimestamp(new Date().toISOString());
  const machineMap = Object.fromEntries(records.machines.map((machine) => [machine.id, machine.name]));
  const safetyMeetings = records.safetyMeetings || [];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShopGuard Safety Compliance Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0d13; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #e5e7eb;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0b0d13; width: 100%; margin: 0; padding: 24px 8px;">
    <tr>
      <td align="center" style="vertical-align: top;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 760px; width: 100%; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 8px; overflow: hidden;">
          <!-- Top Orange Brand Line -->
          <tr>
            <td style="height: 4px; background-color: #ff6b00; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px 20px; background-color: #12151d; border-bottom: 1px solid #262b38;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align: top;">
                    <div style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; line-height: 1;">
                      SHOP<span style="color: #ff6b00;">GUARD</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">
                      SAFETY MANAGEMENT PLATFORM
                    </div>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <span style="display: inline-block; background-color: #2a1a00; color: #ff6b00; border: 1px solid #ff6b00; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                      OFFICIAL COMPLIANCE EXPORT
                    </span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 18px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                      ShopGuard Safety Compliance Report
                    </h1>
                    <div style="font-size: 13px; color: #9ca3af; margin-top: 4px;">
                      Full OSHA-ready safety and compliance documentation export.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Company & Generation Meta Banner -->
          <tr>
            <td style="padding: 16px 28px; background-color: #181c26; border-bottom: 1px solid #262b38;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align: middle; padding-right: 16px;">
                    <div style="font-size: 10px; font-weight: 800; color: #ff6b00; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px;">
                      COMPANY NAME
                    </div>
                    <div style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                      ${escapeHtml(companyName)}
                    </div>
                  </td>
                  <td style="vertical-align: middle; text-align: right;">
                    <div style="font-size: 10px; font-weight: 800; color: #ff6b00; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px;">
                      DATE GENERATED
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff;">
                      ${escapeHtml(exportedAt)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Metrics Cards -->
          <tr>
            <td style="padding: 16px 28px; background-color: #12151d; border-bottom: 1px solid #262b38;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 4px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 4px; width: 20%;">
                    <div style="font-size: 20px; font-weight: 900; color: #ff6b00; line-height: 1;">${records.machines.length}</div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">MACHINES</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td align="center" style="padding: 8px 4px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 4px; width: 20%;">
                    <div style="font-size: 20px; font-weight: 900; color: #ff6b00; line-height: 1;">${records.inspections.length}</div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">INSPECTIONS</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td align="center" style="padding: 8px 4px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 4px; width: 20%;">
                    <div style="font-size: 20px; font-weight: 900; color: #ff6b00; line-height: 1;">${records.incidents.length}</div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">INCIDENTS</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td align="center" style="padding: 8px 4px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 4px; width: 20%;">
                    <div style="font-size: 20px; font-weight: 900; color: #ff6b00; line-height: 1;">${records.trainingRecords.length}</div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">TRAINING</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td align="center" style="padding: 8px 4px; background-color: #161a23; border: 1px solid #2a2e3a; border-radius: 4px; width: 20%;">
                    <div style="font-size: 20px; font-weight: 900; color: #ff6b00; line-height: 1;">${safetyMeetings.length}</div>
                    <div style="font-size: 10px; font-weight: 800; color: #888e9b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">MEETINGS</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notice banner about PDF -->
          <tr>
            <td style="padding: 12px 28px; background-color: #0f131a; border-bottom: 1px solid #262b38;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 12px; color: #9ca3af; line-height: 1.4;">
                    <strong style="color: #ffffff;">Audit Note:</strong> A complete, official PDF copy of this compliance export is attached (<span style="color: #ff6b00; font-family: monospace;">osha-records.pdf</span>).
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Sections -->
          <tr>
            <td style="padding: 12px 28px 24px;">
              ${buildMachinesEmailHtml(records.machines)}
              ${buildInspectionsEmailHtml(records.inspections, machineMap)}
              ${buildIncidentsEmailHtml(records.incidents)}
              ${buildTrainingEmailHtml(records.trainingRecords)}
              ${buildSafetyMeetingsEmailHtml(safetyMeetings)}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 28px; background-color: #12151d; border-top: 2px solid #ff6b00; text-align: center;">
              <div style="font-size: 13px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin-bottom: 4px;">
                Generated by ShopGuard Safety Management Platform
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #ff6b00; letter-spacing: 0.5px; margin-bottom: 10px;">
                ${escapeHtml(exportedAt)}
              </div>
              <div style="font-size: 11px; color: #6b7280; line-height: 1.5; max-width: 520px; margin: 0 auto;">
                Official compliance record prepared for OSHA inspection and safety audit review.
                All logs timestamped and digitally secured by ShopGuard.
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

export async function fetchOshaRecords(companyId, companyCode) {
  if (!companyId) {
    throw new Error("Company ID is required to export OSHA records.");
  }

  const companyIds = await fetchCompanyRecordIds(supabase, companyId, companyCode);

  const [machinesRes, inspectionsRes, incidentsRes, trainingRes, meetingsRes] = await Promise.all([
    applyCompanyIdFilter(
      supabase
        .from("machines")
        .select("id, created_at, company_id, name, requires_loto, ppe, active, sop_steps"),
      companyIds,
    ).order("name"),
    applyCompanyIdFilter(
      supabase
        .from("inspections")
        .select("id, created_at, company_id, machine_id, employee_id, employee_name, passed, notes, machines(name)"),
      companyIds,
    ).order("created_at", { ascending: false }),
    applyCompanyIdFilter(
      supabase
        .from("incidents")
        .select("id, created_at, company_id, type, location, description, reported_by, status, photo_urls"),
      companyIds,
    ).order("created_at", { ascending: false }),
    applyCompanyIdFilter(
      supabase
        .from("training_records")
        .select("id, created_at, company_id, employee_id, employee_name, training_type, completed_date"),
      companyIds,
    ).order("completed_date", { ascending: false }),
    applyCompanyIdFilter(
      supabase
        .from("safety_meetings")
        .select("id, created_at, company_id, meeting_date, topic, notes, led_by, attendees"),
      companyIds,
    ).order("meeting_date", { ascending: false }),
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

function drawPageHeader(doc, sectionName, isContinuation = false) {
  // Top orange banner strip
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, PAGE_WIDTH, 3.5, "F");

  // Running header text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_SLATE);
  doc.text("ShopGuard Safety Compliance Report", MARGIN_LEFT, 13);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_ORANGE);
  const headerRightText = isContinuation
    ? `${sectionName.toUpperCase()} (CONT.)`
    : sectionName.toUpperCase();
  doc.text(headerRightText, PAGE_WIDTH - MARGIN_RIGHT, 13, { align: "right" });

  // Divider rule below header
  doc.setDrawColor(...BRAND_BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, 16, PAGE_WIDTH - MARGIN_RIGHT, 16);
}

function applyCellFormatting(doc, col, rawVal, isPrimaryCol) {
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85); // Slate 700

  const str = String(rawVal ?? "").trim();
  const lower = str.toLowerCase();

  if (col.key === "result") {
    if (lower === "passed") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 163, 74); // Green #16a34a
    } else if (lower === "failed") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38); // Red #dc2626
    }
  } else if (col.key === "loto") {
    if (lower === "yes") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(234, 88, 12); // Orange #ea580c
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // Slate #64748b
    }
  } else if (col.key === "status") {
    if (lower.includes("open") || lower.includes("critical")) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38);
    } else if (lower.includes("resolv") || lower.includes("closed")) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 163, 74);
    } else if (lower.includes("investigat")) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(234, 88, 12);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 65, 85);
    }
  } else if (isPrimaryCol) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(18, 21, 29);
  }
}

function renderSectionTable(doc, {
  sectionName,
  sectionTitle,
  columns,
  rows,
  emptyMessage = "No records on file.",
}) {
  // Each section starts on its own new page
  doc.addPage();

  drawPageHeader(doc, sectionName, false);

  // Section title banner
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_DARK);
  doc.text(sectionTitle || sectionName, MARGIN_LEFT, 25);

  // Total count indicator on the right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND_ORANGE);
  const countText = `${rows.length} RECORD${rows.length === 1 ? "" : "S"}`;
  doc.text(countText, PAGE_WIDTH - MARGIN_RIGHT, 25, { align: "right" });

  // Orange accent bar under section title
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(MARGIN_LEFT, 28, 24, 1.2, "F");
  doc.setDrawColor(...BRAND_BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_LEFT + 24, 28.6, PAGE_WIDTH - MARGIN_RIGHT, 28.6);

  let y = 34;

  const HEADER_HEIGHT = 8;
  const CELL_PAD_X = 2.5;
  const CELL_PAD_Y = 2;
  const LINE_HEIGHT = 3.8;
  const MIN_ROW_HEIGHT = 7.5;

  function drawTableHeader(atY) {
    doc.setFillColor(...BRAND_ORANGE);
    doc.rect(MARGIN_LEFT, atY, USABLE_WIDTH, HEADER_HEIGHT, "F");

    let colX = MARGIN_LEFT;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    for (const col of columns) {
      let textX = colX + CELL_PAD_X;
      if (col.align === "center") {
        textX = colX + col.width / 2;
      } else if (col.align === "right") {
        textX = colX + col.width - CELL_PAD_X;
      }
      doc.text(col.header.toUpperCase(), textX, atY + 5.2, { align: col.align || "left" });
      colX += col.width;
    }
    return atY + HEADER_HEIGHT;
  }

  y = drawTableHeader(y);

  if (!rows.length) {
    const emptyHeight = 14;
    doc.setFillColor(...BRAND_BG_LIGHT);
    doc.rect(MARGIN_LEFT, y, USABLE_WIDTH, emptyHeight, "F");
    doc.setDrawColor(...BRAND_BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_LEFT, y + emptyHeight, PAGE_WIDTH - MARGIN_RIGHT, y + emptyHeight);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(emptyMessage, PAGE_WIDTH / 2, y + 8.5, { align: "center" });
    return;
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    doc.setFontSize(8);
    const colLines = columns.map((col) => {
      const rawVal = row[col.key] ?? "—";
      const strVal = String(rawVal === "" ? "—" : rawVal).trim() || "—";
      return doc.splitTextToSize(strVal, col.width - CELL_PAD_X * 2);
    });

    const maxLines = Math.max(...colLines.map((lines) => lines.length), 1);
    const rowHeight = Math.max(MIN_ROW_HEIGHT, maxLines * LINE_HEIGHT + CELL_PAD_Y * 2);

    if (y + rowHeight > PAGE_HEIGHT - 16) {
      doc.addPage();
      drawPageHeader(doc, sectionName, true);
      y = 22;
      y = drawTableHeader(y);
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(...BRAND_BG_LIGHT);
      doc.rect(MARGIN_LEFT, y, USABLE_WIDTH, rowHeight, "F");
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(MARGIN_LEFT, y, USABLE_WIDTH, rowHeight, "F");
    }

    doc.setDrawColor(...BRAND_BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_LEFT, y + rowHeight, PAGE_WIDTH - MARGIN_RIGHT, y + rowHeight);

    let colX = MARGIN_LEFT;
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      const lines = colLines[colIdx];
      const rawVal = row[col.key];

      applyCellFormatting(doc, col, rawVal, colIdx === 0);

      let textX = colX + CELL_PAD_X;
      if (col.align === "center") {
        textX = colX + col.width / 2;
      } else if (col.align === "right") {
        textX = colX + col.width - CELL_PAD_X;
      }

      let lineY = y + CELL_PAD_Y + 3.0;
      for (const line of lines) {
        doc.text(line, textX, lineY, { align: col.align || "left" });
        lineY += LINE_HEIGHT;
      }

      colX += col.width;
    }

    y += rowHeight;
  }
}

function renderCoverPage(doc, { companyName, records, exportedAt }) {
  // Header showing "ShopGuard Safety Compliance Report" and Section Name "Executive Summary"
  drawPageHeader(doc, "Executive Summary", false);

  // ShopGuard Logo Mark & Platform title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND_DARK);
  doc.text("SHOP", MARGIN_LEFT, 27);
  const shopWidth = doc.getTextWidth("SHOP");
  doc.setTextColor(...BRAND_ORANGE);
  doc.text("GUARD", MARGIN_LEFT + shopWidth, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_MUTED);
  doc.text("SAFETY MANAGEMENT & REGULATORY COMPLIANCE SYSTEM", MARGIN_LEFT, 33);

  // Accent line
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(MARGIN_LEFT, 36, 28, 1.2, "F");

  // Title: "ShopGuard Safety Compliance Report"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_DARK);
  doc.text("ShopGuard Safety Compliance Report", MARGIN_LEFT, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_MUTED);
  doc.text("Official Workplace Safety, Inspection, Incident & Training Records", MARGIN_LEFT, 52);

  // Metadata Card (Company name, date & time generated)
  const cardY = 58;
  const cardH = 34;
  doc.setFillColor(...BRAND_BG_LIGHT);
  doc.setDrawColor(...BRAND_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_LEFT, cardY, USABLE_WIDTH, cardH, 2, 2, "FD");

  // Orange accent stripe on left of card
  doc.setFillColor(...BRAND_ORANGE);
  doc.roundedRect(MARGIN_LEFT, cardY, 3, cardH, 1, 1, "F");

  // Company Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_ORANGE);
  doc.text("COMPANY / FACILITY", MARGIN_LEFT + 8, cardY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_DARK);
  doc.text(companyName || "ShopGuard Client Facility", MARGIN_LEFT + 8, cardY + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_MUTED);
  doc.text("COMPLIANCE SCOPE", MARGIN_LEFT + 8, cardY + 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text("Full OSHA Audit & Equipment Verification Log", MARGIN_LEFT + 8, cardY + 29);

  // Date and Time Generated
  const midX = MARGIN_LEFT + USABLE_WIDTH / 2 + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_ORANGE);
  doc.text("DATE & TIME GENERATED", midX, cardY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text(exportedAt, midX, cardY + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_MUTED);
  doc.text("SYSTEM ARCHIVE STATUS", midX, cardY + 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text("Verified Official Compliance Export", midX, cardY + 29);

  // Summary Stats Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  doc.text("EXECUTIVE SUMMARY & RECORD TOTALS", MARGIN_LEFT, 102);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_MUTED);
  doc.text("Total record counts across all facility safety tracking modules:", MARGIN_LEFT, 107);

  // 5 Summary Stat Cards:
  // Row 1: Machines, Inspections, Incidents (3 cards)
  // Row 2: Training Records, Safety Meetings (2 cards)
  const machineCount = records.machines.length;
  const inspectionCount = records.inspections.length;
  const incidentCount = records.incidents.length;
  const trainingCount = records.trainingRecords.length;
  const meetingCount = (records.safetyMeetings || []).length;

  const cardGap = 5;
  const row1CardW = (USABLE_WIDTH - cardGap * 2) / 3;
  const row1Y = 113;
  const cardH1 = 28;

  const statsRow1 = [
    { label: "MACHINES", count: machineCount, sub: "Equipment registered" },
    { label: "INSPECTIONS", count: inspectionCount, sub: "Completed logs" },
    { label: "INCIDENTS", count: incidentCount, sub: "Reported events" },
  ];

  statsRow1.forEach((st, i) => {
    const cx = MARGIN_LEFT + i * (row1CardW + cardGap);
    doc.setFillColor(...BRAND_BG_LIGHT);
    doc.setDrawColor(...BRAND_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, row1Y, row1CardW, cardH1, 1.5, 1.5, "FD");

    doc.setFillColor(...BRAND_ORANGE);
    doc.rect(cx, row1Y, row1CardW, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND_ORANGE);
    doc.text(String(st.count), cx + row1CardW / 2, row1Y + 12, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_DARK);
    doc.text(st.label, cx + row1CardW / 2, row1Y + 19, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(st.sub, cx + row1CardW / 2, row1Y + 24, { align: "center" });
  });

  const row2CardW = (USABLE_WIDTH - cardGap) / 2;
  const row2Y = 146;
  const cardH2 = 28;

  const statsRow2 = [
    { label: "TRAINING RECORDS", count: trainingCount, sub: "Certifications logged" },
    { label: "SAFETY MEETINGS", count: meetingCount, sub: "Safety briefings held" },
  ];

  statsRow2.forEach((st, i) => {
    const cx = MARGIN_LEFT + i * (row2CardW + cardGap);
    doc.setFillColor(...BRAND_BG_LIGHT);
    doc.setDrawColor(...BRAND_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, row2Y, row2CardW, cardH2, 1.5, 1.5, "FD");

    doc.setFillColor(...BRAND_ORANGE);
    doc.rect(cx, row2Y, row2CardW, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND_ORANGE);
    doc.text(String(st.count), cx + row2CardW / 2, row2Y + 12, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_DARK);
    doc.text(st.label, cx + row2CardW / 2, row2Y + 19, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(st.sub, cx + row2CardW / 2, row2Y + 24, { align: "center" });
  });

  // Report Section Index Box
  const indexY = 182;
  doc.setFillColor(...BRAND_BG_LIGHT);
  doc.setDrawColor(...BRAND_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_LEFT, indexY, USABLE_WIDTH, 52, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_ORANGE);
  doc.text("REPORT SECTIONS & DOCUMENT DIRECTORY", MARGIN_LEFT + 8, indexY + 9);

  doc.setDrawColor(...BRAND_BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_LEFT + 8, indexY + 12, MARGIN_LEFT + USABLE_WIDTH - 8, indexY + 12);

  const sectionsList = [
    { page: "Page 2", name: "Machines Inventory", detail: `${machineCount} records • PPE & LOTO Requirements` },
    { page: "Page 3", name: "Safety Inspections", detail: `${inspectionCount} records • Checklists & Sign-Offs` },
    { page: "Page 4", name: "Safety Incidents", detail: `${incidentCount} records • Incident Reports & Status` },
    { page: "Page 5", name: "Training Records", detail: `${trainingCount} records • Certifications & Dates` },
    { page: "Page 6", name: "Safety Meetings", detail: `${meetingCount} records • Topics & Attendance` },
  ];

  let itemY = indexY + 18;
  sectionsList.forEach((sec) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_ORANGE);
    doc.text(sec.page, MARGIN_LEFT + 8, itemY);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text(sec.name, MARGIN_LEFT + 28, itemY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_MUTED);
    doc.text(sec.detail, MARGIN_LEFT + 75, itemY);

    itemY += 6.5;
  });

  // Audit Compliance Note
  const noteY = 241;
  doc.setFillColor(255, 247, 237); // #fff7ed
  doc.setDrawColor(255, 107, 0);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_LEFT, noteY, USABLE_WIDTH, 17, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_ORANGE);
  doc.text("AUDIT & COMPLIANCE VERIFICATION NOTICE", MARGIN_LEFT + 6, noteY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "This official report has been compiled from authenticated digital records for OSHA review and workplace safety compliance.",
    MARGIN_LEFT + 6,
    noteY + 11,
  );
  doc.text(
    "All inspection sign-offs, incident logs, and training certifications are digitally tracked and archived by ShopGuard.",
    MARGIN_LEFT + 6,
    noteY + 15,
  );
}

function applyPageFooters(doc, companyName, exportedAt) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    doc.setDrawColor(...BRAND_BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_LEFT, PAGE_HEIGHT - 10, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_MUTED);

    if (p === 1) {
      doc.text(
        "Official Safety Compliance Documentation • Prepared for OSHA Audit Review",
        MARGIN_LEFT,
        PAGE_HEIGHT - 5.5,
      );
      doc.text("Cover Page", PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 5.5, { align: "right" });
    } else {
      doc.text(
        `ShopGuard Safety Compliance Report • ${companyName || "Facility"} • ${exportedAt}`,
        MARGIN_LEFT,
        PAGE_HEIGHT - 5.5,
      );
      doc.text(`Page ${p} of ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 5.5, {
        align: "right",
      });
    }
  }
}

export async function generateOshaPdf({ companyName, records }) {
  const safeRecords = {
    machines: [],
    inspections: [],
    incidents: [],
    trainingRecords: [],
    safetyMeetings: [],
    ...(records || {}),
  };

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const exportedAt = formatTimestamp(new Date().toISOString());
  const machineMap = Object.fromEntries(safeRecords.machines.map((m) => [m.id, m.name]));

  // Page 1 - Cover Page
  renderCoverPage(doc, {
    companyName,
    records: safeRecords,
    exportedAt,
  });

  // Page 2 - Machines Table
  const machineRows = safeRecords.machines.map((m) => {
    let name = m.name || "Unnamed machine";
    if (m.active === false) name += " (Inactive)";
    return {
      machine_name: name,
      ppe_required: parsePpe(m.ppe),
      loto: m.requires_loto ? "Yes" : "No",
      date_added: formatDate(m.created_at),
    };
  });

  renderSectionTable(doc, {
    sectionName: "Machines",
    sectionTitle: "Machines Inventory",
    columns: [
      { key: "machine_name", header: "Machine Name", width: 55, align: "left" },
      { key: "ppe_required", header: "PPE Required", width: 65, align: "left" },
      { key: "loto", header: "LOTO Required", width: 32, align: "center" },
      { key: "date_added", header: "Date Added", width: 35.9, align: "center" },
    ],
    rows: machineRows,
    emptyMessage: "No machine records on file.",
  });

  // Page 3 - Inspections Table
  const inspectionRows = safeRecords.inspections.map((i) => ({
    date_time: formatTimestamp(i.created_at),
    machine_name: getInspectionMachineName(i, machineMap),
    inspector_name: i.employee_name || "—",
    result: i.passed ? "Passed" : "Failed",
    notes: i.notes || "—",
  }));

  renderSectionTable(doc, {
    sectionName: "Inspections",
    sectionTitle: "Safety Inspections Log",
    columns: [
      { key: "date_time", header: "Date & Time", width: 38, align: "left" },
      { key: "machine_name", header: "Machine Name", width: 42, align: "left" },
      { key: "inspector_name", header: "Inspector Name", width: 36, align: "left" },
      { key: "result", header: "Result", width: 26, align: "center" },
      { key: "notes", header: "Notes", width: 45.9, align: "left" },
    ],
    rows: inspectionRows,
    emptyMessage: "No inspection records on file.",
  });

  // Page 4 - Incidents Table
  const incidentRows = safeRecords.incidents.map((inc) => {
    const photoUrls = getIncidentPhotoUrls(inc);
    let desc = inc.description || "—";
    if (photoUrls.length) {
      desc += `\n[${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""} attached]`;
    }
    return {
      date_reported: formatDate(inc.created_at),
      type: inc.type || "Incident",
      location: inc.location || "—",
      description: desc,
      reported_by: inc.reported_by || "—",
      status: inc.status || "Reported",
    };
  });

  renderSectionTable(doc, {
    sectionName: "Incidents",
    sectionTitle: "Safety Incidents Log",
    columns: [
      { key: "date_reported", header: "Date Reported", width: 30, align: "center" },
      { key: "type", header: "Type", width: 28, align: "left" },
      { key: "location", header: "Location", width: 28, align: "left" },
      { key: "description", header: "Description", width: 50.9, align: "left" },
      { key: "reported_by", header: "Reported By", width: 26, align: "left" },
      { key: "status", header: "Status", width: 25, align: "center" },
    ],
    rows: incidentRows,
    emptyMessage: "No incident records on file.",
  });

  // Page 5 - Training Records Table
  const trainingRows = safeRecords.trainingRecords.map((t) => ({
    employee_name: t.employee_name || "—",
    training_type: t.training_type || "Training",
    completion_date: formatDate(t.completed_date),
  }));

  renderSectionTable(doc, {
    sectionName: "Training Records",
    sectionTitle: "Employee Training Records",
    columns: [
      { key: "employee_name", header: "Employee Name", width: 65, align: "left" },
      { key: "training_type", header: "Training Type", width: 75, align: "left" },
      { key: "completion_date", header: "Completion Date", width: 47.9, align: "center" },
    ],
    rows: trainingRows,
    emptyMessage: "No training records on file.",
  });

  // Page 6 - Safety Meetings Table
  const safetyMeetings = safeRecords.safetyMeetings || [];
  const meetingRows = safetyMeetings.map((m) => ({
    date: formatDate(m.meeting_date || m.created_at),
    topic: m.topic || "Safety Meeting",
    led_by: m.led_by || "—",
    attendees: formatAttendees(m.attendees),
  }));

  renderSectionTable(doc, {
    sectionName: "Safety Meetings",
    sectionTitle: "Safety Meetings Log",
    columns: [
      { key: "date", header: "Date", width: 34, align: "center" },
      { key: "topic", header: "Topic", width: 56, align: "left" },
      { key: "led_by", header: "Led By", width: 40, align: "left" },
      { key: "attendees", header: "Attendees", width: 57.9, align: "left" },
    ],
    rows: meetingRows,
    emptyMessage: "No safety meeting records on file.",
  });

  // Apply running footers with total page count across all generated pages
  applyPageFooters(doc, companyName, exportedAt);

  return doc;
}

export async function sendOshaEmail({ to, companyName, pdfDoc, records }) {
  if (!to?.trim()) {
    throw new Error("No safety contact email configured. Add one in Supervisor Settings.");
  }

  const pdfBase64 = pdfDoc.output("datauristring").split(",")[1];
  const safeName = (companyName || "company").replace(/[^\w-]+/g, "-").toLowerCase();
  const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL || "ShopGuard Alerts <alerts@shopguardapp.com>";

  const response = await fetch("/api/sendEmail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: to.trim(),
      from: fromEmail,
      subject: `ShopGuard Safety Compliance Report — ${companyName}`,
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

export async function exportAndEmailOshaRecords({ companyId, companyCode, companyName, safetyEmail }) {
  const records = await fetchOshaRecords(companyId, companyCode);
  const pdfDoc = await generateOshaPdf({ companyName, records });
  await sendOshaEmail({ to: safetyEmail, companyName, pdfDoc, records });
  return records;
}
