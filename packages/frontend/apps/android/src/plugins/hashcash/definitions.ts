export interface HashCashPlugin {
  hash(options: {
    challenge: string;
    bits?: number;
  }): Promise<{ value: string }>;
}
