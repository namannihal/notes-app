import type { JSONContent } from '@tiptap/react';

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

function applyMarks(text: string, marks?: Mark[]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has('code')) out = '`' + out + '`';
  if (has('bold')) out = '**' + out + '**';
  if (has('italic')) out = '*' + out + '*';
  if (has('strike')) out = '~~' + out + '~~';
  const link = marks.find((m) => m.type === 'link');
  if (link?.attrs?.href) out = `[${out}](${String(link.attrs.href)})`;
  return out;
}

function inline(nodes?: JSONContent[]): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'text') return applyMarks(n.text ?? '', n.marks as Mark[] | undefined);
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'image') return `![${(n.attrs?.alt as string) ?? 'image'}]()`;
      return '';
    })
    .join('');
}

function tableToMarkdown(node: JSONContent): string {
  const rows = node.content ?? [];
  const lines: string[] = [];
  rows.forEach((row, ri) => {
    const cells = (row.content ?? []).map((cell) => inline((cell.content ?? [])[0]?.content).trim() || ' ');
    lines.push('| ' + cells.join(' | ') + ' |');
    if (ri === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
  });
  return lines.join('\n') + '\n\n';
}

function block(node: JSONContent, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content) + '\n\n';
    case 'heading':
      return '#'.repeat((node.attrs?.level as number) ?? 1) + ' ' + inline(node.content) + '\n\n';
    case 'blockquote':
      return (
        (node.content ?? [])
          .map((c) => block(c, depth))
          .join('')
          .trim()
          .split('\n')
          .map((l) => '> ' + l)
          .join('\n') + '\n\n'
      );
    case 'codeBlock':
      return '```\n' + inline(node.content) + '\n```\n\n';
    case 'horizontalRule':
      return '---\n\n';
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList';
      return (
        (node.content ?? [])
          .map((item, i) => {
            const marker = ordered ? `${i + 1}. ` : '- ';
            const checked = item.attrs?.checked;
            const box = item.type === 'taskItem' ? (checked ? '[x] ' : '[ ] ') : '';
            const inner = (item.content ?? [])
              .map((c) => block(c, depth + 1))
              .join('')
              .trim();
            const pad = '  '.repeat(depth);
            return `${pad}${marker}${box}${inner}`;
          })
          .join('\n') + '\n\n'
      );
    }
    case 'taskList':
      return (
        (node.content ?? [])
          .map((item) => {
            const box = item.attrs?.checked ? '[x] ' : '[ ] ';
            const inner = (item.content ?? [])
              .map((c) => block(c, depth + 1))
              .join('')
              .trim();
            return `- ${box}${inner}`;
          })
          .join('\n') + '\n\n'
      );
    case 'table':
      return tableToMarkdown(node);
    case 'image':
      return `![${(node.attrs?.alt as string) ?? 'image'}]()\n\n`;
    case 'pdfBlock':
      return `_[PDF: ${(node.attrs?.filename as string) ?? 'document'}]_\n\n`;
    default:
      return node.content ? node.content.map((c) => block(c, depth)).join('') : '';
  }
}

/** Convert a TipTap document to Markdown. */
export function tiptapToMarkdown(doc: JSONContent, title?: string): string {
  const body = (doc.content ?? []).map((n) => block(n)).join('');
  const header = title ? `# ${title}\n\n` : '';
  return (header + body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
