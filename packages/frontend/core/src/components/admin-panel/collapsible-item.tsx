import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useCallback, useState } from 'react';

import * as styles from './index.css';

export const CollapsibleItem = ({
  items,
  initialOpen = false,
  title,
  currentModule,
  changeModule,
}: {
  title: string;
  items: string[];
  initialOpen?: boolean;
  currentModule?: string;
  changeModule?: (module: string) => void;
}) => {
  const [open, setOpen] = useState(initialOpen);

  const handleClick = useCallback(
    (id: string, event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      event?.preventDefault();
      const targetElement = document.getElementById(id);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
      changeModule?.(title);
    },
    [changeModule, title]
  );

  return (
    <Collapsible.Root
      className={styles.outLine}
      open={open}
      onOpenChange={setOpen}
    >
      <div
        className={styles.outLineHeader}
        data-active={title === currentModule}
      >
        <Collapsible.Trigger className={styles.arrowIcon} data-open={open}>
          <ArrowDownSmallIcon />
        </Collapsible.Trigger>
        <a
          className={styles.navText}
          href={`#${title}`}
          onClick={e => handleClick(title, e)}
        >
          {title}
        </a>
      </div>

      <div className={styles.collapsibleContainer}>
        {items.map((item, index) => (
          <Collapsible.Content
            className={styles.outLineContent}
            key={index}
            onClick={() => handleClick(item)}
          >
            <a className={styles.navText} href={`#${item}`}>
              {item}
            </a>
          </Collapsible.Content>
        ))}
      </div>
    </Collapsible.Root>
  );
};
