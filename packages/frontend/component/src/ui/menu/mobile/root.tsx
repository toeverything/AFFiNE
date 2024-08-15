import { ArrowLeftSmallIcon } from '@blocksuite/icons/rc';
import { Slot } from '@radix-ui/react-slot';
import clsx from 'clsx';
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { observeResize } from '../../../utils';
import { Button } from '../../button';
import { Modal, type ModalProps } from '../../modal';
import type { MenuProps } from '../menu.types';
import type { SubMenuContent } from './context';
import { MobileMenuContext } from './context';
import * as styles from './styles.css';
import { MobileMenuSubRaw } from './sub';

export const MobileMenu = ({
  children,
  items,
  noPortal,
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
  const sliderRef = useRef<HTMLDivElement>(null);
  const activeIndex = subMenus.length;

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

  const Wrapper = noPortal ? Fragment : Modal;
  const wrapperProps = noPortal
    ? {}
    : ({
        open: finalOpen,
        onOpenChange,
        width: '100%',
        animation: 'slideBottom',
        withoutCloseButton: true,
        contentOptions: {
          className: clsx(className, styles.mobileMenuModal),
          ...otherContentOptions,
        },
        contentWrapperStyle: {
          alignItems: 'end',
          paddingBottom: 10,
        },
      } satisfies ModalProps);

  const onItemClick = useCallback((e: any) => {
    e.preventDefault();
    setOpen(prev => !prev);
  }, []);

  // dynamic height for slider
  useEffect(() => {
    if (!finalOpen) return;
    let observer: () => void;
    const t = setTimeout(() => {
      const slider = sliderRef.current;
      if (!slider) return;

      const active = slider.querySelector(
        `.${styles.menuContent}[data-index="${activeIndex}"]`
      );
      if (!active) return;

      // for the situation that content is loaded asynchronously
      observer = observeResize(active, entry => {
        setSliderHeight(entry.borderBoxSize[0].blockSize);
      });
    }, 0);

    return () => {
      clearTimeout(t);
      observer?.();
    };
  }, [activeIndex, finalOpen]);

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
        <Wrapper {...wrapperProps}>
          <div
            ref={sliderRef}
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
                  Back
                </Button>

                {sub.items}
              </div>
            ))}
          </div>
        </Wrapper>
      </MobileMenuContext.Provider>
    </>
  );
};
