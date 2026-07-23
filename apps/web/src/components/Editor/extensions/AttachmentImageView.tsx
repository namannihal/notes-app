'use client';

import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { X } from 'lucide-react';
import { getAttachmentUrl } from '../../../db/attachments';

/**
 * Renders an image by resolving its attachment id to a blob object URL, with a
 * delete button and a drag handle to resize its width. Falls back to the raw
 * `src` attribute (e.g. pasted external images).
 */
export function AttachmentImageView({ node, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const attachmentId: string | null = node.attrs.attachmentId ?? null;
  const rawSrc: string | null = node.attrs.src ?? null;
  const alt: string | undefined = node.attrs.alt ?? undefined;
  const width: number | null = node.attrs.width ?? null;
  const [src, setSrc] = useState<string | null>(rawSrc);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let active = true;
    if (attachmentId) {
      void getAttachmentUrl(attachmentId).then((url) => {
        if (active && url) setSrc(url);
      });
    } else {
      setSrc(rawSrc);
    }
    return () => {
      active = false;
    };
  }, [attachmentId, rawSrc]);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = imgRef.current?.offsetWidth ?? 0;
    const maxWidth = imgRef.current?.closest('.ProseMirror')?.clientWidth ?? 800;

    function onMove(ev: PointerEvent) {
      const next = Math.max(60, Math.min(maxWidth, startWidth + (ev.clientX - startX)));
      updateAttributes({ width: Math.round(next) });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <NodeViewWrapper as="span" className="relative inline-block leading-none">
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{ width: width ? `${width}px` : undefined }}
          className="max-w-full rounded-md"
        />
      ) : null}

      {/* Overlay is always mounted; visibility is toggled with CSS to avoid
          adding/removing DOM on selection changes, which can race with
          ProseMirror's own DOM management and trigger removeChild errors. */}
      <span
        aria-hidden={!selected}
        className={`pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        title="Delete image"
        tabIndex={selected ? 0 : -1}
        className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-background/90 text-destructive shadow ring-1 ring-border hover:bg-background ${
          selected ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => deleteNode()}
      >
        <X className="size-4" />
      </button>
      <span
        title="Drag to resize"
        onPointerDown={selected ? startResize : undefined}
        className={`absolute -bottom-1 -right-1 size-4 cursor-nwse-resize rounded-sm border-2 border-background bg-primary ${
          selected ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
    </NodeViewWrapper>
  );
}
