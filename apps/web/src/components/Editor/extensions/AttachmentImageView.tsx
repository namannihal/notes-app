'use client';

import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Check, Crop, X } from 'lucide-react';
import { getAttachmentUrl, replaceAttachmentBlob } from '../../../db/attachments';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  const [cropping, setCropping] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

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

  // --- Crop -----------------------------------------------------------------
  function beginCrop() {
    setCropping(true);
    setRect(null);
  }

  function onCropPointerDown(e: React.PointerEvent) {
    if (!cropping) return;
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX - box.left;
    const y0 = e.clientY - box.top;

    function onMove(ev: PointerEvent) {
      const x1 = Math.max(0, Math.min(box.width, ev.clientX - box.left));
      const y1 = Math.max(0, Math.min(box.height, ev.clientY - box.top));
      setRect({
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        w: Math.abs(x1 - x0),
        h: Math.abs(y1 - y0),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function applyCrop() {
    const img = imgRef.current;
    if (!img || !attachmentId || !rect || rect.w < 8 || rect.h < 8) {
      setCropping(false);
      setRect(null);
      return;
    }
    const scaleX = img.naturalWidth / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.w * scaleX);
    canvas.height = Math.round(rect.h * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCropping(false);
      return;
    }
    ctx.drawImage(
      img,
      rect.x * scaleX,
      rect.y * scaleY,
      rect.w * scaleX,
      rect.h * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (blob) {
      await replaceAttachmentBlob(attachmentId, blob);
      updateAttributes({ width: null });
      const url = await getAttachmentUrl(attachmentId);
      if (url) setSrc(url);
    }
    setCropping(false);
    setRect(null);
  }

  function cancelCrop() {
    setCropping(false);
    setRect(null);
  }

  return (
    <NodeViewWrapper as="span" className="relative inline-block leading-none" data-drag-handle>
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

      {/* Crop overlay */}
      {cropping && (
        <span
          contentEditable={false}
          onPointerDown={onCropPointerDown}
          className="absolute inset-0 z-30 cursor-crosshair select-none"
        >
          {rect && (
            <span
              className="absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
          )}
          <span className="absolute right-1.5 top-1.5 z-40 flex gap-1">
            <button
              type="button"
              title="Apply crop"
              onClick={applyCrop}
              className="pointer-events-auto flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              title="Cancel"
              onClick={cancelCrop}
              className="pointer-events-auto flex size-7 items-center justify-center rounded-md bg-background text-foreground shadow ring-1 ring-border"
            >
              <X className="size-4" />
            </button>
          </span>
        </span>
      )}

      {/* Selected-state controls (hidden via CSS when not selected). */}
      <span
        aria-hidden={!selected}
        className={`pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary transition-opacity ${
          selected && !cropping ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        title="Crop image"
        tabIndex={selected ? 0 : -1}
        className={`absolute left-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-background ${
          selected && !cropping ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={beginCrop}
      >
        <Crop className="size-4" />
      </button>
      <button
        type="button"
        title="Delete image"
        tabIndex={selected ? 0 : -1}
        className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-background/90 text-destructive shadow ring-1 ring-border hover:bg-background ${
          selected && !cropping ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => deleteNode()}
      >
        <X className="size-4" />
      </button>
      <span
        title="Drag to resize"
        onPointerDown={selected && !cropping ? startResize : undefined}
        className={`absolute -bottom-1 -right-1 size-4 cursor-nwse-resize rounded-sm border-2 border-background bg-primary ${
          selected && !cropping ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
    </NodeViewWrapper>
  );
}
