import { Extension, type CommandProps } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const MAX_INDENT = 8;

/**
 * Indentation for paragraphs and headings via a numeric `indent` attribute
 * (rendered as margin-left). Tab / Shift-Tab sink or lift list items first, and
 * otherwise adjust block indent — mirroring Evernote's behaviour.
 */
export const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const ml = parseInt(element.style.marginLeft || '0', 10);
              return Number.isNaN(ml) ? 0 : Math.round(ml / 32);
            },
            renderHTML: (attributes) =>
              attributes.indent ? { style: `margin-left: ${attributes.indent * 2}em` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const types = this.options.types;
    const setIndent =
      (delta: number) =>
      () =>
      ({ state, chain }: CommandProps) => {
        const { $from } = state.selection;
        const node = $from.node($from.depth) ?? $from.parent;
        const type = node.type.name;
        if (!types.includes(type)) return false;
        const current = (node.attrs.indent as number) ?? 0;
        const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
        return chain().updateAttributes(type, { indent: next }).run();
      };

    return {
      indent: setIndent(1),
      outdent: setIndent(-1),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.can().sinkListItem('listItem')) {
          return this.editor.chain().focus().sinkListItem('listItem').run();
        }
        if (this.editor.can().sinkListItem('taskItem')) {
          return this.editor.chain().focus().sinkListItem('taskItem').run();
        }
        return this.editor.chain().focus().indent().run();
      },
      'Shift-Tab': () => {
        if (this.editor.can().liftListItem('listItem')) {
          return this.editor.chain().focus().liftListItem('listItem').run();
        }
        if (this.editor.can().liftListItem('taskItem')) {
          return this.editor.chain().focus().liftListItem('taskItem').run();
        }
        return this.editor.chain().focus().outdent().run();
      },
    };
  },
});
