import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilePreview } from "@/components/FilePreview";

export type PreviewTarget = {
  name: string;
  fileType: string;
  content?: string | null;
};

export function FilePreviewDialog({
  file,
  onOpenChange,
}: {
  file: PreviewTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{file?.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] min-h-0 overflow-auto rounded-lg border border-border bg-muted/50 p-4">
          {file?.content ? (
            <FilePreview
              name={file.name}
              fileType={file.fileType}
              content={file.content}
            />
          ) : (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No preview available — this file has no stored content.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
