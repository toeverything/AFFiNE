export type DrawioShape = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * draw.io / diagrams.net XML → AABB shapes (plan §6.8 P2).
 * Imports geometry only; styles and connectors are out of scope.
 */
export function parseDrawioXml(xml: string): DrawioShape[] {
  if (typeof DOMParser === 'undefined') return parseDrawioXmlLite(xml);
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const cells = [...doc.querySelectorAll('mxCell')];
    const shapes: DrawioShape[] = [];
    for (const cell of cells) {
      if (cell.getAttribute('vertex') !== '1') continue;
      const geometry = cell.querySelector('mxGeometry');
      if (!geometry) continue;
      const x = Number(geometry.getAttribute('x') ?? 0);
      const y = Number(geometry.getAttribute('y') ?? 0);
      const w = Number(geometry.getAttribute('width') ?? 0);
      const h = Number(geometry.getAttribute('height') ?? 0);
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
      shapes.push({
        id: cell.getAttribute('id') || `cell-${shapes.length}`,
        label: cell.getAttribute('value') || '',
        x,
        y,
        w,
        h,
      });
    }
    return shapes;
  } catch {
    return parseDrawioXmlLite(xml);
  }
}

function xmlAttr(source: string, name: string) {
  return source.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

/** Regex fallback for tests / workers without a full DOM. */
export function parseDrawioXmlLite(xml: string): DrawioShape[] {
  const shapes: DrawioShape[] = [];
  const cellRe = /<mxCell\b([^>]*\bvertex="1"[^>]*)>([\s\S]*?)<\/mxCell>/g;
  for (const match of xml.matchAll(cellRe)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const geoTag = body.match(/<mxGeometry\b([^>]*)\/?>/);
    if (!geoTag) continue;
    const geo = geoTag[1] ?? '';
    const x = Number(xmlAttr(geo, 'x') ?? 0);
    const y = Number(xmlAttr(geo, 'y') ?? 0);
    const w = Number(xmlAttr(geo, 'width') ?? 0);
    const h = Number(xmlAttr(geo, 'height') ?? 0);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    shapes.push({
      id: xmlAttr(attrs, 'id') || `cell-${shapes.length}`,
      label: decodeDrawioLabel(xmlAttr(attrs, 'value') ?? ''),
      x,
      y,
      w,
      h,
    });
  }
  return shapes;
}

function decodeDrawioLabel(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
