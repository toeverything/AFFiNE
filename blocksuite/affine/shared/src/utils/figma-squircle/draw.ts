interface CornerPathParams {
  a: number;
  b: number;
  c: number;
  d: number;
  p: number;
  cornerRadius: number;
  arcSectionLength: number;
}

interface CornerParams {
  cornerRadius: number;
  cornerSmoothing: number;
  preserveSmoothing: boolean;
  roundingAndSmoothingBudget: number;
}

// The article from figma's blog
// https://www.figma.com/blog/desperately-seeking-squircles/
//
// The original code by MartinRGB
// https://github.com/MartinRGB/Figma_Squircles_Approximation/blob/bf29714aab58c54329f3ca130ffa16d39a2ff08c/js/rounded-corners.js#L64
export function getPathParamsForCorner({
  cornerRadius,
  cornerSmoothing,
  preserveSmoothing,
  roundingAndSmoothingBudget,
}: CornerParams): CornerPathParams {
  // From figure 12.2 in the article
  // p = (1 + cornerSmoothing) * q
  // in this case q = R because theta = 90deg
  let p = (1 + cornerSmoothing) * cornerRadius;

  // When there's not enough space left (p > roundingAndSmoothingBudget), there are 2 options:
  //
  // 1. What figma's currently doing: limit the smoothing value to make sure p <= roundingAndSmoothingBudget
  // But what this means is that at some point when cornerRadius is large enough,
  // increasing the smoothing value wouldn't do anything
  //
  // 2. Keep the original smoothing value and use it to calculate the bezier curve normally,
  // then adjust the control points to achieve similar curvature profile
  //
  // preserveSmoothing is a new option I added
  //
  // If preserveSmoothing is on then we'll just keep using the original smoothing value
  // and adjust the bezier curve later
  if (!preserveSmoothing) {
    const maxCornerSmoothing = roundingAndSmoothingBudget / cornerRadius - 1;
    cornerSmoothing = Math.min(cornerSmoothing, maxCornerSmoothing);
    p = Math.min(p, roundingAndSmoothingBudget);
  }

  // In a normal rounded rectangle (cornerSmoothing = 0), this is 90
  // The larger the smoothing, the smaller the arc
  const arcMeasure = 90 * (1 - cornerSmoothing);
  const arcSectionLength =
    Math.sin(toRadians(arcMeasure / 2)) * cornerRadius * Math.sqrt(2);

  // In the article this is the distance between 2 control points: P3 and P4
  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4Distance = cornerRadius * Math.tan(toRadians(angleAlpha / 2));

  // a, b, c and d are from figure 11.1 in the article
  const angleBeta = 45 * cornerSmoothing;
  const c = p3ToP4Distance * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));

  let b = (p - arcSectionLength - c - d) / 3;
  let a = 2 * b;

  // Adjust the P1 and P2 control points if there's not enough space left
  if (preserveSmoothing && p > roundingAndSmoothingBudget) {
    const p1ToP3MaxDistance =
      roundingAndSmoothingBudget - d - arcSectionLength - c;

    // Try to maintain some distance between P1 and P2 so the curve wouldn't look weird
    const minA = p1ToP3MaxDistance / 6;
    const maxB = p1ToP3MaxDistance - minA;

    b = Math.min(b, maxB);
    a = p1ToP3MaxDistance - b;
    p = Math.min(p, roundingAndSmoothingBudget);
  }

  return {
    a,
    b,
    c,
    d,
    p,
    arcSectionLength,
    cornerRadius,
  };
}

interface SVGPathInput {
  width: number;
  height: number;
  topRightPathParams: CornerPathParams;
  bottomRightPathParams: CornerPathParams;
  bottomLeftPathParams: CornerPathParams;
  topLeftPathParams: CornerPathParams;
}

export function getSVGPathFromPathParams({
  width,
  height,
  topLeftPathParams,
  topRightPathParams,
  bottomLeftPathParams,
  bottomRightPathParams,
}: SVGPathInput) {
  return `
    M ${width - topRightPathParams.p} 0
    ${drawTopRightPath(topRightPathParams)}
    L ${width} ${height - bottomRightPathParams.p}
    ${drawBottomRightPath(bottomRightPathParams)}
    L ${bottomLeftPathParams.p} ${height}
    ${drawBottomLeftPath(bottomLeftPathParams)}
    L 0 ${topLeftPathParams.p}
    ${drawTopLeftPath(topLeftPathParams)}
    Z
  `
    .replace(/[\t\s\n]+/g, ' ')
    .trim();
}

function drawTopRightPath({
  cornerRadius,
  a,
  b,
  c,
  d,
  p,
  arcSectionLength,
}: CornerPathParams) {
  if (cornerRadius) {
    return rounded`
    c ${a} 0 ${a + b} 0 ${a + b + c} ${d}
    a ${cornerRadius} ${cornerRadius} 0 0 1 ${arcSectionLength} ${arcSectionLength}
    c ${d} ${c}
        ${d} ${b + c}
        ${d} ${a + b + c}`;
  } else {
    return rounded`l ${p} 0`;
  }
}

function drawBottomRightPath({
  cornerRadius,
  a,
  b,
  c,
  d,
  p,
  arcSectionLength,
}: CornerPathParams) {
  if (cornerRadius) {
    return rounded`
    c 0 ${a}
      0 ${a + b}
      ${-d} ${a + b + c}
    a ${cornerRadius} ${cornerRadius} 0 0 1 -${arcSectionLength} ${arcSectionLength}
    c ${-c} ${d}
      ${-(b + c)} ${d}
      ${-(a + b + c)} ${d}`;
  } else {
    return rounded`l 0 ${p}`;
  }
}

function drawBottomLeftPath({
  cornerRadius,
  a,
  b,
  c,
  d,
  p,
  arcSectionLength,
}: CornerPathParams) {
  if (cornerRadius) {
    return rounded`
    c ${-a} 0
      ${-(a + b)} 0
      ${-(a + b + c)} ${-d}
    a ${cornerRadius} ${cornerRadius} 0 0 1 -${arcSectionLength} -${arcSectionLength}
    c ${-d} ${-c}
      ${-d} ${-(b + c)}
      ${-d} ${-(a + b + c)}`;
  } else {
    return rounded`l ${-p} 0`;
  }
}

function drawTopLeftPath({
  cornerRadius,
  a,
  b,
  c,
  d,
  p,
  arcSectionLength,
}: CornerPathParams) {
  if (cornerRadius) {
    return rounded`
    c 0 ${-a}
      0 ${-(a + b)}
      ${d} ${-(a + b + c)}
    a ${cornerRadius} ${cornerRadius} 0 0 1 ${arcSectionLength} -${arcSectionLength}
    c ${c} ${-d}
      ${b + c} ${-d}
      ${a + b + c} ${-d}`;
  } else {
    return rounded`l 0 ${-p}`;
  }
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function rounded(strings: TemplateStringsArray, ...values: number[]): string {
  return strings.reduce((acc, str, i) => {
    const value = values[i];

    if (typeof value === 'number') {
      return acc + str + value.toFixed(4);
    } else {
      return acc + str + (value ?? '');
    }
  }, '');
}
