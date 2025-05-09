import { toNumberedList } from '@blocksuite/affine-shared/utils';
import type { Command, EditorHost } from '@blocksuite/std';

export const convertToNumberedListCommand: Command<
  {
    id: string;
    order: number; // This parameter may not correspond to the final order.
    stopCapturing?: boolean;
  },
  {
    listConvertedId: string;
  }
> = (ctx, next) => {
  const { std, id, order, stopCapturing = true } = ctx;
  const host = std.host as EditorHost;
  const doc = host.store;

  const model = doc.getBlock(id)?.model;
  if (!model || !model.text) return;

  if (stopCapturing) host.store.captureSync();

  const listConvertedId = toNumberedList(std, model, order);

  if (!listConvertedId) return;

  return next({ listConvertedId });
};
