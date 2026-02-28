/** @type {import('.')} */
let binding;
try {
  binding = require('./server-native.node');
} catch (e) {
  try {
    if (process.arch === 'arm64') {
      binding = require('./server-native.arm64.node');
    } else if (process.arch === 'arm') {
      binding = require('./server-native.armv7.node');
    } else {
      binding = require('./server-native.x64.node');
    }
  } catch (err) {
    // Native binary not available in this environment — fall back to noop stub
    binding = {};
  }
}

module.exports = binding;
