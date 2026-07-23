'use client';

import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
  Text,
} from 'lucide-react';
import { SlashMenu, type SlashItem, type SlashMenuRef } from '../SlashMenu';

const items: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    icon: <Text />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    icon: <Heading1 />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    icon: <Heading2 />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    icon: <Heading3 />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    icon: <List />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    icon: <ListOrdered />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do list',
    description: 'Checkboxes',
    icon: <CheckSquare />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Quote',
    icon: <Quote />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    icon: <Code2 />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    icon: <Minus />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Table',
    icon: <TableIcon />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

/** Notion/Evernote-style "/" insert menu. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        // Only trigger at the start of a block or after a space (not inside URLs).
        allowedPrefixes: [' '],
        command: ({ editor, range, props }) => {
          (props as SlashItem).command({ editor, range });
        },
        items: ({ query }) =>
          items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null;
          let popup: HTMLDivElement | null = null;

          const position = (rect: DOMRect | null | undefined) => {
            if (!popup || !rect) return;
            popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
            popup.style.left = `${rect.left + window.scrollX}px`;
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              popup = document.createElement('div');
              popup.style.position = 'absolute';
              popup.style.zIndex = '60';
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              position(props.clientRect?.());
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command });
              position(props.clientRect?.());
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') return true;
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              popup?.remove();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
