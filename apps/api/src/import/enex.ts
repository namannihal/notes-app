import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { type AttachmentKind, Prisma } from '@prisma/client';
import { blobKeyFor, uploadBytes } from '../storage/blob.js';
import { prisma } from '../db.js';

interface Resource {
  md5: string;
  sha256: string;
  data: Buffer;
  mime: string;
  filename: string;
  kind: AttachmentKind;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  cdataPropName: '__cdata',
  trimValues: false,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parse the <resource> nodes of a note into a hash → resource lookup. */
function parseResources(noteChildren: Record<string, unknown>[]): Map<string, Resource> {
  const map = new Map<string, Resource>();
  for (const child of noteChildren) {
    const res = child['resource'] as Record<string, unknown>[] | undefined;
    if (!res) continue;
    let base64 = '';
    let mime = 'application/octet-stream';
    let filename = 'attachment';
    for (const field of res) {
      if ('data' in field) {
        const dataNode = asArray(field['data'] as unknown)[0] as Record<string, unknown>;
        base64 = String((dataNode?.['#text'] as string) ?? '').replace(/\s+/g, '');
      }
      if ('mime' in field) {
        const mimeNode = asArray(field['mime'] as unknown)[0] as Record<string, unknown>;
        mime = String((mimeNode?.['#text'] as string) ?? mime);
      }
      if ('resource-attributes' in field) {
        const attrs = field['resource-attributes'] as Record<string, unknown>[];
        for (const a of attrs) {
          if ('file-name' in a) {
            const fn = asArray(a['file-name'] as unknown)[0] as Record<string, unknown>;
            filename = String((fn?.['#text'] as string) ?? filename);
          }
        }
      }
    }
    if (!base64) continue;
    const data = Buffer.from(base64, 'base64');
    const md5 = crypto.createHash('md5').update(data).digest('hex');
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const kind: AttachmentKind = mime === 'application/pdf' ? 'pdf' : 'image';
    map.set(md5, { md5, sha256, data, mime, filename, kind });
  }
  return map;
}

/** Minimal ENML → TipTap conversion. Refine later for richer fidelity. */
function enmlToDoc(
  enml: string,
  resources: Map<string, Resource>,
  attachmentByMd5: Map<string, string>,
) {
  const content: Record<string, unknown>[] = [];

  // Replace <en-media .../> markers so we can pull out attachments after text split.
  const mediaRegex = /<en-media[^>]*hash="([a-f0-9]+)"[^>]*\/?>/gi;
  const placeholders = new Map<string, string>();
  let idx = 0;
  const withMarkers = enml.replace(mediaRegex, (_m, hash: string) => {
    const token = `\u0000MEDIA${idx++}\u0000`;
    placeholders.set(token, hash);
    return token;
  });

  // Split into block-ish chunks on common block tags, then strip remaining tags.
  const blocks = withMarkers
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .split('\n');

  for (const raw of blocks) {
    // Emit any media placeholders in this block as their own nodes.
    for (const [token, hash] of placeholders) {
      if (raw.includes(token)) {
        const attachmentId = attachmentByMd5.get(hash);
        const resource = resources.get(hash);
        if (attachmentId && resource) {
          if (resource.kind === 'pdf') {
            content.push({
              type: 'pdfBlock',
              attrs: { attachmentId, filename: resource.filename, pageCount: null },
            });
          } else {
            content.push({
              type: 'paragraph',
              content: [{ type: 'image', attrs: { src: '', alt: resource.filename, attachmentId } }],
            });
          }
        }
      }
    }
    const text = raw
      .replace(/\u0000MEDIA\d+\u0000/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (text) {
      content.push({ type: 'paragraph', content: [{ type: 'text', text }] });
    }
  }

  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

function plainText(enml: string): string {
  return enml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ImportResult {
  notebookId: string;
  notesImported: number;
  attachmentsImported: number;
}

/**
 * Parse an ENEX export and create a notebook of imported notes (with their
 * images/PDFs uploaded to blob storage) under the given stack.
 */
export async function importEnex(
  xml: string,
  userId: string,
  stackId: string,
  notebookTitle: string,
): Promise<ImportResult> {
  const parsed = parser.parse(xml) as Record<string, unknown>[];
  const exportNode = parsed.find((n) => 'en-export' in n)?.['en-export'] as
    | Record<string, unknown>[]
    | undefined;
  if (!exportNode) throw new Error('Not a valid ENEX file');

  const notebook = await prisma.notebook.create({
    data: { stackId, userId, title: notebookTitle },
  });

  let notesImported = 0;
  let attachmentsImported = 0;

  for (const node of exportNode) {
    const noteChildren = node['note'] as Record<string, unknown>[] | undefined;
    if (!noteChildren) continue;

    let title = 'Untitled';
    let contentEnml = '';
    for (const field of noteChildren) {
      if ('title' in field) {
        const t = asArray(field['title'] as unknown)[0] as Record<string, unknown>;
        title = String((t?.['#text'] as string) ?? title);
      }
      if ('content' in field) {
        const c = asArray(field['content'] as unknown)[0] as Record<string, unknown>;
        contentEnml = String((c?.['__cdata'] as string) ?? (c?.['#text'] as string) ?? '');
      }
    }

    const resources = parseResources(noteChildren);

    // Create the note first so attachments can reference it.
    const note = await prisma.note.create({
      data: {
        notebookId: notebook.id,
        userId,
        title,
        contentJson: {},
        contentText: plainText(contentEnml),
      },
    });

    // Upload each resource and record its attachment id keyed by MD5.
    const attachmentByMd5 = new Map<string, string>();
    for (const resource of resources.values()) {
      const storageKey = blobKeyFor(userId, resource.sha256);
      await uploadBytes(storageKey, resource.data, resource.mime);
      const attachment = await prisma.attachment.create({
        data: {
          noteId: note.id,
          userId,
          kind: resource.kind,
          filename: resource.filename,
          mimeType: resource.mime,
          byteSize: resource.data.byteLength,
          checksum: resource.sha256,
          storageKey,
          status: 'ready',
        },
      });
      attachmentByMd5.set(resource.md5, attachment.id);
      attachmentsImported++;
    }

    const doc = enmlToDoc(contentEnml, resources, attachmentByMd5);
    await prisma.note.update({
      where: { id: note.id },
      data: { contentJson: doc as unknown as Prisma.InputJsonValue },
    });
    notesImported++;
  }

  return { notebookId: notebook.id, notesImported, attachmentsImported };
}
