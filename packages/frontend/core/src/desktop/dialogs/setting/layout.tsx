import { IconButton } from '@affine/component';
import { ArrowUpSmallIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  type HtmlHTMLAttributes,
  type ReactNode,
  useCallback,
  useState,
} from 'react';

import * as styles from './layout.css';

interface CollapsibleWrapperProps extends Omit<
  HtmlHTMLAttributes<HTMLDivElement>,
  'title'
> {
  title?: ReactNode;
  caption?: ReactNode;
}

export const CollapsibleWrapper = (props: CollapsibleWrapperProps) => {
  const { title, caption, children } = props;
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen(prev => !prev), []);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <section className={styles.collapsibleHeader}>
        <div className={styles.collapsibleHeaderContent}>
          <div className={styles.collapsibleHeaderTitle}>{title}</div>
          <div className={styles.collapsibleHeaderCaption}>{caption}</div>
        </div>
        <IconButton onClick={toggle} size="20">
          <ArrowUpSmallIcon
            style={{
              transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.23s ease',
            }}
          />
        </IconButton>
      </section>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
};
