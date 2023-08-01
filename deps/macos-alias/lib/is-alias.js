var fs = require('fs');

module.exports = function isAlias(path) {
  var read;
  var fd = fs.openSync(path, 'r');

  try {
    read = Buffer.alloc(16);
    fs.readSync(fd, read, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  var expected = '626f6f6b000000006d61726b00000000';
  var actual = read.toString('hex');

  return actual === expected;
};
