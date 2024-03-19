export class BucketService {
  private readonly bucket = new Map<string, string>();

  get(key: string) {
    return this.bucket.get(key);
  }

  set(key: string, value: string) {
    this.bucket.set(key, value);
  }

  delete(key: string) {
    this.bucket.delete(key);
  }
}
