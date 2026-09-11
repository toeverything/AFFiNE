import type { ChartInlineTable } from '../../blocks/chart/types';

/**
 * Mermaid → chart table (plan §6.8 P1).
 * Supports pie and xychart-beta; other diagrams fall back to node labels.
 */

function unquote(value: string) {
  return value.trim().replace(/^["']|["']$/g, '');
}

function parseNumber(value: string) {
  const parsed = Number(unquote(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseMermaidPie(source: string): ChartInlineTable | undefined {
  const rows: Array<Array<string | number | null>> = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*["']?([^"':]+)["']?\s*:\s*([-\d.]+)/);
    if (!match) continue;
    rows.push([unquote(match[1] ?? ''), parseNumber(match[2] ?? '0')]);
  }
  if (!rows.length) return;
  return { columns: ['label', 'value'], rows };
}

export function parseMermaidXyChart(source: string): ChartInlineTable | undefined {
  const xMatch = source.match(/x-axis[^\n[]*\[([^\]]+)\]/i);
  const barMatch = source.match(/\b(?:bar|line)\s+\[([^\]]+)\]/i);
  if (!xMatch || !barMatch) return;
  const labels = xMatch[1].split(',').map(unquote).filter(Boolean);
  const values = barMatch[1].split(',').map(parseNumber);
  if (!labels.length) return;
  return {
    columns: ['x', 'y'],
    rows: labels.map((label, index) => [label, values[index] ?? 0]),
  };
}

export function parseMermaidNodes(source: string): ChartInlineTable | undefined {
  const counts = new Map<string, number>();
  const re = /(?:^|\s)(?:[A-Za-z][\w]*)(?:\[["']([^"'\]]+)["']\]|\(([^)]+)\)|\[([^\]]+)\])/g;
  for (const match of source.matchAll(re)) {
    const label = unquote(match[1] || match[2] || match[3] || '');
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (!counts.size) return;
  return {
    columns: ['label', 'value'],
    rows: [...counts.entries()].map(([label, value]) => [label, value]),
  };
}

export function mermaidToInlineTable(source: string): ChartInlineTable | undefined {
  const text = source.trim();
  if (!text) return;
  if (/^\s*pie\b/im.test(text)) return parseMermaidPie(text);
  if (/xychart/i.test(text)) return parseMermaidXyChart(text);
  return parseMermaidNodes(text);
}
