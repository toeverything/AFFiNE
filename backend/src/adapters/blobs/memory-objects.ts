import type { BlobObjectStore } from '../../domain/ports.js';

export class MemoryBlobObjects implements BlobObjectStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(objectKey: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(objectKey, Uint8Array.from(bytes));
  }

  async get(objectKey: string): Promise<Uint8Array | null> {
    const value = this.objects.get(objectKey);
    return value ? Uint8Array.from(value) : null;
  }

  async delete(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }

  async close(): Promise<void> {}
}
