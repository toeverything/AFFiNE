import type { BlobStorage } from '@blocksuite/store';

const predefinedStaticFiles = [
  'v2yF7lY2L5rtorTtTmYFsoMb9dBPKs5M1y9cUKxcI1M=',
  'nSEEkYxrThpZfLoPNOzMp6HWekvutAIYmADElDe1J6I=',
  'CBWoKrhSDndjBJzscQKENRqiXOOZnzIA5qyiCoy4-A0=',
  'uvpOG9DrldeqIGNaqfwjFdMw_CcfXKfiEjYf7RXdeL0=',
  'D7g-4LMqOsVWBNOD-_kGgCOvJEoc8rcpYbkfDlF2u5U=',
  '4HXJrnBZGaGPFpowNawNog0aMg3dgoVaAnNqEMeUxq0=',
  'rY96Bunn-69CnNe5X_e5CJLwgCJnN6rcbUisecs8kkQ=',
  'fb0SNPtMpQlzBQ90_PB7vCu34WpiSUJbNKocFkL2vIo=',
  'k07JiWnb-S7qgd9gDQNgqo-LYMe03RX8fR0TXQ-SpG4=',
  'i39ZQ24NlUfWI0MhkbtvHTzGnWMVdr-aC2aOjvHPVg4=',
  '0hjYqQd8SvwHT2gPds7qFw8W6qIEGVbZvG45uzoYjUU=',
  'qezoK6du9n3PF4dl4aq5r7LeXz_sV3xOVpFzVVgjNsE=',
  'sNVNYDBzUDN2J9OFVJdLJlryBLzRZBLl-4MTNoPF1tA=',
  'Bd5F0WRI0fLh8RK1al9PawPVT3jv7VwBrqiiBEtdV-g=',
  '029uztLz2CzJezK7UUhrbGiWUdZ0J7NVs_qR6RDsvb8=',
  '5Cfem_137WmzR35ZeIC76oTkq5SQt-eHlZwJiLy0hgU=',
];

export const createStaticStorage = (): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        if (key.startsWith('/static/')) {
          const response = await fetch(key);
          if (response.ok) {
            return response.blob();
          }
        } else if (predefinedStaticFiles.includes(key)) {
          const response = await fetch(`/static/${key}.png`);
          if (response.ok) {
            return response.blob();
          }
        }
        return null;
      },
      set: async (key: string) => {
        // ignore
        return key;
      },
      delete: async () => {
        // ignore
      },
      list: async () => {
        // ignore
        return [];
      },
    },
  };
};
