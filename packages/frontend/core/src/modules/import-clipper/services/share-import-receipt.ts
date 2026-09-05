export const shareImportReceiptPropertyId = 'affine:share-import-receipt-v1';

export interface ShareImportReceipt {
  version: 1;
  attemptId: string;
  state: 'preparing' | 'committed';
}

export function createShareImportReceipt({
  attemptId,
  state = 'preparing',
}: Omit<ShareImportReceipt, 'version' | 'state'> &
  Pick<Partial<ShareImportReceipt>, 'state'>): ShareImportReceipt {
  return { version: 1, attemptId, state };
}

export function parseShareImportReceipt(
  value: string | null | undefined
): ShareImportReceipt | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    const receipt = parsed as Record<string, unknown>;
    const keys = Object.keys(receipt).sort();
    if (
      keys.join(',') !== 'attemptId,state,version' ||
      receipt.version !== 1 ||
      typeof receipt.attemptId !== 'string' ||
      !receipt.attemptId ||
      (receipt.state !== 'preparing' && receipt.state !== 'committed')
    ) {
      return undefined;
    }
    return receipt as unknown as ShareImportReceipt;
  } catch {
    return undefined;
  }
}

export function serializeShareImportReceipt(receipt: ShareImportReceipt) {
  return JSON.stringify(receipt);
}

export type ShareImportRecovery =
  | 'write-preparing-and-create'
  | 'create-from-preparing'
  | 'resume-preparing'
  | 'committed-replay'
  | 'import-conflict';

export function decideShareImportRecovery({
  receiptValue,
  expectedAttemptId,
  documentExists,
}: {
  receiptValue: string | undefined;
  expectedAttemptId: string;
  documentExists: boolean;
}): ShareImportRecovery {
  const receipt = parseShareImportReceipt(receiptValue);
  if (
    (receiptValue !== undefined && !receipt) ||
    (documentExists && !receipt) ||
    (receipt && receipt.attemptId !== expectedAttemptId)
  ) {
    return 'import-conflict';
  }
  if (receipt?.state === 'committed') {
    return documentExists ? 'committed-replay' : 'import-conflict';
  }
  if (!receipt) return 'write-preparing-and-create';
  return documentExists ? 'resume-preparing' : 'create-from-preparing';
}

export function shouldSynchronizeShareImport({
  isLocal,
  verification,
  allowOffline,
}: {
  isLocal: boolean;
  verification: 'confirmed' | 'missing' | 'unavailable';
  allowOffline: boolean;
}) {
  return !isLocal && verification === 'confirmed' && !allowOffline;
}
