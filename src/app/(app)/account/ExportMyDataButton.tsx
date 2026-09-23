"use client";

/**
 * One-click data export. Navigates the browser to /api/me/export which
 * responds with Content-Disposition: attachment, so the browser downloads
 * the JSON file directly without opening a new tab.
 */
export function ExportMyDataButton() {
  function exportData() {
    window.location.href = "/api/me/export";
  }
  return (
    <button onClick={exportData} className="btn-secondary">
      ⬇ Download my data (JSON)
    </button>
  );
}
