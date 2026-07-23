import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AttachmentImageView } from './AttachmentImageView';

/**
 * Image node backed by a local attachment. Adds an `attachmentId` attribute so
 * the src is resolved from the blob store at render time (never base64 inline).
 */
export const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-attachment-id'),
        renderHTML: (attrs) =>
          attrs.attachmentId ? { 'data-attachment-id': attrs.attachmentId } : {},
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = (el as HTMLElement).style.width || el.getAttribute('width');
          return w ? parseInt(w, 10) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
      },
      annotations: {
        default: [],
        parseHTML: (el) => {
          const raw = el.getAttribute('data-annotations');
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs.annotations) && attrs.annotations.length
            ? { 'data-annotations': JSON.stringify(attrs.annotations) }
            : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView);
  },
});
