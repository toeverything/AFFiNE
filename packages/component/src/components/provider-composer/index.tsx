import type { ReactNode } from 'react';
import { cloneElement } from 'react';

interface ProviderComposerProps {
  contexts: any;
  children: ReactNode;
}

export const ProviderComposer = ({
  contexts,
  children,
}: ProviderComposerProps) =>
  contexts.reduceRight(
    (kids: ReactNode, parent: any) =>
      cloneElement(parent, {
        children: kids,
      }),
    children
  );
