'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { saveNote } from '../../db/queries';
import { reconcileNoteAttachments, saveAttachment } from '../../db/attachments';
import type { Note } from '../../db/types';
import { AttachmentImage } from './extensions/AttachmentImage';
import { PdfBlock } from './extensions/PdfBlock';
import { FontSize } from './extensions/FontSize';
import { Indent } from './extensions/Indent';
import { SlashCommand } from './extensions/SlashCommand';
import { SearchReplace } from './extensions/SearchReplace';
import { Toolbar } from './Toolbar';
import { TableMenu } from './TableMenu';
import { TableControls } from './TableControls';
import { FindReplace } from './FindReplace';

const AUTOSAVE_MS = 800;

interface Props {
  noteId: string;
}

/**
 * Loads the selected note and only mounts the editor once the fetched record
 * actually matches `noteId` (avoids a stale-note race from useLiveQuery). The
 * inner editor is keyed by id so switching notes remounts it cleanly.
 */
export function Editor({ noteId }: Props) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const matched = note && note.id === noteId ? note : undefined;

  if (!matched) {
    return <div className="flex-1" />;
  }
  return <NoteEditor key={noteId} note={matched} />;
}

function NoteEditor({ note }: { note: Note }) {
  const noteId = note.id;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialContent] = useState(() => note.contentJson);
  const [initialTitle] = useState(() => note.title);
  const [findOpen, setFindOpen] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);

  const flush = useCallback(
    (ed: TiptapEditor) => {
      const json = ed.getJSON();
      void saveNote(noteId, { contentJson: json, contentText: ed.getText() }).then(() =>
        reconcileNoteAttachments(noteId, json),
      );
    },
    [noteId],
  );

  const insertFile = useCallback(
    async (file: File) => {
      const ed = editorRef.current;
      if (!ed) return;
      try {
        const att = await saveAttachment(file, noteId);
        if (att.kind === 'pdf') {
          ed.chain().focus().insertPdf({ attachmentId: att.id, filename: att.filename, pageCount: null }).run();
        } else {
          ed.chain().focus().setImage({ src: '', alt: att.filename, attachmentId: att.id } as never).run();
        }
      } catch {
        /* unsupported file type or too large */
      }
    },
    [noteId],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? 'Heading' : "Write, or press '/' for commands…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Indent,
      SlashCommand,
      SearchReplace,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      AttachmentImage,
      PdfBlock,
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[60vh] w-full focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
        );
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((f) => void insertFile(f));
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter(
          (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
        );
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((f) => void insertFile(f));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flush(editor), AUTOSAVE_MS);
    },
    onBlur: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush(editor);
    },
  });

  editorRef.current = editor;

  // Clear pending autosave timers on unmount (a destroyed editor can't be read).
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  // Ctrl/Cmd+F opens the in-note find & replace panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onTitle(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void saveNote(noteId, { title: title || 'Untitled' });
    }, AUTOSAVE_MS);
  }

  if (!editor) return null;

  return (
    <>
      <Toolbar editor={editor} noteId={noteId} onFind={() => setFindOpen(true)} />
      <TableMenu editor={editor} />
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        <FindReplace editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />
        <input
          className="w-full bg-transparent px-8 pb-2 pt-6 text-3xl font-bold outline-none placeholder:text-muted-foreground/50"
          defaultValue={initialTitle}
          placeholder="Untitled"
          onChange={onTitle}
        />
        <TableControls editor={editor} containerRef={scrollRef} />
        <div className="px-8 pb-24">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
