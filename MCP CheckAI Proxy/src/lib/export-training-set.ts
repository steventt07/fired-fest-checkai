import JSZip from "jszip";

import type { PersistedFile } from "@/lib/generate.functions";

/** Round a timestamp to the minute so files from one generation run group together. */
export function runKeyOf(createdAt: string): string {
  const d = new Date(createdAt);
  d.setSeconds(0, 0);
  return d.toISOString();
}

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function looksBase64(s: string): boolean {
  const t = s.trim();
  if (t.length < 16 || t.length % 4 !== 0) return false;
  return B64_RE.test(t);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ensure unique file names inside the zip. */
function uniqueName(used: Set<string>, name: string): string {
  let candidate = name;
  let n = 1;
  while (used.has(candidate)) {
    const dot = name.lastIndexOf(".");
    candidate =
      dot === -1 ? `${name} (${n})` : `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

export type ExportFilters = {
  eventType?: string | null;
  category?: string | null;
  runKey?: string | null;
};

export function applyFilters(
  files: PersistedFile[],
  f: ExportFilters,
): PersistedFile[] {
  return files.filter((file) => {
    if (f.eventType && file.event_type !== f.eventType) return false;
    if (f.category && (file.category_override ?? file.category) !== f.category)
      return false;
    if (f.runKey && runKeyOf(file.created_at) !== f.runKey) return false;
    return true;
  });
}

/** Build a ZIP (Blob) of actual files plus a JSONL manifest with metadata + annotations. */
export async function buildExportZip(files: PersistedFile[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  const filesDir = zip.folder("files")!;
  const manifestLines: string[] = [];

  for (const file of files) {
    const content = file.content ?? "";
    const safeName = uniqueName(used, file.name || `${file.id}.bin`);
    const isBinary =
      ["pdf", "xlsx", "docx", "png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(
        file.file_type.toLowerCase(),
      ) && looksBase64(content);

    if (isBinary) {
      filesDir.file(safeName, base64ToBytes(content));
    } else {
      filesDir.file(safeName, content);
    }

    manifestLines.push(
      JSON.stringify({
        id: file.id,
        path: `files/${safeName}`,
        name: file.name,
        file_type: file.file_type,
        category: file.category,
        category_override: file.category_override,
        effective_category: file.category_override ?? file.category,
        category_correct: file.category_correct,
        quality: file.quality,
        size: file.size,
        event_type: file.event_type,
        created_at: file.created_at,
      }),
    );
  }

  zip.file("manifest.jsonl", manifestLines.join("\n"));
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
