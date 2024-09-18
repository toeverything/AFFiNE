import * as Dialog from '@radix-ui/react-dialog';
import { useLiveData, useService } from '@toeverything/infra';
import anime, { type AnimeInstance, type AnimeParams } from 'animejs';
import clsx from 'clsx';
import {
  createContext,
  forwardRef,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { EditorSettingService } from '../../editor-settting';
import type { PeekViewAnimation, PeekViewMode } from '../entities/peek-view';
import * as styles from './modal-container.css';

const contentOptions: Dialog.DialogContentProps = {
  ['data-testid' as string]: 'peek-view-modal',
  onPointerDownOutside: e => {
    const el = e.target as HTMLElement;
    if (
      el.closest('[data-peek-view-wrapper]') ||
      // workaround for slash menu click outside issue
      el.closest('affine-slash-menu')
    ) {
      e.preventDefault();
    }
  },
  onEscapeKeyDown: e => {
    // prevent closing the modal when pressing escape key by default
    // this is because radix-ui register the escape key event on the document using capture, which is not possible to prevent in blocksuite
    e.preventDefault();
  },
};

// a dummy context to let elements know they are inside a peek view
export const PeekViewContext = createContext<Record<string, never> | null>(
  null
);

const emptyContext = {};

export const useInsidePeekView = () => {
  const context = useContext(PeekViewContext);
  return !!context;
};

export type PeekViewModalContainerProps = PropsWithChildren<{
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target?: HTMLElement;
  controls?: React.ReactNode;
  onAnimationStart?: () => void;
  onAnimateEnd?: () => void;
  mode?: PeekViewMode;
  animation?: PeekViewAnimation;
  testId?: string;
  /** Whether to apply shadow & bg */
  dialogFrame?: boolean;
}>;

const PeekViewModalOverlay = 'div';

export const PeekViewModalContainer = forwardRef<
  HTMLDivElement,
  PeekViewModalContainerProps
>(function PeekViewModalContainer(
  {
    onOpenChange,
    open,
    target,
    controls,
    children,
    onAnimationStart,
    onAnimateEnd,
    animation = 'zoom',
    mode = 'fit',
    dialogFrame = true,
  },
  ref
) {
  const [vtOpen, setVtOpen] = useState(open);
  const [animeState, setAnimeState] = useState<'idle' | 'ready' | 'animating'>(
    'idle'
  );
  const contentClipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const prevAnimeMap = useRef<Record<string, AnimeInstance | undefined>>({});
  const editorSettings = useService(EditorSettingService).editorSetting;
  const fullWidthLayout = useLiveData(
    editorSettings.settings$.selector(s => s.fullWidthLayout)
  );

  const animateControls = useCallback((animateIn = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    anime({
      targets: controls,
      opacity: animateIn ? [0, 1] : [1, 0],
      translateX: animateIn ? [-32, 0] : [0, -32],
      easing: 'easeOutQuad',
      duration: 230,
    });
  }, []);
  const zoomAnimate = useCallback(
    async (
      zoomIn?: boolean,
      paramsMap?: {
        overlay?: AnimeParams;
        content?: AnimeParams;
        contentWrapper?: AnimeParams;
      }
    ) => {
      return new Promise<void>(resolve => {
        const contentClip = contentClipRef.current;
        const content = contentRef.current;
        const overlay = overlayRef.current;

        if (!contentClip || !content || !target || !overlay) {
          resolve();
          return;
        }
        const targets = contentClip;
        const lockSizeEl = content;

        const from = zoomIn ? target : contentClip;
        const to = zoomIn ? contentClip : target;

        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();

        targets.style.position = 'fixed';
        targets.style.opacity = '1';
        lockSizeEl.style.width = zoomIn
          ? `${toRect.width}px`
          : `${fromRect.width}px`;
        lockSizeEl.style.height = zoomIn
          ? `${toRect.height}px`
          : `${fromRect.height}px`;
        lockSizeEl.style.overflow = 'hidden';
        overlay.style.pointerEvents = 'none';

        prevAnimeMap.current.overlay?.pause();
        prevAnimeMap.current.content?.pause();
        prevAnimeMap.current.contentWrapper?.pause();

        const overlayAnime = anime({
          targets: overlay,
          opacity: zoomIn ? [0, 1] : [1, 0],
          easing: 'easeOutQuad',
          duration: 230,
          ...paramsMap?.overlay,
        });

        const contentAnime =
          paramsMap?.content &&
          anime({
            targets: content,
            ...paramsMap.content,
          });

        const contentWrapperAnime = anime({
          targets,
          left: [fromRect.left, toRect.left],
          top: [fromRect.top, toRect.top],
          width: [fromRect.width, toRect.width],
          height: [fromRect.height, toRect.height],
          easing: 'easeOutQuad',
          duration: 230,
          ...paramsMap?.contentWrapper,
          complete: (ins: AnimeInstance) => {
            paramsMap?.contentWrapper?.complete?.(ins);
            setAnimeState('idle');
            overlay.style.pointerEvents = '';
            if (zoomIn) {
              Object.assign(targets.style, {
                position: '',
                left: '',
                top: '',
                width: '',
                height: '',
              });
              Object.assign(lockSizeEl.style, {
                width: '100%',
                height: '100%',
                overflow: '',
              });
            }
            resolve();
          },
        });

        prevAnimeMap.current = {
          overlay: overlayAnime,
          content: contentAnime,
          contentWrapper: contentWrapperAnime,
        };
      });
    },
    [target]
  );
  /**
   * ### Animation timeline:
   * ```plain
   *                                      150ms
   *                                   ⎮ - - - - ⎮
   * dialog:     +--------400ms--------+
   * controls:               +-------230ms-------+
   *             ⎮ - - - - - ⎮
   *            controls delay =
   *             400 - 230 + 150
   * ```
   */
  const animateZoomIn = useCallback(() => {
    setAnimeState('animating');
    setVtOpen(true);
    setTimeout(() => {
      zoomAnimate(true, {
        contentWrapper: {
          opacity: [0.5, 1],
          easing: 'cubicBezier(.46,.36,0,1)',
          duration: 400,
        },
        content: {
          opacity: [0, 1],
          duration: 100,
        },
      }).catch(console.error);
    }, 0);
    setTimeout(
      () => animateControls(true),
      // controls delay: to make sure the time interval for animations of dialog and controls is 150ms.
      400 - 230 + 150
    );
  }, [animateControls, zoomAnimate]);
  const animateZoomOut = useCallback(() => {
    setAnimeState('animating');
    animateControls(false);
    zoomAnimate(false, {
      contentWrapper: {
        easing: 'cubicBezier(.57,.25,.76,.44)',
        opacity: [1, 0.5],
        duration: 180,
      },
      content: {
        opacity: [1, 0],
        duration: 180,
        easing: 'easeOutQuad',
      },
    })
      .then(() => setVtOpen(false))
      .catch(console.error);
  }, [animateControls, zoomAnimate]);

  const animateFade = useCallback((animateIn: boolean) => {
    setAnimeState('animating');
    return new Promise<void>(resolve => {
      if (animateIn) setVtOpen(true);
      setTimeout(() => {
        const overlay = overlayRef.current;
        const contentClip = contentClipRef.current;
        if (!overlay || !contentClip) {
          resolve();
          return;
        }
        anime({
          targets: [overlay, contentClip],
          opacity: animateIn ? [0, 1] : [1, 0],
          easing: 'easeOutQuad',
          duration: 230,
          complete: () => {
            if (!animateIn) setVtOpen(false);
            setAnimeState('idle');
            resolve();
          },
        });
      });
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onOpenChange]);

  useEffect(() => {
    if (animation === 'zoom') {
      open ? animateZoomIn() : animateZoomOut();
    } else if (animation === 'fade') {
      animateFade(open).catch(console.error);
    } else if (animation === 'none') {
      setVtOpen(open);
    }
  }, [animateZoomOut, animation, open, target, animateZoomIn, animateFade]);

  return (
    <PeekViewContext.Provider value={emptyContext}>
      <Dialog.Root modal open={vtOpen} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <PeekViewModalOverlay
            ref={overlayRef}
            className={styles.modalOverlay}
            onAnimationStart={onAnimationStart}
            onAnimationEnd={onAnimateEnd}
            data-anime-state={animeState}
          />
          <div
            ref={ref}
            data-mode={mode}
            data-peek-view-wrapper
            className={styles.modalContentWrapper}
          >
            <div
              data-anime-state={animeState}
              data-full-width-layout={fullWidthLayout}
              ref={contentClipRef}
              className={styles.modalContentContainer}
            >
              <div className={styles.modalContentClip}>
                <Dialog.Content
                  {...contentOptions}
                  className={clsx({
                    [styles.modalContent]: true,
                    [styles.dialog]: dialogFrame,
                  })}
                >
                  <Dialog.Title style={{ display: 'none' }} />
                  <div style={{ height: '100%' }} ref={contentRef}>
                    {children}
                  </div>
                </Dialog.Content>
              </div>
              {controls ? (
                <div
                  // initially hide the controls to prevent flickering for zoom animation
                  style={{ opacity: animation === 'zoom' ? 0 : undefined }}
                  ref={controlsRef}
                  className={styles.modalControls}
                >
                  {controls}
                </div>
              ) : null}
            </div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </PeekViewContext.Provider>
  );
});
