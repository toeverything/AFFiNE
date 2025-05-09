export class OverCapacityError extends Error {
  constructor(public originError?: any) {
    super('Storage over capacity.');
  }
}
