import { useEffect, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { getAttachmentUrl } from '../../../db/attachments';

/**
 * Renders an image by resolving its attachment id to a blob object URL.
 * Falls back to the raw `src` attribute (e.g. pasted external images).
 */
export function AttachmentImageView({ node, selected }: NodeViewProps) {
  const attachmentId: string | null = node.attrs.attachmentId ?? null;
  const rawSrc: string | null = node.attrs.src ?? null;
  const alt: string | undefined = node.attrs.alt ?? undefined;
  const [src, setSrc] = useState<string | null>(rawSrc);

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

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block' }}>
      {src ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ outline: selected ? '2px solid var(--accent)' : 'none' }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
