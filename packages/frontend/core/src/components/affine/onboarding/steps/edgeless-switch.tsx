import { Button } from '@affine/component';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import Logo from '../assets/logo';
import { OnboardingBlock } from '../switch-widgets/block';
import { EdgelessSwitchButtons } from '../switch-widgets/switch';
import { ToolbarSVG } from '../switch-widgets/toolbar';
import type {
  ArticleOption,
  EdgelessSwitchMode,
  EdgelessSwitchState,
} from '../types';
import * as styles from './edgeless-switch.css';

interface EdgelessSwitchProps {
  article: ArticleOption;
  onBack?: () => void;
  onNext?: () => void;
}

const offsetXRanges = [-2000, 2000];
const offsetYRanges = [-2000, 2000];
const scaleRange = [0.2, 2];

const defaultState: EdgelessSwitchState = {
  scale: 0.5,
  offsetX: 0,
  offsetY: 0,
};

export const EdgelessSwitch = ({
  article,
  onBack,
  onNext,
}: EdgelessSwitchProps) => {
  // const windowRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mouseDownRef = useRef(false);
  const prevStateRef = useRef<EdgelessSwitchState | null>(
    article.initState ?? null
  );
  const enableScrollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const turnOffScalingRef = useRef<() => void>(() => {});

  const [scrollable, setScrollable] = useState(false);
  const [mode, setMode] = useState<EdgelessSwitchMode>('page');
  const [state, setState] = useState<EdgelessSwitchState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const onSwitchToPageMode = useCallback(() => setMode('page'), []);
  const onSwitchToEdgelessMode = useCallback(() => setMode('edgeless'), []);
  const toggleGrabbing = useCallback((v: boolean) => {
    if (!docRef.current) return;
    docRef.current.classList.toggle('grabbing', v);
  }, []);
  const turnOnScaling = useCallback(() => {
    if (!docRef.current) return;
    docRef.current.classList.add('scaling');
  }, []);

  const enableScrollWithDelay = useCallback(() => {
    return new Promise<any>(resolve => {
      enableScrollTimerRef.current = setTimeout(() => {
        setScrollable(true);
        resolve(true);
      }, 500);
    });
  }, []);
  const disableScroll = useCallback(() => {
    if (enableScrollTimerRef.current)
      clearTimeout(enableScrollTimerRef.current);
    setScrollable(false);
  }, []);
  const setStateAndSave = useCallback((state: EdgelessSwitchState) => {
    setState(state);
    prevStateRef.current = state;
  }, []);
  const onNextClick = useCallback(() => {
    if (mode === 'page') setMode('edgeless');
    else if (mode === 'edgeless') setMode('well-done');
    else onNext?.();
  }, [mode, onNext]);

  useEffect(() => {
    turnOffScalingRef.current = debounce(() => {
      if (!docRef.current) return;
      docRef.current.classList.remove('scaling');
    }, 100);
  }, []);

  useEffect(() => {
    if (mode === 'page') return;
    const canvas = canvasRef.current;
    const win = docRef.current;
    if (!win || !canvas) return;

    const onWheel = (e: WheelEvent) => {
      turnOnScaling();
      const { deltaY } = e;
      const newScale = state.scale - deltaY * 0.001;
      const safeScale = Math.max(
        Math.min(newScale, scaleRange[1]),
        scaleRange[0]
      );
      setStateAndSave({ ...state, scale: safeScale });
      turnOffScalingRef.current?.();
    };

    // TODO(@catsjuice): mobile support
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-drag]')) return;
      e.preventDefault();
      mouseDownRef.current = true;
      toggleGrabbing(true);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDownRef.current) return;
      const offsetX = state.offsetX + e.movementX / state.scale;
      const offsetY = state.offsetY + e.movementY / state.scale;

      const safeOffsetX = Math.max(
        Math.min(offsetX, offsetXRanges[1]),
        offsetXRanges[0]
      );
      const safeOffsetY = Math.max(
        Math.min(offsetY, offsetYRanges[1]),
        offsetYRanges[0]
      );

      setStateAndSave({
        scale: state.scale,
        offsetX: safeOffsetX,
        offsetY: safeOffsetY,
      });
    };
    const onMouseUp = (_: MouseEvent) => {
      mouseDownRef.current = false;
      toggleGrabbing(false);
    };

    win.addEventListener('wheel', onWheel);
    win.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      win.removeEventListener('wheel', onWheel);
      win.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [
    mode,
    state,
    state.offsetX,
    state.offsetY,
    state.scale,
    setStateAndSave,
    toggleGrabbing,
    turnOnScaling,
  ]);

  // to avoid `overflow: auto` clip the content before animation ends
  useEffect(() => {
    if (mode === 'page') {
      enableScrollWithDelay()
        .then(() => {
          // handle scroll
          canvasRef.current?.scrollTo({ top: 0 });
        })
        .catch(console.error);

      setState({ scale: 1, offsetX: 0, offsetY: 0 });
    } else {
      disableScroll();
      canvasRef.current?.scrollTo({ top: 0 });

      // save state when switching between modes
      setState(prevStateRef.current ?? defaultState);
    }
  }, [disableScroll, enableScrollWithDelay, mode]);

  const canvasStyle = {
    '--scale': state.scale,
    '--offset-x': state.offsetX + 'px',
    '--offset-y': state.offsetY + 'px',
  } as CSSProperties;

  return (
    <div
      data-mode={mode}
      className={styles.edgelessSwitchWindow}
      style={canvasStyle}
    >
      <div className={styles.orbit}>
        <div
          ref={docRef}
          className={clsx(styles.orbitItem, styles.doc)}
          data-scroll={scrollable}
        >
          <div className={styles.canvas} ref={canvasRef}>
            <div className={styles.page}>
              {
                /* render blocks */
                article.blocks.map((block, key) => {
                  return <OnboardingBlock key={key} mode={mode} {...block} />;
                })
              }
            </div>
          </div>

          <div data-no-drag className={styles.noDragWrapper}>
            <header className={styles.header}>
              <Button
                style={{
                  background: 'white',
                  borderColor: '#E3E2E4',
                  color: '#424149',
                }}
                size="extraLarge"
                onClick={onBack}
              >
                Back
              </Button>
              <EdgelessSwitchButtons
                mode={mode}
                onSwitchToPageMode={onSwitchToPageMode}
                onSwitchToEdgelessMode={onSwitchToEdgelessMode}
              />
              <Button size="extraLarge" variant="primary" onClick={onNextClick}>
                Next
              </Button>
            </header>

            <div className={styles.toolbar}>
              <ToolbarSVG />
            </div>
          </div>
        </div>

        <div className={clsx(styles.orbitItem, styles.wellDone)}>
          <div
            className={styles.wellDoneEnterAnim}
            onDoubleClick={() => setMode('edgeless')}
          >
            <Logo />
          </div>
          <h1 className={clsx(styles.wellDoneTitle, styles.wellDoneEnterAnim)}>
            Well Done !
          </h1>
          <p className={clsx(styles.wellDoneContent, styles.wellDoneEnterAnim)}>
            You have the flexibility to switch between Page and Edgeless
            <br /> Mode at any point during content creation.
          </p>
          <Button
            className={styles.wellDoneEnterAnim}
            onClick={onNextClick}
            variant="primary"
            size="extraLarge"
            style={{ marginTop: 40 }}
          >
            Get Started
          </Button>
        </div>
      </div>
    </div>
  );
};
