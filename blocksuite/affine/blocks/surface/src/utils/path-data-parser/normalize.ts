import type { Segment } from './parser.js';

// Normalize path to include only M, L, C, and Z commands
export function normalize(segments: Segment[]): Segment[] {
  const out: Segment[] = [];

  let lastType = '';
  let cx = 0,
    cy = 0;
  let subx = 0,
    suby = 0;
  let lcx = 0,
    lcy = 0;

  for (const { key, data } of segments) {
    switch (key) {
      case 'M':
        out.push({ key: 'M', data: [...data] });
        [cx, cy] = data;
        [subx, suby] = data;
        break;
      case 'C':
        out.push({ key: 'C', data: [...data] });
        cx = data[4];
        cy = data[5];
        lcx = data[2];
        lcy = data[3];
        break;
      case 'L':
        out.push({ key: 'L', data: [...data] });
        [cx, cy] = data;
        break;
      case 'H':
        cx = data[0];
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'V':
        cy = data[0];
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'S': {
        let cx1 = 0,
          cy1 = 0;
        if (lastType === 'C' || lastType === 'S') {
          cx1 = cx + (cx - lcx);
          cy1 = cy + (cy - lcy);
        } else {
          cx1 = cx;
          cy1 = cy;
        }
        out.push({ key: 'C', data: [cx1, cy1, ...data] });
        lcx = data[0];
        lcy = data[1];
        cx = data[2];
        cy = data[3];
        break;
      }
      case 'T': {
        const [x, y] = data;
        let x1 = 0,
          y1 = 0;
        if (lastType === 'Q' || lastType === 'T') {
          x1 = cx + (cx - lcx);
          y1 = cy + (cy - lcy);
        } else {
          x1 = cx;
          y1 = cy;
        }
        const cx1 = cx + (2 * (x1 - cx)) / 3;
        const cy1 = cy + (2 * (y1 - cy)) / 3;
        const cx2 = x + (2 * (x1 - x)) / 3;
        const cy2 = y + (2 * (y1 - y)) / 3;
        out.push({ key: 'C', data: [cx1, cy1, cx2, cy2, x, y] });
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const [x1, y1, x, y] = data;
        const cx1 = cx + (2 * (x1 - cx)) / 3;
        const cy1 = cy + (2 * (y1 - cy)) / 3;
        const cx2 = x + (2 * (x1 - x)) / 3;
        const cy2 = y + (2 * (y1 - y)) / 3;
        out.push({ key: 'C', data: [cx1, cy1, cx2, cy2, x, y] });
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const r1 = Math.abs(data[0]);
        const r2 = Math.abs(data[1]);
        const angle = data[2];
        const largeArcFlag = data[3];
        const sweepFlag = data[4];
        const x = data[5];
        const y = data[6];
        if (r1 === 0 || r2 === 0) {
          out.push({ key: 'C', data: [cx, cy, x, y, x, y] });
          cx = x;
          cy = y;
        } else {
          if (cx !== x || cy !== y) {
            const curves: number[][] = arcToCubicCurves(
              cx,
              cy,
              x,
              y,
              r1,
              r2,
              angle,
              largeArcFlag,
              sweepFlag
            );
            curves.forEach(function (curve) {
              out.push({ key: 'C', data: curve });
            });
            cx = x;
            cy = y;
          }
        }
        break;
      }
      case 'Z':
        out.push({ key: 'Z', data: [] });
        cx = subx;
        cy = suby;
        break;
    }
    lastType = key;
  }
  return out;
}

function degToRad(degrees: number): number {
  return (Math.PI * degrees) / 180;
}

function rotate(x: number, y: number, angleRad: number): [number, number] {
  const X = x * Math.cos(angleRad) - y * Math.sin(angleRad);
  const Y = x * Math.sin(angleRad) + y * Math.cos(angleRad);
  return [X, Y];
}

