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
    const blockIndent =
      (delta: number) =>
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
      // Inside a list, indent/outdent nests or un-nests the item (a sub-point);
      // otherwise it shifts the block's left margin.
      indent:
        () =>
        (props: CommandProps) => {
          const { can, chain } = props;
          if (can().sinkListItem('listItem')) return chain().focus().sinkListItem('listItem').run();
          if (can().sinkListItem('taskItem')) return chain().focus().sinkListItem('taskItem').run();
          return blockIndent(1)(props);
        },
      outdent:
        () =>
        (props: CommandProps) => {
          const { can, chain } = props;
          if (can().liftListItem('listItem')) return chain().focus().liftListItem('listItem').run();
          if (can().liftListItem('taskItem')) return chain().focus().liftListItem('taskItem').run();
          return blockIndent(-1)(props);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    };
  },
});
