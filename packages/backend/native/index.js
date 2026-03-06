/** @type {import('.')} */
let binding;
const errors = [];
const candidates = [
  './server-native.node',
  process.arch === 'arm64'
    ? './server-native.arm64.node'
    : process.arch === 'arm'
      ? './server-native.armv7.node'
      : './server-native.x64.node',
];

for (const file of candidates) {
  try {
    binding = require(file);
    break;
  } catch (error) {
    errors.push({ file, error });
  }
}

if (!binding) {
  const details = errors
    .map(({ file, error }) => {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      return `- ${file}: ${message}`;
    })
    .join('\n');

  throw new Error(
    [
      'Failed to load @affine/server-native binary.',
      'Tried these files:',
      details,
      '',
      'Build it with:',
      '  yarn affine @affine/server-native build',
    ].join('\n')
  );
}

module.exports = binding;
