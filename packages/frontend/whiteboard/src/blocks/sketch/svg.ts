import type { SketchElement, SketchScene } from './types';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function elementToSvg(element: SketchElement): string {
  const stroke = element.strokeColor || '#1e1e1e';
  const fill =
    !element.backgroundColor || element.backgroundColor === 'transparent'
      ? 'none'
      : element.backgroundColor;
  const width = Math.max(1, element.width);
  const height = Math.max(1, element.height);
  const sw = element.strokeWidth ?? 2;

  switch (element.type) {
    case 'ellipse':
      return `<ellipse cx="${element.x + width / 2}" cy="${element.y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'diamond': {
      const cx = element.x + width / 2;
      const cy = element.y + height / 2;
      return `<polygon points="${cx},${element.y} ${element.x + width},${cy} ${cx},${element.y + height} ${element.x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    case 'arrow':
    case 'line': {
      const x2 = element.x + width;
      const y2 = element.y + height;
      const marker =
        element.type === 'arrow' ? ' marker-end="url(#wb-sketch-arrow)"' : '';
      return `<line x1="${element.x}" y1="${element.y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${marker}/>`;
    }
    case 'freedraw': {
      const points = element.points ?? [];
      if (!points.length) return '';
      const d = points
        .map((point, index) => {
          const x = element.x + (point[0] ?? 0);
          const y = element.y + (point[1] ?? 0);
          return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
        })
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    case 'text':
      return `<text x="${element.x + 4}" y="${element.y + (element.fontSize ?? 16)}" fill="${stroke}" font-size="${element.fontSize ?? 16}">${escapeXml(element.text || '')}</text>`;
    default:
      return `<rect x="${element.x}" y="${element.y}" width="${width}" height="${height}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
}

export function sceneToSvg(scene: SketchScene, size = { width: 560, height: 360 }) {
  const background = scene.appState.viewBackgroundColor || '#ffffff';
  const body = scene.elements.map(elementToSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs><marker id="wb-sketch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1e1e1e"/></marker></defs><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`;
}

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
