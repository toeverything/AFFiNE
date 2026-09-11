/**
 * One entry point for the file importers (plan §6.8).
 * The sketch toolbar dispatches through it, so `.drawio` / Miro CSV land in the
 * same place as `.excalidraw` instead of each caller sniffing formats.
 */

import { type DrawioShape, parseDrawioXml } from './formats/drawio';
import { type MiroCsvRow, parseMiroCsv } from './formats/miro-csv';
import { isBoardReadonly } from './permissions';

export type WhiteboardImportFormat = 'excalidraw' | 'drawio' | 'miro-csv';

export type WhiteboardImport =
  | { format: 'excalidraw'; json: string }
  | { format: 'drawio'; shapes: DrawioShape[] }
  | { format: 'miro-csv'; rows: MiroCsvRow[] };

export type WhiteboardImportFile = {
  name: string;
  text: () => Promise<string>;
};

export const WHITEBOARD_IMPORT_ACCEPT =
  '.excalidraw,.drawio,.xml,.csv,application/json,text/csv,text/xml';

const FORMAT_BY_EXTENSION: Record<string, WhiteboardImportFormat> = {
  excalidraw: 'excalidraw',
  json: 'excalidraw',
  drawio: 'drawio',
  xml: 'drawio',
  csv: 'miro-csv',
};

export function sniffWhiteboardFormat(
  name: string
): WhiteboardImportFormat | undefined {
  const extension = name.toLowerCase().split('.').pop();
  if (!extension) return;
  return FORMAT_BY_EXTENSION[extension];
}

export async function importWhiteboardFile(
  store: { readonly?: boolean } | null | undefined,
  file: WhiteboardImportFile
): Promise<WhiteboardImport | undefined> {
  if (isBoardReadonly(store)) return;
  const format = sniffWhiteboardFormat(file.name);
  if (!format) return;
  const text = await file.text();
  if (format === 'excalidraw') {
    return text.trim() ? { format, json: text } : undefined;
  }
  if (format === 'drawio') {
    const shapes = parseDrawioXml(text);
    return shapes.length ? { format, shapes } : undefined;
  }
  const rows = parseMiroCsv(text);
  return rows.length ? { format, rows } : undefined;
}
