import { cloneElement, FC, PropsWithChildren, ReactNode } from 'react';

export const ProviderComposer: FC<
  PropsWithChildren<{
    contexts: any;
  }>
> = ({ contexts, children }) =>
  contexts.reduceRight(
    (kids: ReactNode, parent: any) =>
      cloneElement(parent, {
        children: kids,
      }),
    children
  );
