/**
 * Best-effort Miro CSV / board export (plan §6.8 P2).
 * Official exports are incomplete; we only map title + xy when present.
 */

export type MiroCsvRow = {
  title: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

const HEADER_ALIASES: Record<string, keyof MiroCsvRow> = {
  title: 'title',
  name: 'title',
  content: 'title',
  type: 'type',
  x: 'x',
  y: 'y',
  width: 'w',
  height: 'h',
  w: 'w',
  h: 'h',
};

export function parseMiroCsv(text: string): MiroCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? '').map(cell =>
    cell.toLowerCase().trim()
  );
  const rows: MiroCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: MiroCsvRow = { title: '' };
    headers.forEach((header, index) => {
      const key = HEADER_ALIASES[header];
      if (!key) return;
      const raw = cells[index] ?? '';
      if (key === 'title' || key === 'type') {
        row[key] = raw;
        return;
      }
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) row[key] = numeric;
    });
    if (row.title) rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
