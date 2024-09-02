import { useI18n } from '@affine/i18n';
import { ArrowLeftSmallIcon } from '@blocksuite/icons/rc';
import { Slot } from '@radix-ui/react-slot';
import clsx from 'clsx';
import { useCallback, useContext, useMemo, useState } from 'react';

import { observeResize } from '../../../utils';
import { Button } from '../../button';
import { Modal } from '../../modal';
import type { MenuProps } from '../menu.types';
import type { SubMenuContent } from './context';
import { MobileMenuContext } from './context';
import * as styles from './styles.css';
import { MobileMenuSubRaw } from './sub';

export const MobileMenu = ({
  children,
  items,
  contentOptions: {
    className,
    onPointerDownOutside,
    // ignore the following props
    sideOffset: _sideOffset,
    side: _side,
    align: _align,

    ...otherContentOptions
  } = {},
  rootOptions,
}: MenuProps) => {
  const [subMenus, setSubMenus] = useState<SubMenuContent[]>([]);
  const [open, setOpen] = useState(false);
  const [sliderHeight, setSliderHeight] = useState(0);
  const { setOpen: pSetOpen } = useContext(MobileMenuContext);
  const finalOpen = rootOptions?.open ?? open;
  const activeIndex = subMenus.length;

  // dynamic height for slider
  const onSliderRef = useMemo(() => {
    let unsub: (() => void) | null = null;

    return (sliderDiv: HTMLDivElement | null) => {
      unsub?.();

      if (!sliderDiv || !finalOpen) return;

      const active = sliderDiv.querySelector(
        `.${styles.menuContent}[data-index="${activeIndex}"]`
      );
      if (!active) return;

      // for the situation that content is loaded asynchronously
      unsub = observeResize(active, entry => {
        setSliderHeight(entry.borderBoxSize[0].blockSize);
      });
    };
  }, [activeIndex, finalOpen]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // a workaround to hack the onPointerDownOutside event
        onPointerDownOutside?.({} as any);
        setSubMenus([]);
      }
      setOpen(open);
      rootOptions?.onOpenChange?.(open);
    },
    [onPointerDownOutside, rootOptions]
  );

  const onItemClick = useCallback(
    (e: any) => {
      e.preventDefault();
      onOpenChange(!open);
    },
    [onOpenChange, open]
  );

  const t = useI18n();

  /**
   * For cascading menu usage
   * ```tsx
   * <Menu
   *  items={
   *    <Menu>Click me</Menu>
   *  }
   * >
   *  Root
   * </Menu>
   * ```
   */
  if (pSetOpen) {
    return <MobileMenuSubRaw items={items}>{children}</MobileMenuSubRaw>;
  }

  return (
    <>
      <Slot onClick={onItemClick}>{children}</Slot>
      <MobileMenuContext.Provider
        value={{ subMenus, setSubMenus, setOpen: onOpenChange }}
      >
        <Modal
          open={finalOpen}
          onOpenChange={onOpenChange}
          width="100%"
          animation="slideBottom"
          withoutCloseButton={true}
          contentOptions={{
            className: clsx(className, styles.mobileMenuModal),
            ...otherContentOptions,
          }}
          contentWrapperStyle={{
            alignItems: 'end',
            paddingBottom: 10,
          }}
        >
          <div
            ref={onSliderRef}
            className={styles.slider}
            style={{
              transform: `translateX(-${100 * activeIndex}%)`,
              height: sliderHeight,
            }}
          >
            <div data-index={0} className={styles.menuContent}>
              {items}
            </div>
            {subMenus.map((sub, index) => (
              <div
                key={index}
                data-index={index + 1}
                className={styles.menuContent}
              >
                <Button
                  variant="plain"
                  className={styles.backButton}
                  prefix={<ArrowLeftSmallIcon />}
                  onClick={() => setSubMenus(prev => prev.slice(0, index))}
                  prefixStyle={{ width: 20, height: 20 }}
                >
                  {t['com.affine.backButton']()}
                </Button>

                {sub.items}
              </div>
            ))}
          </div>
        </Modal>
      </MobileMenuContext.Provider>
    </>
  );
};
