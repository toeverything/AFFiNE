import { DataCenter } from '@affine/datacenter';

declare global {
  interface Window {
    CLIENT_APP?: boolean;
    __editoVersion?: string;
  }

  // eslint-disable-next-line no-var
  var dc: DataCenter | undefined;
}

export {};
