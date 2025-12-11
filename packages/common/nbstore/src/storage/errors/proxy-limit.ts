export class ProxyLimitError extends Error {
  constructor(public originError?: any) {
    super('Upload stopped by network proxy: file size exceeds the set limit.');
  }
}
