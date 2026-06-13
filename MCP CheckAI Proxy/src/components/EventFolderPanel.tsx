import { useState } from "react";
import { Check, Boxes, UploadCloud, X, Database } from "lucide-react";

import { Panel } from "@/components/Panel";
import {
  FilePreviewDialog,
  type PreviewTarget,
} from "@/components/FilePreviewDialog";
import {
  type EventFile,
  categoryStyles,
  fileTypeStyles,
} from "@/lib/ingest-data";

export function EventFolderPanel({
  files,
  ingested,
  isDragging,
  onPickClick,
  onRemove,
  onBrowseTraining,
}: {
  files: EventFile[];
  ingested: Set<string>;
  isDragging: boolean;
  onPickClick: () => void;
  onRemove: (id: string) => void;
  onBrowseTraining?: () => void;
}) {
  const total = files.length;
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  return (
    <Panel
      title="artifacts"
      icon={<Boxes className="size-4" />}
      meta={
        <span className="font-mono">
          <span className="font-semibold text-foreground">{ingested.size}</span>
          <span className="text-muted-foreground"> / {total} ingested</span>
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {total === 0 ? (
          <div className="m-4 flex flex-1 flex-col gap-3">
            <button
              type="button"
              onClick={onPickClick}
              className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <UploadCloud
                className={`size-9 ${isDragging ? "text-primary" : "text-muted-foreground/50"}`}
                strokeWidth={1.5}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? "Drop to stage artifacts" : "Drag & drop files to stage"}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  or click to browse — any file type
                </p>
              </div>
            </button>
            {onBrowseTraining && (
              <button
                type="button"
                onClick={onBrowseTraining}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                <Database className="size-3.5 text-primary" />
                Load a previous generation from training data
              </button>
            )}
          </div>

        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {files.map((f) => {
              const done = ingested.has(f.id);
              return (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setPreview({ name: f.name, fileType: f.type, content: f.content })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreview({ name: f.name, fileType: f.type, content: f.content });
                    }
                  }}
                  className="group flex cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={`w-10 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[10px] font-bold tracking-wide ${fileTypeStyles[f.type]}`}
                  >
                    {f.type}
                  </span>
                  <span className="flex-1 truncate font-mono text-[13px] text-foreground">
                    {f.name}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {f.size}
                  </span>
                  <span
                    className={`w-[84px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${categoryStyles[f.category]}`}
                  >
                    {f.category}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center">
                    {done ? (
                      <Check className="size-4 text-success" strokeWidth={3} />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(f.id);
                        }}
                        className="text-muted-foreground/50 opacity-0 transition hover:text-destructive group-hover:opacity-100"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="size-4" strokeWidth={3} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <FilePreviewDialog file={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </Panel>
  );
}
