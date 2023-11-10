import type { BlobStorage } from '@blocksuite/store';

import { bufferToBlob } from './util';

export const predefinedStaticFiles = [
  '029uztLz2CzJezK7UUhrbGiWUdZ0J7NVs_qR6RDsvb8=',
  '047ebf2c9a5c7c9d8521c2ea5e6140ff7732ef9e28a9f944e9bf3ca4',
  '0hjYqQd8SvwHT2gPds7qFw8W6qIEGVbZvG45uzoYjUU=',
  '1326bc48553a572c6756d9ee1b30a0dfdda26222fc2d2c872b14e609',
  '27f983d0765289c19d10ee0b51c00c3c7665236a1a82406370d46e0a',
  '28516717d63e469cd98729ff46be6595711898bab3dc43302319a987',
  '4HXJrnBZGaGPFpowNawNog0aMg3dgoVaAnNqEMeUxq0=',
  '5Cfem_137WmzR35ZeIC76oTkq5SQt-eHlZwJiLy0hgU=',
  '6aa785ee927547ce9dd9d7b43e01eac948337fe57571443e87bc3a60',
  '8oj6ym4HlTcshT40Zn6D5DeOgaVCSOOXJvT_EyiqUw8=',
  '9288be57321c8772d04e05dbb69a22742372b3534442607a2d6a9998',
  '9vXwWGEX5W9v5pzwpu0eK4pf22DZ_sCloO0zCH1aVQ4=',
  'Bd5F0WRI0fLh8RK1al9PawPVT3jv7VwBrqiiBEtdV-g=',
  'CBWoKrhSDndjBJzscQKENRqiXOOZnzIA5qyiCoy4-A0=',
  'D7g-4LMqOsVWBNOD-_kGgCOvJEoc8rcpYbkfDlF2u5U=',
  'Vqc8rxFbGyc5L1QeE_Zr10XEcIai_0Xw4Qv6d3ldRPE=',
  'VuXYyM9JUv1Fv_qjg1v5Go4Zksz0r4NXFeh3Na7JkIc=',
  'bfXllFddegV9vvxPcSWnOtm-_tuzXm-0OQ59z9Su1zA=',
  'c820edeeba50006b531883903f5bb0b96bf523c9a6b3ce5868f03db5',
  'cw9XjQ-pCeSW7LKMzVREGHeCPTXWYbtE-QbZLEY3RrI=',
  'e93536e1be97e3b5206d43bf0793fdef24e60044d174f0abdefebe08',
  'f9yKnlNMgKhF-CxOgHBsXkxfViCCkC6KwTv6Uj2Fcjw=',
  'fb0SNPtMpQlzBQ90_PB7vCu34WpiSUJbNKocFkL2vIo=',
  'gZLmSgmwumNdgf0eIfOSW44emctrLyFUaZapbk8eZ6s=',
  'i39ZQ24NlUfWI0MhkbtvHTzGnWMVdr-aC2aOjvHPVg4=',
  'k07JiWnb-S7qgd9gDQNgqo-LYMe03RX8fR0TXQ-SpG4=',
  'nSEEkYxrThpZfLoPNOzMp6HWekvutAIYmADElDe1J6I=',
  'pIqdA3pM1la1gKzxOmAcpLmTh3yXBrL9mGTz_hGj5xE=',
  'qezoK6du9n3PF4dl4aq5r7LeXz_sV3xOVpFzVVgjNsE=',
  'rY96Bunn-69CnNe5X_e5CJLwgCJnN6rcbUisecs8kkQ=',
  'sNVNYDBzUDN2J9OFVJdLJlryBLzRZBLl-4MTNoPF1tA=',
  'uvpOG9DrldeqIGNaqfwjFdMw_CcfXKfiEjYf7RXdeL0=',
  'v2yF7lY2L5rtorTtTmYFsoMb9dBPKs5M1y9cUKxcI1M=',
];

export const createStaticStorage = (): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        const isStaticResource =
          predefinedStaticFiles.includes(key) || key.startsWith('/static/');

        if (!isStaticResource) {
          return null;
        }

        const path = key.startsWith('/static/') ? key : `/static/${key}`;
        const response = await fetch(path);

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          return bufferToBlob(buffer);
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
