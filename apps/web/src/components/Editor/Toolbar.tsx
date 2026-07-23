'use client';

import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CheckSquare,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Search,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { saveAttachment } from '../../db/attachments';
import { useDialog } from '../dialog-provider';

interface Props {
  editor: Editor;
  noteId: string;
  onFind: () => void;
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
const TEXT_COLORS = ['#1a1a1a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#db2777'];
const HIGHLIGHTS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff', '#fed7aa'];

function TB({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(active && 'bg-primary text-primary-foreground hover:bg-primary/90')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px self-center bg-border" />;
}

export function Toolbar({ editor, noteId, onFind }: Props) {
  const dialog = useDialog();
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const att = await saveAttachment(file, noteId);
      editor.chain().focus().setImage({ src: '', alt: att.filename, attachmentId: att.id } as never).run();
    } catch (err) {
      await dialog.confirm({ title: 'Could not add image', message: err instanceof Error ? err.message : 'Unknown error', confirmText: 'OK' });
    }
  }

  async function onPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const att = await saveAttachment(file, noteId);
      editor.chain().focus().insertPdf({ attachmentId: att.id, filename: att.filename, pageCount: null }).run();
    } catch (err) {
      await dialog.confirm({ title: 'Could not add PDF', message: err instanceof Error ? err.message : 'Unknown error', confirmText: 'OK' });
    }
  }

  async function onLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = await dialog.prompt({
      title: prev ? 'Edit link' : 'Add link',
      label: 'URL',
      defaultValue: prev ?? 'https://',
      confirmText: 'Apply',
    });
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-3 py-1.5 backdrop-blur">
        <TB label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </TB>
        <TB label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </TB>
        <TB label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon />
        </TB>
        <TB label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough />
        </TB>

        {/* Text color */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" onMouseDown={(e) => e.preventDefault()}>
                  <Baseline />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Text color</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-auto">
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  className="size-6 rounded-full border"
                  style={{ background: c }}
                  onClick={() => editor.chain().focus().setColor(c).run()}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <input
                type="color"
                className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              />
              <Button variant="outline" size="sm" onClick={() => editor.chain().focus().unsetColor().run()}>
                Clear
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Highlight */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(editor.isActive('highlight') && 'bg-primary text-primary-foreground')}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Highlighter />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Highlight</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-auto">
            <div className="grid grid-cols-3 gap-1.5">
              {HIGHLIGHTS.map((c) => (
                <button
                  key={c}
                  className="size-6 rounded border"
                  style={{ background: c }}
                  onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <input
                type="color"
                className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
              />
              <Button variant="outline" size="sm" onClick={() => editor.chain().focus().unsetHighlight().run()}>
                Clear
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Divider />

        {/* Font size */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()}>
                  Size
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Font size</TooltipContent>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontSize().run()}>
              Default
            </DropdownMenuItem>
            {FONT_SIZES.map((s) => (
              <DropdownMenuItem key={s} onClick={() => editor.chain().focus().setFontSize(s).run()}>
                {s.replace('px', '')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <TB label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 />
        </TB>
        <TB label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </TB>
        <TB label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 />
        </TB>

        <Divider />

        <TB label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </TB>
        <TB label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </TB>
        <TB label="To-do list" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <CheckSquare />
        </TB>
        <TB label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote />
        </TB>
        <TB label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 />
        </TB>
        <TB label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus />
        </TB>

        <Divider />

        <TB label="Outdent" onClick={() => editor.chain().focus().outdent().run()}>
          <IndentDecrease />
        </TB>
        <TB label="Indent" onClick={() => editor.chain().focus().indent().run()}>
          <IndentIncrease />
        </TB>
        <TB label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft />
        </TB>
        <TB label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter />
        </TB>
        <TB label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight />
        </TB>

        <Divider />

        <Button type="button" variant="ghost" size="sm" className="font-serif" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setFontFamily('var(--font-serif)').run()}>
          Serif
        </Button>
        <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetFontFamily().run()}>
          Sans
        </Button>

        <Divider />

        <TB label="Link" active={editor.isActive('link')} onClick={onLink}>
          <Link2 />
        </TB>
        {editor.isActive('link') && (
          <TB label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
            <Unlink />
          </TB>
        )}
        <TB label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon />
        </TB>
        <TB label="Insert image" onClick={() => imageInput.current?.click()}>
          <ImageIcon />
        </TB>
        <TB label="Insert PDF" onClick={() => pdfInput.current?.click()}>
          <FileText />
        </TB>
        <TB label="Find & replace" onClick={onFind}>
          <Search />
        </TB>

        <input ref={imageInput} type="file" accept="image/*" hidden onChange={onImage} />
        <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={onPdf} />
      </div>
    </TooltipProvider>
  );
}
