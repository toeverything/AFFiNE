import type { Segment } from './parser.js';

// Translate relative commands to absolute commands
export function absolutize(segments: Segment[]): Segment[] {
  let cx = 0,
    cy = 0;
  let subx = 0,
    suby = 0;
  const out: Segment[] = [];
  for (const { key, data } of segments) {
    switch (key) {
      case 'M':
        out.push({ key: 'M', data: [...data] });
        [cx, cy] = data;
        [subx, suby] = data;
        break;
      case 'm':
        cx += data[0];
        cy += data[1];
        out.push({ key: 'M', data: [cx, cy] });
        subx = cx;
        suby = cy;
        break;
      case 'L':
        out.push({ key: 'L', data: [...data] });
        [cx, cy] = data;
        break;
      case 'l':
        cx += data[0];
        cy += data[1];
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'C':
        out.push({ key: 'C', data: [...data] });
        cx = data[4];
        cy = data[5];
        break;
      case 'c': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'C', data: newdata });
        cx = newdata[4];
        cy = newdata[5];
        break;
      }
      case 'Q':
        out.push({ key: 'Q', data: [...data] });
        cx = data[2];
        cy = data[3];
        break;
      case 'q': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'Q', data: newdata });
        cx = newdata[2];
        cy = newdata[3];
        break;
      }
      case 'A':
        out.push({ key: 'A', data: [...data] });
        cx = data[5];
        cy = data[6];
        break;
      case 'a':
        cx += data[5];
        cy += data[6];
        out.push({
          key: 'A',
          data: [data[0], data[1], data[2], data[3], data[4], cx, cy],
        });
        break;
      case 'H':
        out.push({ key: 'H', data: [...data] });
        cx = data[0];
        break;
      case 'h':
        cx += data[0];
        out.push({ key: 'H', data: [cx] });
        break;
      case 'V':
        out.push({ key: 'V', data: [...data] });
        cy = data[0];
        break;
      case 'v':
        cy += data[0];
        out.push({ key: 'V', data: [cy] });
        break;
      case 'S':
        out.push({ key: 'S', data: [...data] });
        cx = data[2];
        cy = data[3];
        break;
      case 's': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'S', data: newdata });
        cx = newdata[2];
        cy = newdata[3];
        break;
      }
      case 'T':
        out.push({ key: 'T', data: [...data] });
        cx = data[0];
        cy = data[1];
        break;
      case 't':
        cx += data[0];
        cy += data[1];
        out.push({ key: 'T', data: [cx, cy] });
        break;
      case 'Z':
      case 'z':
        out.push({ key: 'Z', data: [] });
        cx = subx;
        cy = suby;
        break;
    }
  }
  return out;
}
