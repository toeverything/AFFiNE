export class BlobStorageOverCapacity extends Error {
  constructor(public originError?: any) {
    super('Blob storage over capacity.');
  }
}
