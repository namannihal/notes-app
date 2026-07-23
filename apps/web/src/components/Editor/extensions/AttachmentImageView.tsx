'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Move, Pencil, X } from 'lucide-react';
import { getAttachmentUrl, replaceAttachmentBlob } from '../../../db/attachments';
import { ArrowsSvg, ImageEditorModal, type Annotation, type Arrow } from './ImageEditorModal';

/**
 * Renders an image (resolved from its attachment blob) with a move handle,
 * resize handle, delete, and an Edit button that opens a full-screen editor for
 * cropping and adding re-editable arrows and text.
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
  const arrows: Arrow[] = Array.isArray(node.attrs.arrows) ? (node.attrs.arrows as Arrow[]) : [];
  const [src, setSrc] = useState<string | null>(rawSrc);
  const [editing, setEditing] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

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

  // Track the displayed image size so the arrow overlay stays aligned.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => ro.disconnect();
  }, [src]);

  const controlsHidden = !selected;

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

      {/* Inline overlays (read-only): arrows + text labels */}
      <ArrowsSvg arrows={arrows} width={dims.w} height={dims.h} className="z-10" />
      {annotations.map((a) => (
        <span
          key={a.id}
          style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color ?? '#dc2626' }}
          className="pointer-events-none absolute z-10 -translate-y-1/2 whitespace-nowrap text-base font-bold [text-shadow:0_0_2px_white,0_0_2px_white]"
        >
          {a.text}
        </span>
      ))}

      {/* Selection ring */}
      <span
        aria-hidden={!selected}
        className={`pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0'
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
          title="Edit image (crop, arrows, text)"
          tabIndex={selected ? 0 : -1}
          onClick={() => setEditing(true)}
          className="flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-xs font-medium text-foreground shadow ring-1 ring-border hover:bg-background"
        >
          <Pencil className="size-3.5" /> Edit
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

      {editing &&
        src &&
        createPortal(
          <ImageEditorModal
            src={src}
            annotations={annotations}
            arrows={arrows}
            onSave={(a, ar) => updateAttributes({ annotations: a, arrows: ar })}
            onCrop={async (blob) => {
              if (!attachmentId) return null;
              await replaceAttachmentBlob(attachmentId, blob);
              updateAttributes({ width: null });
              const url = await getAttachmentUrl(attachmentId);
              if (url) setSrc(url);
              return url;
            }}
            onClose={() => setEditing(false)}
          />,
          document.body,
        )}
    </NodeViewWrapper>
  );
}
