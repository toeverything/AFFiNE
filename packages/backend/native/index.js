/** @type {import('.')} */
let binding;
try {
  binding = require('./server-native.node');
} catch {
  const fallback = './server-native.x64.node';
  binding = require(fallback);
}

module.exports = binding;
