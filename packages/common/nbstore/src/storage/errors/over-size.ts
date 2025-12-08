export class OverSizeError extends Error {
  constructor(limit: string | null, message?: string) {
    if (message) {
      super(message);
    } else {
      const formattedLimit = limit ? `${limit} ` : '';
      super(`File size exceeds the ${formattedLimit}limit.`);
    }
  }
}
