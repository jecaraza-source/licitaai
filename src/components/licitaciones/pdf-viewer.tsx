"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfViewer({
  url,
  nombre,
  open,
  onOpenChange,
}: {
  url: string | null;
  nombre: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setNumPages(null);
          setPage(1);
          setScale(1);
        }
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{nombre}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 border-b pb-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {numPages ?? "…"}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!numPages || page >= numPages}
            onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p))}
          >
            <ChevronRight />
          </Button>
          <div className="mx-2 h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            <ZoomOut />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          >
            <ZoomIn />
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-muted/40">
          {url && (
            <Document
              file={url}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={<p className="p-8 text-center text-sm text-muted-foreground">Cargando PDF…</p>}
              error={
                <p className="p-8 text-center text-sm text-destructive">
                  No se pudo cargar el documento.
                </p>
              }
              className="flex justify-center py-4"
            >
              <Page pageNumber={page} scale={scale} />
            </Document>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
