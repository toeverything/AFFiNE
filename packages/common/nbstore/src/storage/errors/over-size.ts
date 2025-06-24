export class OverSizeError extends Error {
  constructor(limit: string | null) {
    const formattedLimit = limit ? `${limit} ` : '';
    super(`File size exceeds the ${formattedLimit}limit.`);
  }
}
