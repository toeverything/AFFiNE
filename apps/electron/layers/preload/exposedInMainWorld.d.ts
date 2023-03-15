interface Window {
  readonly yerba: { version: number };
  /**
   * Safe expose node.js API
   * @example
   * window.nodeCrypto('data')
   */
  readonly nodeCrypto: {
    sha256sum: (data: import('crypto').BinaryLike) => string;
  };
}
