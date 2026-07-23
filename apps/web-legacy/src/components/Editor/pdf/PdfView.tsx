import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../../../lib/pdf';
import { getAttachmentUrl } from '../../../db/attachments';

interface Props {
  attachmentId: string;
  filename?: string;
}

/** Read-only inline PDF viewer. Renders every page to a canvas via pdf.js. */
export function PdfView({ attachmentId, filename }: Props) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = pagesRef.current;

    async function render() {
      const url = await getAttachmentUrl(attachmentId);
      if (!url) {
        if (!cancelled) setError('Attachment not found.');
        return;
      }
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        if (!container) return;
        container.replaceChildren();

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.3 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch {
        if (!cancelled) setError('Could not render PDF.');
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return (
    <div className="pdf-node" contentEditable={false}>
      <div className="pdf-node__bar">
        <span>📄 {filename ?? 'PDF'}</span>
        {pageCount > 0 && <span>· {pageCount} page{pageCount > 1 ? 's' : ''}</span>}
      </div>
      {error ? (
        <div className="tree-empty">{error}</div>
      ) : (
        <div ref={pagesRef} className="pdf-node__pages" />
      )}
    </div>
  );
}
