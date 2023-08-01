function unimplemented() {
  throw new Error('Not expected to be called');
}

exports.create = unimplemented;
exports.encode = unimplemented;
exports.decode = unimplemented;
exports.isAlias = unimplemented;
