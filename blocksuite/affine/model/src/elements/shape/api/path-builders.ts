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
  return [
    [`M 0 ${isoH}`, `L ${width * 0.5} ${isoH * 2}`, `L ${width} ${isoH}`].join(
      ' '
    ),
    [`M ${width * 0.5} ${isoH * 2}`, `L ${width * 0.5} ${height}`].join(' '),
  ];
};
