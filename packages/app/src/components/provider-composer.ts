import { cloneElement, FC, PropsWithChildren, ReactNode } from 'react';

export const ProviderComposer: FC<
  PropsWithChildren<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contexts: any;
  }>
> = ({ contexts, children }) =>
  contexts.reduceRight(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kids: ReactNode, parent: any) =>
      cloneElement(parent, {
        children: kids,
      }),
    children
  );

export default ProviderComposer;
