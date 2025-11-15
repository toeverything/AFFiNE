/** @type {import('.')} */
let binding;
try {
  binding = require('./server-native.node');
} catch {
  binding =
    process.arch === 'arm64'
      ? require('./server-native.arm64.node')
      : process.arch === 'arm'
        ? require('./server-native.armv7.node')
        : require('./server-native.x64.node');
}

module.exports = binding;
