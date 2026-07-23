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
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView);
  },
});
