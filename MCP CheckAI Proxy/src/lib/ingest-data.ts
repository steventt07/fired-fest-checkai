export type Category =
  | "Workflow"
  | "Assets"
  | "Payments"
  | "People"
  | "Timeline"
  | "Comms"
  | "Outcomes"
  | "Intake";

export type FileType =
  | "PDF"
  | "DOC"
  | "IMG"
  | "TXT"
  | "XLS"
  | "ICS"
  | "EML"
  | "JSON"
  | "MD"
  | "FILE";

export type EventFile = {
  id: string;
  type: FileType;
  name: string;
  size: string;
  category: Category;
  /** MCP primitive this file maps to, e.g. "outcomes.upsert" */
  primitive: string;
  /** Generated text content (present for synthetic files). */
  content?: string;
};

export const MCP_SERVER = "mcp.soundcheck.live";
export const OAUTH_ACCOUNT = "ops@summer-fest.co";

/**
 * The real Soundcheck MCP tool each category's data ultimately lands through.
 * Derived from uef-to-mcp-mapping.md — the tool that writes the platform record
 * for that UEF entity (Path C commit semantics: schedule/ledger ride in via
 * commit_ingestion_batch, members via add_event_member, etc).
 */
export const primitiveFor: Record<Category, string> = {
  Workflow: "create_event",
  Assets: "create_venue",
  Payments: "commit_ingestion_batch",
  People: "add_event_member",
  Timeline: "commit_ingestion_batch",
  Comms: "create_customer",
  Outcomes: "create_setlist",
  Intake: "request_booking",
};

/** Full MCP tool name for a primitive, e.g. "mcp.soundcheck.payments.upsert". */
export function fullToolName(primitive: string): string {
  return `mcp.soundcheck.${primitive}`;
}

/** Derive the category, primitive, and full tool name for a file. */
export function resolveToolCall(name: string, type: FileType) {
  const category = categoryForFile(name, type);
  const primitive = primitiveFor[category];
  return { category, primitive, tool: fullToolName(primitive) };
}

/** Map a file extension to a display file-type chip. */
function typeForExtension(ext: string): FileType {
  switch (ext) {
    case "pdf":
      return "PDF";
    case "doc":
    case "docx":
    case "rtf":
    case "pages":
      return "DOC";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "heic":
    case "bmp":
    case "tiff":
      return "IMG";
    case "txt":
      return "TXT";
    case "xls":
    case "xlsx":
    case "csv":
    case "numbers":
      return "XLS";
    case "ics":
      return "ICS";
    case "eml":
    case "msg":
      return "EML";
    case "json":
      return "JSON";
    case "md":
    case "markdown":
      return "MD";
    default:
      return "FILE";
  }
}

/** Infer the MCP category from the file name + type using keyword heuristics. */
function categoryForFile(name: string, type: FileType): Category {
  const n = name.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));

  if (has("invoice", "payout", "settlement", "payment", "deposit", "receipt", "budget")) {
    return "Payments";
  }
  if (has("contract", "agreement", "workflow", "sow", "proposal")) {
    return "Workflow";
  }
  if (has("schedule", "timeline", "load_in", "load-in", "loadin", "agenda", "run_of_show") || type === "ICS") {
    return "Timeline";
  }
  if (has("crew", "guest", "roster", "people", "pass", "staff", "attendee", "vip")) {
    return "People";
  }
  if (has("thread", "slack", "email", "comms", "message", "chat") || type === "EML") {
    return "Comms";
  }
  if (has("inquiry", "intake", "form", "submission", "request")) {
    return "Intake";
  }
  if (has("setlist", "notes", "soundcheck", "outcome", "recap", "report", "summary")) {
    return "Outcomes";
  }
  if (has("rider", "stage", "floorplan", "plot", "asset", "plan") || type === "IMG") {
    return "Assets";
  }
  return "Intake";
}

/** Format raw byte count to a compact human label. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let idCounter = 0;

/** Convert a browser File into the EventFile shape used across the UI. */
export function toEventFile(file: File): EventFile {
  const name = file.name;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const type = typeForExtension(ext);
  const category = categoryForFile(name, type);
  return {
    id: `${Date.now()}-${idCounter++}-${name}`,
    type,
    name,
    size: formatSize(file.size),
    category,
    primitive: primitiveFor[category],
  };
}

/** A synthetic file produced by the AI generator. */
export type GeneratedFile = {
  name: string;
  category: Category;
  content: string;
};

/** Build an EventFile (with content) from an AI-generated synthetic file. */
export function eventFileFromGenerated(gen: GeneratedFile): EventFile {
  const ext = gen.name.includes(".") ? gen.name.split(".").pop()!.toLowerCase() : "";
  const type = typeForExtension(ext);
  const category = gen.category;
  const bytes = new TextEncoder().encode(gen.content).length;
  return {
    id: `${Date.now()}-${idCounter++}-${gen.name}`,
    type,
    name: gen.name,
    size: formatSize(bytes),
    category,
    primitive: primitiveFor[category] ?? "intake.upsert",
    content: gen.content,
  };
}

/** Tailwind classes for category pills. */
export const categoryStyles: Record<Category, string> = {
  Workflow: "bg-violet-100 text-violet-700",
  Assets: "bg-rose-100 text-rose-600",
  Payments: "bg-teal-100 text-teal-700",
  People: "bg-emerald-100 text-emerald-700",
  Timeline: "bg-sky-100 text-sky-700",
  Comms: "bg-blue-100 text-blue-700",
  Outcomes: "bg-amber-100 text-amber-700",
  Intake: "bg-indigo-100 text-indigo-700",
};

/** Tailwind classes for the small file-type chips. */
export const fileTypeStyles: Record<FileType, string> = {
  PDF: "bg-rose-100 text-rose-500",
  DOC: "bg-blue-100 text-blue-500",
  IMG: "bg-pink-100 text-pink-500",
  TXT: "bg-slate-100 text-slate-500",
  XLS: "bg-emerald-100 text-emerald-500",
  ICS: "bg-violet-100 text-violet-500",
  EML: "bg-purple-100 text-purple-500",
  JSON: "bg-cyan-100 text-cyan-600",
  MD: "bg-slate-100 text-slate-500",
  FILE: "bg-slate-100 text-slate-400",
};
