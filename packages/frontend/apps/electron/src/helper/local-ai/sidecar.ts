export const buildSidecarArgs = ({
  modelPath,
  port,
}: {
  modelPath: string;
  port: number;
}) => [
  '--model',
  modelPath,
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--ctx-size',
  '8192',
  '--n-gpu-layers',
  '0',
  '--device',
  'none',
  '--no-warmup',
];
