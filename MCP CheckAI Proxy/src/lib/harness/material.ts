// ============================================================================
// Pillar: MATERIAL HANDLING
//
// Clean interfaces for passing work in and out of the harness. The harness
// never touches raw UI file objects directly — everything crosses this
// boundary as a normalized Material structure.
// ============================================================================

import type { MaterialFile, MaterialIn, MaterialOut } from "./types";
import { validateUefDocument, type UefDocument } from "@/lib/uef";

/** Normalize staged files into the canonical inbound Material. */
export function intake(files: MaterialFile[]): MaterialIn {
  const clean = files.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    content: f.content ?? "",
  }));
  const totalChars = clean.reduce((sum, f) => sum + f.content.length, 0);
  const summary = `${clean.length} file${clean.length === 1 ? "" : "s"} · ${totalChars.toLocaleString()} chars`;
  return { files: clean, totalChars, summary };
}

/** Count every record across the UEF document for reporting. */
export function countRecords(doc: UefDocument): number {
  let n = 0;
  for (const event of doc.events ?? []) {
    n += 1;
    if (event.venue) n += 1;
    if (event.customer) n += 1;
    n += (event.members as unknown[] | undefined)?.length ?? 0;
    n += (event.schedule_items as unknown[] | undefined)?.length ?? 0;
    n += (event.ledger_items as unknown[] | undefined)?.length ?? 0;
  }
  n += doc.leads?.length ?? 0;
  n += doc.setlists?.length ?? 0;
  return n;
}

/** Package a validated UEF document as outbound Material. */
export function emit(doc: UefDocument, confidence: number): MaterialOut {
  return {
    doc,
    confidence,
    recordCount: countRecords(doc),
  };
}

/** Convenience: derive a freshly validated report for the emitted material. */
export function reportFor(output: MaterialOut) {
  return validateUefDocument(output.doc);
}
