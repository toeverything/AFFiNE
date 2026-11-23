import { z } from 'zod';

const currentViewListSchema = z.array(
  z.object({
    blockId: z.string(),
    viewId: z.string(),
  })
);
const maxLength = 20;
const currentViewListKey = 'blocksuite:databaseBlock:view:currentViewList';
const storage = globalThis.sessionStorage;
const createCurrentViewStorage = () => {
  const getList = () => {
    const string = storage?.getItem(currentViewListKey);
    if (!string) {
      return;
    }
    try {
      const result = currentViewListSchema.safeParse(JSON.parse(string));
      if (result.success) {
        return result.data;
      }
    } catch {
      // do nothing
    }
    return;
  };
  const saveList = () => {
    storage.setItem(currentViewListKey, JSON.stringify(list));
  };

  const list = getList() ?? [];

  return {
    getCurrentView: (blockId: string) => {
      return list.find(item => item.blockId === blockId)?.viewId;
    },
    setCurrentView: (blockId: string, viewId: string) => {
      const configIndex = list.findIndex(item => item.blockId === blockId);
      if (configIndex >= 0) {
        list.splice(configIndex, 1);
      }
      if (list.length >= maxLength) {
        list.pop();
      }
      list.unshift({ blockId, viewId });
      saveList();
    },
  };
};

export const currentViewStorage = createCurrentViewStorage();
