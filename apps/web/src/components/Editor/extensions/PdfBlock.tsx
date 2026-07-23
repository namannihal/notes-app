import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { PdfView } from '../pdf/PdfView';

export interface PdfAttrs {
  attachmentId: string | null;
  filename: string | null;
  pageCount: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pdfBlock: {
      insertPdf: (attrs: PdfAttrs) => ReturnType;
    };
  }
}

function PdfComponent({ node }: NodeViewProps) {
  const { attachmentId, filename } = node.attrs as PdfAttrs;
  return (
    <NodeViewWrapper>
      {attachmentId ? (
        <PdfView attachmentId={attachmentId} filename={filename ?? undefined} />
      ) : null}
    </NodeViewWrapper>
  );
}

/** Block node that embeds a read-only PDF, referenced by attachment id. */
export const PdfBlock = Node.create({
  name: 'pdfBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: { default: null },
      filename: { default: null },
      pageCount: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-pdf-attachment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-pdf-attachment': HTMLAttributes.attachmentId ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfComponent);
  },

  addCommands() {
    return {
      insertPdf:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
