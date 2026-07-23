import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { saveAttachment } from '../../db/attachments';

interface Props {
  editor: Editor;
  noteId: string;
}

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toolbar({ editor, noteId }: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const att = await saveAttachment(file, noteId);
      editor
        .chain()
        .focus()
        .setImage({ src: '', alt: att.filename, attachmentId: att.id } as never)
        .run();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add image.');
    }
  }

  async function onPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const att = await saveAttachment(file, noteId);
      editor
        .chain()
        .focus()
        .insertPdf({ attachmentId: att.id, filename: att.filename, pageCount: null })
        .run();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add PDF.');
    }
  }

  return (
    <div className="toolbar">
      <Btn title="Bold (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </Btn>
      <Btn title="Italic (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </Btn>
      <Btn title="Underline (⌘U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <Btn title="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        ◆
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        H1
      </Btn>
      <Btn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </Btn>
      <Btn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •
      </Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1.
      </Btn>
      <Btn title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        ❝
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        ⬅
      </Btn>
      <Btn title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        ⬌
      </Btn>
      <Btn title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        ➡
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Serif font" onClick={() => editor.chain().focus().setFontFamily('var(--font-serif)').run()}>
        Serif
      </Btn>
      <Btn title="Sans font" onClick={() => editor.chain().focus().unsetFontFamily().run()}>
        Sans
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        ▦
      </Btn>
      <Btn title="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>
        ▥+
      </Btn>
      <Btn title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
        ▤+
      </Btn>
      <Btn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
        ▦✕
      </Btn>

      <span className="toolbar__sep" />

      <Btn title="Insert image" onClick={() => imageInput.current?.click()}>
        🖼
      </Btn>
      <Btn title="Insert PDF" onClick={() => pdfInput.current?.click()}>
        📄
      </Btn>

      <input ref={imageInput} type="file" accept="image/*" hidden onChange={onImage} />
      <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={onPdf} />
    </div>
  );
}
