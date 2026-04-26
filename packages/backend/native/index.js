/** @type {import('.')} */
let binding;
try {
  binding = require('./server-native.node');
} catch {
  binding = require('./server-native.x64.node');
}

module.exports = binding;
