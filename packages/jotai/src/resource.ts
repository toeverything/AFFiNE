import { atom } from 'jotai';

export const lottieAtom = atom(async () =>
  import('lottie-web').then(m => m.default)
);

function unimplemented(..._: any[]): any {
  throw new Error('unimplemented');
}

type ResourceContext = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  requestUser: {
    id: string;
    name: string;
  } | null;
};

export const resourceContextAtom = atom<ResourceContext>({
  fetch: unimplemented,
  requestUser: null,
});
