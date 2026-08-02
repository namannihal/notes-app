import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

/**
 * Adds a `backgroundColor` attribute to table cells/headers.
 *
 * Persisted as an inline `background-color` style plus a `data-bg` mirror so the
 * value survives an HTML round-trip even if the style attribute is stripped.
 * Existing cells (no attribute) render exactly as before.
 */
const backgroundAttribute = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-bg') || element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, unknown>) => {
      const color = attributes.backgroundColor as string | null;
      if (!color) return {};
      return { style: `background-color: ${color}`, 'data-bg': color };
    },
  },
};

export const TableCellWithBackground = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundAttribute };
  },
});

export const TableHeaderWithBackground = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundAttribute };
  },
});
