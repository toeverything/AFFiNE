/* eslint-disable */
// @ts-nocheck

Promise.withResolvers ??= function withResolvers() {
  var a,
    b,
    c = new this(function (resolve, reject) {
      a = resolve;
      b = reject;
    });
  return { resolve: a, reject: b, promise: c };
};
