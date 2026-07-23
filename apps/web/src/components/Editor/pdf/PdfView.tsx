'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../../../lib/pdf';
import { getAttachmentUrl } from '../../../db/attachments';

interface Props {
  attachmentId: string;
  filename?: string;
}

/** Read-only inline PDF viewer with page navigation, rendered via pdf.js. */
export function PdfView({ attachmentId, filename }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Load the document once.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const url = await getAttachmentUrl(attachmentId);
      if (!url) {
        if (!cancelled) setError('Attachment not found.');
        return;
      }
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage(1);
      } catch {
        if (!cancelled) setError('Could not render PDF.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  // Render the current page whenever it changes.
  useEffect(() => {
    let cancelled = false;
    async function render() {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        /* ignore transient render errors while navigating */
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [page, pageCount]);

  async function download() {
    const url = await getAttachmentUrl(attachmentId);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const go = (n: number) => setPage((p) => Math.max(1, Math.min(pageCount || 1, n)));

  return (
    <div className="my-3 overflow-hidden rounded-lg border bg-muted/40" contentEditable={false}>
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0" />
        <span className="truncate font-medium text-foreground">{filename ?? 'PDF'}</span>
        {pageCount > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              title="Previous page"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              className="flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="flex items-center gap-1 text-xs">
              <input
                type="number"
                min={1}
                max={pageCount}
                value={page}
                onChange={(e) => go(parseInt(e.target.value, 10) || 1)}
                className="w-10 rounded border bg-background px-1 py-0.5 text-center text-foreground"
              />
              / {pageCount}
            </span>
            <button
              type="button"
              title="Next page"
              onClick={() => go(page + 1)}
              disabled={page >= pageCount}
              className="flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              title="Download PDF"
              onClick={download}
              className="flex size-7 items-center justify-center rounded hover:bg-muted"
            >
              <Download className="size-4" />
            </button>
          </div>
        )}
      </div>
      {error ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{error}</div>
      ) : (
        <div className="flex max-h-[640px] justify-center overflow-auto p-2">
          <canvas ref={canvasRef} className="max-w-full shadow" />
        </div>
      )}
    </div>
  );
}