function arcToCubicCurves(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  r2: number,
  angle: number,
  largeArcFlag: number,
  sweepFlag: number,
  recursive?: number[]
): number[][] {
  const angleRad = degToRad(angle);
  let params: number[][] = [];

  let f1 = 0,
    f2 = 0,
    cx = 0,
    cy = 0;
  if (recursive) {
    [f1, f2, cx, cy] = recursive;
  } else {
    [x1, y1] = rotate(x1, y1, -angleRad);
    [x2, y2] = rotate(x2, y2, -angleRad);

    const x = (x1 - x2) / 2;
    const y = (y1 - y2) / 2;
    let h = (x * x) / (r1 * r1) + (y * y) / (r2 * r2);
    if (h > 1) {
      h = Math.sqrt(h);
      r1 = h * r1;
      r2 = h * r2;
    }

    const sign = largeArcFlag === sweepFlag ? -1 : 1;

    const r1Pow = r1 * r1;
    const r2Pow = r2 * r2;

    const left = r1Pow * r2Pow - r1Pow * y * y - r2Pow * x * x;
    const right = r1Pow * y * y + r2Pow * x * x;

    const k = sign * Math.sqrt(Math.abs(left / right));

    cx = (k * r1 * y) / r2 + (x1 + x2) / 2;
    cy = (k * -r2 * x) / r1 + (y1 + y2) / 2;

    f1 = Math.asin(parseFloat(((y1 - cy) / r2).toFixed(9)));
    f2 = Math.asin(parseFloat(((y2 - cy) / r2).toFixed(9)));

    if (x1 < cx) {
      f1 = Math.PI - f1;
    }
    if (x2 < cx) {
      f2 = Math.PI - f2;
    }

    if (f1 < 0) {
      f1 = Math.PI * 2 + f1;
    }
    if (f2 < 0) {
      f2 = Math.PI * 2 + f2;
    }

    if (sweepFlag && f1 > f2) {
      f1 = f1 - Math.PI * 2;
    }
    if (!sweepFlag && f2 > f1) {
      f2 = f2 - Math.PI * 2;
    }
  }

  let df = f2 - f1;

  if (Math.abs(df) > (Math.PI * 120) / 180) {
    const f2old = f2;
    const x2old = x2;
    const y2old = y2;

    if (sweepFlag && f2 > f1) {
      f2 = f1 + ((Math.PI * 120) / 180) * 1;
    } else {
      f2 = f1 + ((Math.PI * 120) / 180) * -1;
    }

    x2 = cx + r1 * Math.cos(f2);
    y2 = cy + r2 * Math.sin(f2);
    params = arcToCubicCurves(
      x2,
      y2,
      x2old,
      y2old,
      r1,
      r2,
      angle,
      0,
      sweepFlag,
      [f2, f2old, cx, cy]
    );
  }

  df = f2 - f1;

  const c1 = Math.cos(f1);
  const s1 = Math.sin(f1);
  const c2 = Math.cos(f2);
  const s2 = Math.sin(f2);
  const t = Math.tan(df / 4);
  const hx = (4 / 3) * r1 * t;
  const hy = (4 / 3) * r2 * t;

  const m1 = [x1, y1];
  const m2 = [x1 + hx * s1, y1 - hy * c1];
  const m3 = [x2 + hx * s2, y2 - hy * c2];
  const m4 = [x2, y2];

  m2[0] = 2 * m1[0] - m2[0];
  m2[1] = 2 * m1[1] - m2[1];

  if (recursive) {
    return [m2, m3, m4].concat(params);
  } else {
    params = [m2, m3, m4].concat(params);
    const curves = [];
    for (let i = 0; i < params.length; i += 3) {
      const r1 = rotate(params[i][0], params[i][1], angleRad);
      const r2 = rotate(params[i + 1][0], params[i + 1][1], angleRad);
      const r3 = rotate(params[i + 2][0], params[i + 2][1], angleRad);
      curves.push([r1[0], r1[1], r2[0], r2[1], r3[0], r3[1]]);
    }
    return curves;
  }
}
