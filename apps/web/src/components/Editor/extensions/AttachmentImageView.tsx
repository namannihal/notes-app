'use client';

import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Check, Crop, Move, Type, X } from 'lucide-react';
import { getAttachmentUrl, replaceAttachmentBlob } from '../../../db/attachments';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Annotation {
  id: string;
  /** Position as fractions (0–1) of the image so labels scale with it. */
  x: number;
  y: number;
  text: string;
}

/**
 * Renders an image by resolving its attachment id to a blob object URL, with a
 * move handle (drag to reposition, incl. out of tables), resize handle, crop,
 * delete, and re-editable text annotations overlaid on the image.
 */
export function AttachmentImageView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const attachmentId: string | null = node.attrs.attachmentId ?? null;
  const rawSrc: string | null = node.attrs.src ?? null;
  const alt: string | undefined = node.attrs.alt ?? undefined;
  const width: number | null = node.attrs.width ?? null;
  const annotations: Annotation[] = Array.isArray(node.attrs.annotations)
    ? (node.attrs.annotations as Annotation[])
    : [];
  const [src, setSrc] = useState<string | null>(rawSrc);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cropping, setCropping] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [annotating, setAnnotating] = useState(false);

  function setAnnotations(next: Annotation[]) {
    updateAttributes({ annotations: next });
  }

  // --- Move (pointer-based, works anywhere incl. out of tables) ------------
  function startMove(e: React.PointerEvent) {
    if (typeof getPos !== 'function') return;
    e.preventDefault();
    e.stopPropagation();
    const view = editor.view;
    document.body.style.cursor = 'grabbing';

    const onPointerMove = (ev: PointerEvent) => ev.preventDefault();
    const onPointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = '';
      try {
        const from = getPos();
        if (typeof from !== 'number') return;
        const dragged = view.state.doc.nodeAt(from);
        if (!dragged) return;
        const coords = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
        if (!coords) return;
        const to = coords.pos;
        // Ignore drops onto the image itself.
        if (to >= from && to <= from + dragged.nodeSize) return;
        const tr = view.state.tr.delete(from, from + dragged.nodeSize);
        const insertAt = tr.mapping.map(to);
        tr.insert(insertAt, dragged);
        view.dispatch(tr);
        view.focus();
      } catch {
        /* invalid drop target — leave the image where it was */
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

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

  // --- Annotate (re-editable text overlays) --------------------------------
  function beginAnnotate() {
    setAnnotating(true);
  }

  function endAnnotate() {
    setAnnotations(annotations.filter((a) => a.text.trim() !== ''));
    setAnnotating(false);
  }

  function addAnnotationAt(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // clicked a label, not empty space
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const id = Math.random().toString(36).slice(2);
    setAnnotations([...annotations, { id, x, y, text: '' }]);
  }

  function updateAnnotationText(id: string, text: string) {
    setAnnotations(annotations.map((a) => (a.id === id ? { ...a, text } : a)));
  }

  function removeAnnotation(id: string) {
    setAnnotations(annotations.filter((a) => a.id !== id));
  }

  function startAnnotationDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const box = img.getBoundingClientRect();
    const base = annotations;
    function onMove(ev: PointerEvent) {
      const x = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height));
      setAnnotations(base.map((a) => (a.id === id ? { ...a, x, y } : a)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const controlsHidden = !selected || cropping || annotating;

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

      {/* Static annotation labels (always visible, part of the content). */}
      {!annotating &&
        annotations.map((a) => (
          <span
            key={a.id}
            style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
            className="pointer-events-none absolute z-10 -translate-y-1/2 whitespace-nowrap text-sm font-bold text-red-600 [text-shadow:0_0_2px_white,0_0_2px_white]"
          >
            {a.text}
          </span>
        ))}

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

      {/* Annotate editing overlay */}
      {annotating && (
        <span
          contentEditable={false}
          onPointerDown={addAnnotationAt}
          className="absolute inset-0 z-30 cursor-crosshair select-none"
        >
          {annotations.map((a) => (
            <span
              key={a.id}
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
              className="absolute z-40 flex -translate-y-1/2 items-center gap-1"
            >
              <span
                onPointerDown={(e) => startAnnotationDrag(e, a.id)}
                className="pointer-events-auto flex size-5 cursor-move items-center justify-center rounded bg-primary text-primary-foreground"
              >
                <Move className="size-3" />
              </span>
              <input
                value={a.text}
                autoFocus={a.text === ''}
                placeholder="label"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateAnnotationText(a.id, e.target.value)}
                className="pointer-events-auto w-28 rounded bg-white/85 px-1 text-sm font-bold text-red-600 outline outline-1 outline-primary"
              />
              <button
                type="button"
                title="Remove label"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeAnnotation(a.id)}
                className="pointer-events-auto flex size-5 items-center justify-center rounded bg-background text-destructive ring-1 ring-border"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <span className="absolute right-1.5 top-1.5 z-50">
            <button
              type="button"
              onClick={endAnnotate}
              className="pointer-events-auto flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow"
            >
              <Check className="size-3.5" /> Done
            </button>
          </span>
        </span>
      )}

      {/* Selection ring */}
      <span
        aria-hidden={!selected}
        className={`pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary transition-opacity ${
          selected && !cropping ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Top-left control cluster: move / crop / annotate */}
      <span
        className={`absolute left-1.5 top-1.5 z-20 flex gap-1 ${
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <span
          onPointerDown={startMove}
          title="Drag to move"
          className="flex size-7 cursor-grab items-center justify-center rounded-md bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-background active:cursor-grabbing"
        >
          <Move className="size-4" />
        </span>
        <button
          type="button"
          title="Crop image"
          tabIndex={selected ? 0 : -1}
          onClick={beginCrop}
          className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-background"
        >
          <Crop className="size-4" />
        </button>
        <button
          type="button"
          title="Annotate (type on image)"
          tabIndex={selected ? 0 : -1}
          onClick={beginAnnotate}
          className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-background"
        >
          <Type className="size-4" />
        </button>
      </span>

      <button
        type="button"
        title="Delete image"
        tabIndex={selected ? 0 : -1}
        className={`absolute right-1.5 top-1.5 z-20 flex size-7 items-center justify-center rounded-md bg-background/90 text-destructive shadow ring-1 ring-border hover:bg-background ${
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onClick={() => deleteNode()}
      >
        <X className="size-4" />
      </button>
      <span
        title="Drag to resize"
        onPointerDown={!controlsHidden ? startResize : undefined}
        className={`absolute -bottom-1 -right-1 z-20 size-4 cursor-nwse-resize rounded-sm border-2 border-background bg-primary ${
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      />
    </NodeViewWrapper>
  );
}
