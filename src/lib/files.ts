/**
 * File handling — local disk for v3.4. Pluggable later for S3.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const FILES_DIR = process.env.FILES_DIR ?? "./uploads";

export async function saveFileBuffer(
  orgId: string,
  filename: string,
  buffer: Buffer
): Promise<{ storagePath: string; sizeBytes: number }> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(FILES_DIR, orgId);
  const full = path.join(dir, `${id}-${safeName}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(full, buffer);
  return { storagePath: full, sizeBytes: buffer.length };
}

export async function readFileBuffer(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await fs.unlink(storagePath);
  } catch {
    // ignore
  }
}

/**
 * Extract plain text from a binary file based on mime type.
 * Returns up to ~12k chars trimmed (enough for AI summarization).
 */
export async function extractText(filename: string, mimeType: string, buffer: Buffer): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  // HTML: strip tags + scripts + styles; collapse whitespace
  if (ext === "html" || ext === "htm" || mimeType === "text/html") {
    const raw = buffer.toString("utf-8");
    const stripped = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "$&\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return stripped.slice(0, 50000);
  }

  // Plain text family
  if (mimeType.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv") {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // DOCX via mammoth
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, 50000);
  }

  // PDF via pdf-parse
  if (mimeType === "application/pdf" || ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text.slice(0, 50000);
  }

  // Unsupported
  return "";
}
