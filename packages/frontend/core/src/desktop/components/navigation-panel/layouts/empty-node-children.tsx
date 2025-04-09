import clsx from 'clsx';
import { forwardRef, type HTMLAttributes, type Ref } from 'react';

import { emptyChildren } from './empty-node-children.css';

export const EmptyNodeChildren = forwardRef(function EmptyNodeChildren(
  { children, className, ...attrs }: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>
) {
  return (
    <div className={clsx(emptyChildren, className)} ref={ref} {...attrs}>
      {children}
    </div>
  );
});
