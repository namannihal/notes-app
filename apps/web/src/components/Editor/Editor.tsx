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
import { Download, FileText, Pin, Printer, X as XIcon } from 'lucide-react';
import { db } from '../../db/db';
import { saveNote, setNotePinned, setNoteTags } from '../../db/queries';
import { useAppStore } from '../../stores/useAppStore';
import { toast } from '../../stores/useToast';
import { tiptapToMarkdown } from '../../lib/markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { reconcileNoteAttachments, saveAttachment } from '../../db/attachments';
import type { Note } from '../../db/types';
import { AttachmentImage } from './extensions/AttachmentImage';
import { PdfBlock } from './extensions/PdfBlock';
import { FontSize } from './extensions/FontSize';
import { Indent } from './extensions/Indent';
import { SlashCommand } from './extensions/SlashCommand';
import { SearchReplace } from './extensions/SearchReplace';
import { TableKeymap } from './extensions/TableKeymap';
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
  const [tagInput, setTagInput] = useState('');
  const setTagFilter = useAppStore((s) => s.setTagFilter);
  const tableBorderWidth = useAppStore((s) => s.tableBorderWidth);
  const tableBorderShade = useAppStore((s) => s.tableBorderShade);
  const editorFont = useAppStore((s) => s.editorFont);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [stats, setStats] = useState(() => {
    const t = note.contentText ?? '';
    return { words: (t.trim().match(/\S+/g) || []).length, chars: t.length };
  });
  const editorRef = useRef<TiptapEditor | null>(null);

  const flush = useCallback(
    (ed: TiptapEditor) => {
      const json = ed.getJSON();
      void saveNote(noteId, { contentJson: json, contentText: ed.getText() }).then(() => {
        void reconcileNoteAttachments(noteId, json);
        setSaveState('saved');
      });
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
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not add that file.', 'error');
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
      TableKeymap,
      AttachmentImage.configure({ inline: true }),
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
      setSaveState('saving');
      const text = editor.getText();
      setStats({ words: (text.trim().match(/\S+/g) || []).length, chars: text.length });
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

  // Fade the "Saved" indicator back to idle.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 1500);
    return () => clearTimeout(t);
  }, [saveState]);

  function exportMarkdown() {
    if (!editorRef.current) return;
    const md = tiptapToMarkdown(editorRef.current.getJSON(), note.title || 'Untitled');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(note.title || 'note').replace(/[^\w-]+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!editor) return null;

  return (
    <>
      <Toolbar editor={editor} noteId={noteId} onFind={() => setFindOpen(true)} />
      <TableMenu editor={editor} />
      <div
        ref={scrollRef}
        data-print-root
        className="relative flex-1 overflow-y-auto"
        style={{ fontFamily: editorFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)' }}
      >
        <FindReplace editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />
        <input
          className="w-full bg-transparent px-8 pb-2 pt-6 text-3xl font-bold outline-none placeholder:text-muted-foreground/50"
          defaultValue={initialTitle}
          placeholder="Untitled"
          onChange={onTitle}
        />
        <div className="no-print flex flex-wrap items-center gap-1.5 px-8 pb-3">
          <button
            type="button"
            title={note.pinned ? 'Unpin note' : 'Pin note'}
            onClick={() => void setNotePinned(noteId, !note.pinned)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
              note.pinned ? 'border-primary text-primary' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Pin className="size-3.5" />
            {note.pinned ? 'Pinned' : 'Pin'}
          </button>
          {(note.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <button
                type="button"
                className="hover:underline"
                title={`Show notes tagged #${tag}`}
                onClick={() => setTagFilter(tag)}
              >
                #{tag}
              </button>
              <button
                type="button"
                title="Remove tag"
                onClick={() =>
                  void setNoteTags(noteId, (note.tags ?? []).filter((t) => t !== tag))
                }
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault();
                void setNoteTags(noteId, [...(note.tags ?? []), tagInput.trim()]);
                setTagInput('');
              }
            }}
            placeholder="Add tag…"
            className="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <Download className="size-3.5" /> Export
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="mr-2 size-4" /> Print / Save as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMarkdown}>
                <FileText className="mr-2 size-4" /> Download Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <TableControls editor={editor} containerRef={scrollRef} />
        <div
          className="px-8 pb-24"
          style={
            {
              '--tbl-border-w': `${tableBorderWidth}px`,
              '--tbl-border-c': `color-mix(in oklch, var(--foreground) ${tableBorderShade}%, transparent)`,
            } as React.CSSProperties
          }
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="no-print flex items-center justify-between border-t px-4 py-1 text-xs text-muted-foreground">
        <span>
          {stats.words} words · {stats.chars} characters
        </span>
        <span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : ''}</span>
      </div>
    </>
  );
}
