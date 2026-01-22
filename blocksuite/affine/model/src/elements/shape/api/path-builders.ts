export const buildDocumentPath = (width: number, height: number) => {
  const curve = height * 0.2;

  return [
    `M 0 0`,
    `L ${width} 0`,
    `L ${width} ${height - curve}`,
    `Q ${width * 0.75} ${height} ${width * 0.5} ${height - curve}`,
    `Q ${width * 0.25} ${height - curve * 2} 0 ${height - curve}`,
    'Z',
  ].join(' ');
};

export const buildCubePath = (width: number, height: number) => {
  const isoAngle = (15 * Math.PI) / 200;
  const isoH = Math.min(width * Math.tan(isoAngle), height * 0.5);

  return [
    `M ${width * 0.5} 0`,
    `L ${width} ${isoH}`,
    `L ${width} ${height - isoH}`,
    `L ${width * 0.5} ${height}`,
    `L 0 ${height - isoH}`,
    `L 0 ${isoH}`,
    'Z',
  ].join(' ');
};

export const buildCubeInnerPaths = (width: number, height: number) => {
  const isoAngle = (15 * Math.PI) / 200;
  const isoH = Math.min(width * Math.tan(isoAngle), height * 0.5);
  const topLeft: [number, number] = [0, isoH];
  const topRight: [number, number] = [width, isoH];
  const mid: [number, number] = [width * 0.5, isoH * 2];
  const bottom: [number, number] = [width * 0.5, height];
  return [
    [`M ${topLeft[0]} ${topLeft[1]}`, `L ${mid[0]} ${mid[1]}`].join(' '),
    [`M ${topRight[0]} ${topRight[1]}`, `L ${mid[0]} ${mid[1]}`].join(' '),
    [`M ${mid[0]} ${mid[1]}`, `L ${bottom[0]} ${bottom[1]}`].join(' '),
  ];
};
