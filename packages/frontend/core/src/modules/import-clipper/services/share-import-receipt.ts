export const shareImportReceiptPropertyId = 'affine:share-import-receipt-v1';

export interface ShareImportReceipt {
  version: 1;
  documentId: string;
  importAttemptId: string;
  status: 'preparing' | 'committed';
}

export function createShareImportReceipt({
  documentId,
  importAttemptId,
  status = 'preparing',
}: Omit<ShareImportReceipt, 'version' | 'status'> &
  Pick<Partial<ShareImportReceipt>, 'status'>): ShareImportReceipt {
  return { version: 1, documentId, importAttemptId, status };
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
      keys.join(',') !== 'documentId,importAttemptId,status,version' ||
      receipt.version !== 1 ||
      typeof receipt.documentId !== 'string' ||
      !receipt.documentId ||
      typeof receipt.importAttemptId !== 'string' ||
      !receipt.importAttemptId ||
      (receipt.status !== 'preparing' && receipt.status !== 'committed')
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
  documentId,
  importAttemptId,
  documentExists,
}: {
  receiptValue: string | undefined;
  documentId: string;
  importAttemptId: string;
  documentExists: boolean;
}): ShareImportRecovery {
  const receipt = parseShareImportReceipt(receiptValue);
  if (
    (receiptValue !== undefined && !receipt) ||
    (documentExists && !receipt) ||
    (receipt &&
      (receipt.documentId !== documentId ||
        receipt.importAttemptId !== importAttemptId))
  ) {
    return 'import-conflict';
  }
  if (receipt?.status === 'committed') {
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
