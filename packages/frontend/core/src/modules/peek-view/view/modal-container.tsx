import * as Dialog from '@radix-ui/react-dialog';
import { useLiveData, useService } from '@toeverything/infra';
import { eases, waapi, type WAAPIAnimation } from 'animejs';
import clsx from 'clsx';
import {
  createContext,
  forwardRef,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { EditorSettingService } from '../../editor-setting';
import type { PeekViewAnimation, PeekViewMode } from '../entities/peek-view';
import * as styles from './modal-container.css';

type WAAPIAnimationParams = Parameters<typeof waapi.animate>[1];

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
  onAnimationEnd?: () => void;
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
    onAnimationEnd,
    animation = 'fadeBottom',
    mode = 'fit',
    dialogFrame = true,
  },
  ref
) {
  const [vtOpen, setVtOpen] = useState(open);
  const [animeState, setAnimeState] = useState<'idle' | 'animating'>('idle');
  const contentClipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const prevAnimeMap = useRef<Record<string, WAAPIAnimation | undefined>>({});
  const editorSettings = useService(EditorSettingService).editorSetting;
  const fullWidthLayout = useLiveData(
    editorSettings.settings$.selector(s => s.fullWidthLayout)
  );

  const animateControls = useCallback((animateIn = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    waapi.animate(controls, {
      opacity: animateIn ? [0, 1] : [1, 0],
      translateX: animateIn ? [-32, 0] : [0, -32],
      ease: eases.inOutSine,
      duration: 230,
    });
  }, []);
  const animateFade = useCallback(
    (animateIn: boolean) => {
      setAnimeState('animating');
      onAnimationStart?.();
      return new Promise<void>(resolve => {
        if (animateIn) setVtOpen(true);
        setTimeout(() => {
          const overlay = overlayRef.current;
          const contentClip = contentClipRef.current;
          if (!overlay || !contentClip) {
            resolve();
            return;
          }
          waapi.animate([overlay, contentClip], {
            opacity: animateIn ? [0, 1] : [1, 0],
            ease: eases.inOutSine,
            duration: 230,
            onComplete: () => {
              if (!animateIn) setVtOpen(false);
              setAnimeState('idle');
              onAnimationEnd?.();
              resolve();
            },
          });
        });
      });
    },
    [onAnimationEnd, onAnimationStart]
  );
  const zoomAnimate = useCallback(
    async (
      zoomIn?: boolean,
      paramsMap?: {
        overlay?: WAAPIAnimationParams;
        content?: WAAPIAnimationParams;
        contentWrapper?: WAAPIAnimationParams;
      }
    ) => {
      // if target has no bounding client rect,
      // find its parent that has bounding client rect
      let iteration = 0;
      while (
        target &&
        !target.getBoundingClientRect().width &&
        iteration < 10
      ) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        target = target.parentElement || undefined;
        iteration++;
      }

      if (!target) {
        // fallback to fade animation
        return animateFade(!!zoomIn);
      }

      return new Promise<void>(resolve => {
        const contentClip = contentClipRef.current;
        const content = contentRef.current;
        const overlay = overlayRef.current;

        if (!contentClip || !content || !target || !overlay) {
          resolve();
          setAnimeState('idle');
          onAnimationEnd?.();
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

        const overlayAnime = waapi.animate(overlay, {
          opacity: zoomIn ? [0, 1] : [1, 0],
          ease: eases.inOutSine,
          duration: 230,
          ...paramsMap?.overlay,
        });

        const contentAnime =
          paramsMap?.content &&
          waapi.animate(content, {
            ...paramsMap.content,
          });

        const contentWrapperAnime = waapi.animate(targets, {
          left: [fromRect.left, toRect.left],
          top: [fromRect.top, toRect.top],
          width: [fromRect.width, toRect.width],
          height: [fromRect.height, toRect.height],
          ease: eases.inOutSine,
          duration: 230,
          ...paramsMap?.contentWrapper,
          onComplete: (ins: WAAPIAnimation) => {
            paramsMap?.contentWrapper?.onComplete?.(ins);
            setAnimeState('idle');
            onAnimationEnd?.();
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
    [target, animateFade, onAnimationEnd]
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
    onAnimationStart?.();
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
  }, [animateControls, onAnimationStart, zoomAnimate]);
  const animateZoomOut = useCallback(() => {
    setAnimeState('animating');
    onAnimationStart?.();
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
        easing: 'ease',
      },
    })
      .then(() => setVtOpen(false))
      .catch(console.error);
  }, [animateControls, onAnimationStart, zoomAnimate]);

  const animateFadeBottom = useCallback(
    (animateIn: boolean) => {
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

          waapi.animate([overlay], {
            opacity: animateIn ? [0, 1] : [1, 0],
            ease: eases.inOutSine,
            duration: 230,
          });
          waapi.animate([contentClip], {
            opacity: animateIn ? [0, 1] : [1, 0],
            y: animateIn ? ['-2%', '0%'] : ['0%', '-2%'],
            scale: animateIn ? [0.96, 1] : [1, 0.96],
            ease: eases.cubicBezier(0.42, 0, 0.58, 1),
            duration: 230,
            onComplete: () => {
              if (!animateIn) setVtOpen(false);
              setAnimeState('idle');
              onAnimationEnd?.();
              resolve();
            },
          });
        });
      });
    },
    [onAnimationEnd]
  );

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

  useLayoutEffect(() => {
    if (animation === 'zoom') {
      open ? animateZoomIn() : animateZoomOut();
    } else if (animation === 'fadeBottom') {
      animateFadeBottom(open).catch(console.error);
    } else if (animation === 'fade') {
      animateFade(open).catch(console.error);
    } else if (animation === 'none') {
      setVtOpen(open);
    }
  }, [
    animateZoomOut,
    animation,
    open,
    target,
    animateZoomIn,
    animateFade,
    animateFadeBottom,
  ]);

  return (
    <PeekViewContext.Provider value={emptyContext}>
      <Dialog.Root modal open={vtOpen} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <PeekViewModalOverlay
            ref={overlayRef}
            className={styles.modalOverlay}
            data-anime-state={animeState}
          />
          <div
            ref={ref}
            data-mode={mode}
            data-peek-view-wrapper
            className={styles.modalContentWrapper}
            data-mobile={BUILD_CONFIG.isMobileEdition ? '' : undefined}
          >
            <div
              data-anime-state={animeState}
              data-full-width-layout={fullWidthLayout}
              data-mobile={BUILD_CONFIG.isMobileEdition}
              ref={contentClipRef}
              className={styles.modalContentContainer}
            >
              <div className={styles.modalContentClip}>
                <Dialog.Content
                  {...contentOptions}
                  // mute the radix-ui warning
                  aria-describedby={undefined}
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
