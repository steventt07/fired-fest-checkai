import { useMemo } from "react";

type Props = {
  name: string;
  fileType: string;
  content: string;
};

/** Detect whether a string is a base64 (no whitespace, base64 charset) blob. */
function looksBase64(s: string): boolean {
  const t = s.trim();
  if (t.length < 16 || t.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(t);
}

/** Pull raw bytes out of a data: URL or bare base64 string. */
function toDataUrl(content: string, mime: string): string | null {
  const t = content.trim();
  if (t.startsWith("data:")) return t;
  if (looksBase64(t)) return `data:${mime};base64,${t}`;
  return null;
}

function ext(name: string, fileType: string): string {
  const e = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return e || fileType.toLowerCase();
}

function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => {
    return content
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        // simple CSV split that respects quoted fields
        const out: string[] = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            if (inQ && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else inQ = !inQ;
          } else if (c === "," && !inQ) {
            out.push(cur);
            cur = "";
          } else cur += c;
        }
        out.push(cur);
        return out;
      });
  }, [content]);

  if (rows.length === 0) return null;
  const [head, ...body] = rows;

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="sticky top-0 border border-border bg-muted px-2 py-1 text-left font-semibold text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-muted/60" : ""}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className="border border-border px-2 py-1 align-top text-muted-foreground"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilePreview({ name, fileType, content }: Props) {
  const e = ext(name, fileType);

  // PDF — render in an embedded viewer when we have real binary data.
  if (e === "pdf") {
    const url = toDataUrl(content, "application/pdf");
    if (url) {
      return (
        <iframe
          title={name}
          src={url}
          className="h-full min-h-[50vh] w-full rounded border border-border bg-card"
        />
      );
    }
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
        {content}
      </pre>
    );
  }

  // SVG — render visually.
  if (e === "svg" || content.trim().startsWith("<svg")) {
    return (
      <div className="flex items-center justify-center rounded border border-border bg-card p-4">
        <div
          className="max-w-full [&>svg]:h-auto [&>svg]:max-w-full"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }

  // Raster images stored as base64.
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(e)) {
    const mime = e === "jpg" ? "image/jpeg" : `image/${e}`;
    const url = toDataUrl(content, mime);
    if (url) {
      return (
        <div className="flex items-center justify-center rounded border border-border bg-card p-4">
          <img src={url} alt={name} className="max-h-full max-w-full" />
        </div>
      );
    }
  }

  // CSV — render as a table.
  if (e === "csv") {
    return <CsvTable content={content} />;
  }

  // JSON — pretty-print.
  if (e === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // leave as-is if it doesn't parse
    }
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
        {pretty}
      </pre>
    );
  }

  // XLSX / DOCX — if binary base64, we can't parse client-side here; show a
  // notice. Otherwise (text content) render readable text.
  if (["xlsx", "xls", "docx", "doc"].includes(e)) {
    const isBinary = toDataUrl(content, "application/octet-stream") !== null;
    if (isBinary) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {e.toUpperCase()} binary file — download to open in a spreadsheet/word
          processor.
        </div>
      );
    }
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
        {content}
      </pre>
    );
  }

  // Default: text-based files (md, txt, eml, etc.) shown as formatted text.
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
      {content}
    </pre>
  );
}
