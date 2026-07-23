import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { saveNote } from '../../db/queries';
import { AttachmentImage } from './extensions/AttachmentImage';
import { PdfBlock } from './extensions/PdfBlock';
import { Toolbar } from './Toolbar';

const AUTOSAVE_MS = 800;

interface Props {
  noteId: string;
}

export function Editor({ noteId }: Props) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedFor = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      AttachmentImage,
      PdfBlock,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveNote(noteId, {
          contentJson: editor.getJSON(),
          contentText: editor.getText(),
        });
      }, AUTOSAVE_MS);
    },
  });

  // Load content when switching to a different note.
  useEffect(() => {
    if (!editor || !note) return;
    if (loadedFor.current === noteId) return;
    loadedFor.current = noteId;
    editor.commands.setContent(note.contentJson);
  }, [editor, note, noteId]);

  // Reset the loaded marker whenever the selected note changes.
  useEffect(() => {
    loadedFor.current = null;
  }, [noteId]);

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
      <Toolbar editor={editor} noteId={noteId} />
      <input
        className="editor-title"
        defaultValue={note?.title ?? ''}
        key={noteId}
        placeholder="Untitled"
        onChange={onTitle}
      />
      <div className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
