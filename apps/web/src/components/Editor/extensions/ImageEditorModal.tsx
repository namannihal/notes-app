'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Crop, MousePointer2, Trash2, Type, X } from 'lucide-react';

export interface Annotation {
  id: string;
  /** Fractions (0–1) of the image. */
  x: number;
  y: number;
  text: string;
  color?: string;
}

export interface Arrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
}

type Tool = 'select' | 'text' | 'arrow' | 'crop';

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#000000'];

/** Renders arrows (with arrowheads) sized to a pixel box. */
export function ArrowsSvg({
  arrows,
  width,
  height,
  className,
}: {
  arrows: Arrow[];
  width: number;
  height: number;
  className?: string;
}) {
  if (!width || !height) return null;
  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {arrows.map((a) => {
        const x1 = a.x1 * width;
        const y1 = a.y1 * height;
        const x2 = a.x2 * width;
        const y2 = a.y2 * height;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const head = Math.max(8, Math.min(20, len * 0.25));
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const p1 = `${x2 - head * Math.cos(ang - Math.PI / 7)},${y2 - head * Math.sin(ang - Math.PI / 7)}`;
        const p2 = `${x2 - head * Math.cos(ang + Math.PI / 7)},${y2 - head * Math.sin(ang + Math.PI / 7)}`;
        const color = a.color ?? '#dc2626';
        return (
          <g key={a.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" />
            <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  src: string;
  annotations: Annotation[];
  arrows: Arrow[];
  onSave: (annotations: Annotation[], arrows: Arrow[]) => void;
  onCrop: (blob: Blob) => Promise<string | null>;
  onClose: () => void;
}

const uid = () => Math.random().toString(36).slice(2);

/** Full-screen image editor: crop, draw arrows, and add text labels. */
export function ImageEditorModal({ src: initialSrc, annotations, arrows, onSave, onCrop, onClose }: Props) {
  const [src, setSrc] = useState(initialSrc);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(COLORS[0]);
  const [labels, setLabels] = useState<Annotation[]>(annotations);
  const [lines, setLines] = useState<Arrow[]>(arrows);
  const [selected, setSelected] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Arrow | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (img) setDims({ w: img.clientWidth, h: img.clientHeight });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, src]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        setLabels((l) => l.filter((a) => a.id !== selected));
        setLines((l) => l.filter((a) => a.id !== selected));
        setSelected(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  function frac(clientX: number, clientY: number) {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  }

  // --- Surface pointer handling (add text / draw arrow / crop) --------------
  function onSurfacePointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // clicked an element, not empty space
    const p = frac(e.clientX, e.clientY);

    if (tool === 'text') {
      const id = uid();
      setLabels((l) => [...l, { id, x: p.x, y: p.y, text: '', color }]);
      setSelected(id);
      setTool('select');
      return;
    }
    if (tool === 'arrow') {
      const id = uid();
      const start = { id, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color };
      setDraft(start);
      const move = (ev: PointerEvent) => {
        const q = frac(ev.clientX, ev.clientY);
        setDraft({ ...start, x2: q.x, y2: q.y });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const q = frac(ev.clientX, ev.clientY);
        setDraft(null);
        if (Math.hypot(q.x - p.x, q.y - p.y) > 0.02) {
          setLines((l) => [...l, { ...start, x2: q.x, y2: q.y }]);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (tool === 'crop') {
      const r = wrapRef.current!.getBoundingClientRect();
      const x0 = e.clientX - r.left;
      const y0 = e.clientY - r.top;
      const move = (ev: PointerEvent) => {
        const x1 = Math.max(0, Math.min(r.width, ev.clientX - r.left));
        const y1 = Math.max(0, Math.min(r.height, ev.clientY - r.top));
        setCrop({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    setSelected(null); // select tool on empty space
  }

  function dragLabel(e: React.PointerEvent, id: string) {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelected(id);
    const move = (ev: PointerEvent) => {
      const p = frac(ev.clientX, ev.clientY);
      setLabels((l) => l.map((a) => (a.id === id ? { ...a, x: p.x, y: p.y } : a)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function dragEndpoint(e: React.PointerEvent, id: string, which: 1 | 2) {
    e.stopPropagation();
    setSelected(id);
    const move = (ev: PointerEvent) => {
      const p = frac(ev.clientX, ev.clientY);
      setLines((l) =>
        l.map((a) =>
          a.id === id
            ? which === 1
              ? { ...a, x1: p.x, y1: p.y }
              : { ...a, x2: p.x, y2: p.y }
            : a,
        ),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function applyCrop() {
    const img = imgRef.current;
    if (!img || !crop || crop.w < 8 || crop.h < 8) {
      setCrop(null);
      return;
    }
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.w * scaleX);
    canvas.height = Math.round(crop.h * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/png'));
    if (blob) {
      const newUrl = await onCrop(blob);
      if (newUrl) setSrc(newUrl);
      // Cropping changes the frame; existing annotations no longer align — clear.
      setLabels([]);
      setLines([]);
    }
    setCrop(null);
    setTool('select');
  }

  function save() {
    onSave(labels.filter((l) => l.text.trim() !== ''), lines);
    onClose();
  }

  const ToolBtn = ({ t, title, children }: { t: Tool; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onClick={() => {
        setTool(t);
        setCrop(null);
      }}
      className={`flex size-9 items-center justify-center rounded-md ${
        tool === t ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/80" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* Edit bar */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-background px-3 py-2">
        <ToolBtn t="select" title="Select / move">
          <MousePointer2 className="size-5" />
        </ToolBtn>
        <ToolBtn t="crop" title="Crop">
          <Crop className="size-5" />
        </ToolBtn>
        <ToolBtn t="arrow" title="Arrow">
          <ArrowUpRight className="size-5" />
        </ToolBtn>
        <ToolBtn t="text" title="Text">
          <Type className="size-5" />
        </ToolBtn>
        <span className="mx-1 h-6 w-px bg-border" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title="Colour"
            onClick={() => {
              setColor(c);
              if (selected) {
                setLabels((l) => l.map((a) => (a.id === selected ? { ...a, color: c } : a)));
                setLines((l) => l.map((a) => (a.id === selected ? { ...a, color: c } : a)));
              }
            }}
            className={`size-6 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
            style={{ background: c }}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <button
          type="button"
          title="Delete selected"
          disabled={!selected}
          onClick={() => {
            setLabels((l) => l.filter((a) => a.id !== selected));
            setLines((l) => l.filter((a) => a.id !== selected));
            setSelected(null);
          }}
          className="flex size-9 items-center justify-center rounded-md text-destructive hover:bg-accent disabled:opacity-30"
        >
          <Trash2 className="size-5" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          {tool === 'crop' && crop && (
            <button
              type="button"
              onClick={applyCrop}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              <Check className="size-4" /> Apply crop
            </button>
          )}
          <button type="button" onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Save
          </button>
          <button type="button" title="Close" onClick={onClose} className="flex size-9 items-center justify-center rounded-md hover:bg-accent">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div ref={wrapRef} className="relative" style={{ lineHeight: 0 }}>
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={measure}
            className="max-h-[80vh] max-w-[86vw] select-none rounded"
          />

          <ArrowsSvg arrows={draft ? [...lines, draft] : lines} width={dims.w} height={dims.h} />

          {/* Interaction surface (captures clicks for the active tool). */}
          <div
            onPointerDown={onSurfacePointerDown}
            className={`absolute inset-0 z-10 ${tool === 'select' ? '' : 'cursor-crosshair'}`}
          />

          {/* Arrow hit targets + endpoint handles */}
          {tool === 'select' &&
            lines.map((a) => (
              <div key={a.id}>
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelected(a.id);
                  }}
                  className="absolute z-20"
                  style={{
                    left: `${Math.min(a.x1, a.x2) * 100}%`,
                    top: `${Math.min(a.y1, a.y2) * 100}%`,
                    width: `${Math.abs(a.x2 - a.x1) * 100 || 2}%`,
                    height: `${Math.abs(a.y2 - a.y1) * 100 || 2}%`,
                    cursor: 'pointer',
                  }}
                />
                {selected === a.id &&
                  ([1, 2] as const).map((w) => (
                    <span
                      key={w}
                      onPointerDown={(e) => dragEndpoint(e, a.id, w)}
                      className="absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-primary"
                      style={{
                        left: `${(w === 1 ? a.x1 : a.x2) * 100}%`,
                        top: `${(w === 1 ? a.y1 : a.y2) * 100}%`,
                      }}
                    />
                  ))}
              </div>
            ))}

          {/* Text labels */}
          {labels.map((a) => (
            <span
              key={a.id}
              className={`absolute z-20 -translate-y-1/2 ${selected === a.id ? 'outline outline-2 outline-primary' : ''}`}
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
            >
              <span
                onPointerDown={(e) => dragLabel(e, a.id)}
                className="inline-flex items-center"
              >
                <input
                  value={a.text}
                  autoFocus={a.text === ''}
                  placeholder="text"
                  onFocus={() => setSelected(a.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setLabels((l) => l.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)))
                  }
                  className="min-w-16 rounded bg-white/85 px-1 text-base font-bold outline-none"
                  style={{ color: a.color ?? '#dc2626' }}
                />
              </span>
            </span>
          ))}

          {/* Crop rectangle */}
          {crop && (
            <span
              className="pointer-events-none absolute z-30 border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
