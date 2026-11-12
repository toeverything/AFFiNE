export const buildCylinderPath = (width: number, height: number) => {
  const rx = width / 2;
  const ry = Math.min(height * 0.18, width * 0.25);
  const topY = ry;
  const bottomY = height - ry;

  return [
    `M 0 ${topY}`,
    `A ${rx} ${ry} 0 0 1 ${width} ${topY}`,
    `L ${width} ${bottomY}`,
    `A ${rx} ${ry} 0 0 1 0 ${bottomY}`,
    'Z',
    `M ${rx} ${topY}`,
    `A ${rx} ${ry} 0 1 1 ${rx} ${topY - 0.0001}`,
  ].join(' ');
};

export const buildCloudPath = (width: number, height: number) => {
  return [
    `M ${width * 0.25} ${height * 0.25}`,
    `C ${width * 0.05} ${height * 0.25} 0 ${height * 0.5} ${width * 0.16} ${height * 0.5}`,
    `C 0 ${height * 0.66} ${width * 0.18} ${height * 0.9} ${width * 0.31} ${height * 0.8}`,
    `C ${width * 0.4} ${height} ${width * 0.7} ${height} ${width * 0.8} ${height * 0.8}`,
    `C ${width} ${height * 0.8} ${width} ${height * 0.6} ${width * 0.875} ${height * 0.5}`,
    `C ${width} ${height * 0.3} ${width * 0.8} ${height * 0.1} ${width * 0.625} ${height * 0.2}`,
    `C ${width * 0.5} ${height * 0.05} ${width * 0.3} ${height * 0.05} ${width * 0.25} ${height * 0.25}`,
    'Z',
  ].join(' ');
};

export {
  buildCubeInnerPaths,
  buildCubePath,
  buildDocumentPath,
} from '@blocksuite/affine-model';

export const buildNotePath = (width: number, height: number) => {
  const fold = Math.min(width, height) * 0.2;

  return [
    `M 0 0`,
    `L ${width - fold} 0`,
    `L ${width} ${fold}`,
    `L ${width} ${height}`,
    `L 0 ${height}`,
    `L 0 0`,
    'Z',
  ].join(' ');
};

export const buildNoteFoldPaths = (width: number, height: number) => {
  const fold = Math.min(width, height) * 0.2;
  return [
    [
      `M ${width - fold} 0`,
      `L ${width - fold} ${fold}`,
      `L ${width} ${fold}`,
    ].join(' '),
  ];
};

export const buildCalloutPath = (width: number, height: number) => {
  const tailY = height * 0.72;
  return [
    `M ${width * 0.153} ${tailY}`,
    `L 0 ${tailY}`,
    `L 0 0`,
    `L ${width} 0`,
    `L ${width} ${tailY}`,
    `L ${width * 0.296} ${tailY}`,
    `L ${width * 0.04} ${height}`,
    'Z',
  ].join(' ');
};

export const buildActorPath = (width: number, height: number) => {
  const neck = width / 3;
  return [
    `M 0 ${height}`,
    `C 0 ${height * 0.6} 0 ${height * 0.4} ${width / 2} ${height * 0.4}`,
    `C ${width / 2 - neck} ${height * 0.4} ${width / 2 - neck} 0 ${width / 2} 0`,
    `C ${width / 2 + neck} 0 ${width / 2 + neck} ${height * 0.4} ${width / 2} ${height * 0.4}`,
    `C ${width} ${height * 0.4} ${width} ${height * 0.6} ${width} ${height}`,
    'Z',
  ].join(' ');
};

export const buildDataStoragePath = (width: number, height: number) => {
  const rx = width / 2;
  const ry = Math.min(height * 0.12, width * 0.2);
  const topY = ry;
  const bottomY = height - ry;

  return [
    `M 0 ${topY}`,
    `A ${rx} ${ry} 0 0 1 ${width} ${topY}`,
    `L ${width} ${bottomY}`,
    `A ${rx} ${ry} 0 0 1 0 ${bottomY}`,
    'Z',
    `M ${rx} ${topY}`,
    `A ${rx} ${ry} 0 1 1 ${rx} ${topY - 0.0001}`,
  ].join(' ');
};

export const buildTapePath = (width: number, height: number) => {
  const curve = height * 0.2;

  return [
    `M 0 ${curve}`,
    `Q ${width * 0.25} 0 ${width * 0.5} ${curve}`,
    `Q ${width * 0.75} ${curve * 2} ${width} ${curve}`,
    `L ${width} ${height - curve}`,
    `Q ${width * 0.75} ${height} ${width * 0.5} ${height - curve}`,
    `Q ${width * 0.25} ${height - curve * 2} 0 ${height - curve}`,
    'Z',
  ].join(' ');
};

export const buildInternalStoragePath = (width: number, height: number) => {
  const inset = width * 0.15;

  return [
    `M 0 0`,
    `L ${width} 0`,
    `L ${width} ${height}`,
    `L 0 ${height}`,
    'Z',
    `M ${inset} 0`,
    `L ${inset} ${height}`,
    `M 0 ${height * 0.25}`,
    `L ${width} ${height * 0.25}`,
  ].join(' ');
};

export const buildLogicAndPath = (width: number, height: number) => {
  const r = height / 2;

  return [
    `M 0 0`,
    `L ${width - r} 0`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L 0 ${height}`,
    'Z',
  ].join(' ');
};

export const buildLogicOrPath = (width: number, height: number) =>
  [
    `M 0 0`,
    `Q ${width * 0.45} ${height * 0.05} ${width * 0.7} ${height / 2}`,
    `Q ${width * 0.45} ${height * 0.95} 0 ${height}`,
    `Q ${width * 0.2} ${height * 0.5} 0 0`,
    'Z',
  ].join(' ');

export const buildStepPath = (width: number, height: number) => {
  const size = width * 0.2;

  return [
    `M 0 0`,
    `L ${width - size} 0`,
    `L ${width} ${height / 2}`,
    `L ${width - size} ${height}`,
    `L 0 ${height}`,
    `L ${size} ${height / 2}`,
    'Z',
  ].join(' ');
};
