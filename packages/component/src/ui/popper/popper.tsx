import { ClickAwayListener } from '@mui/base/ClickAwayListener';
import { Popper as PopperUnstyled } from '@mui/base/Popper';
import Grow from '@mui/material/Grow';
import type { CSSProperties, PointerEvent } from 'react';
import {
  cloneElement,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { styled } from '../../styles';
import type { PopperProps, VirtualElement } from './interface';
export const Popper = ({
  children,
  content,
  anchorEl: propsAnchorEl,
  placement = 'top-start',
  defaultVisible = false,
  visible: propsVisible,
  trigger = 'hover',
  pointerEnterDelay = 500,
  pointerLeaveDelay = 100,
  onVisibleChange,
  popoverStyle,
  popoverClassName,
  anchorClassName,
  zIndex,
  offset = [0, 5],
  showArrow = false,
  popperHandlerRef,
  onClick,
  onClickAway,
  onPointerEnter,
  onPointerLeave,
  triggerContainerStyle = {},
  ...popperProps
}: PopperProps) => {
  const [anchorEl, setAnchorEl] = useState<VirtualElement>();
  const [visible, setVisible] = useState(defaultVisible);
  //const [arrowRef, setArrowRef] = useState<HTMLElement>();
  const arrowRef = null;
  const pointerLeaveTimer = useRef<number>();
  const pointerEnterTimer = useRef<number>();

  const visibleControlledByParent = typeof propsVisible !== 'undefined';
  const isAnchorCustom = typeof propsAnchorEl !== 'undefined';

  const hasHoverTrigger = useMemo(() => {
    return (
      trigger === 'hover' ||
      (Array.isArray(trigger) && trigger.includes('hover'))
    );
  }, [trigger]);

  const hasClickTrigger = useMemo(() => {
    return (
      trigger === 'click' ||
      (Array.isArray(trigger) && trigger.includes('click'))
    );
  }, [trigger]);

  const onPointerEnterHandler = (e: PointerEvent<HTMLDivElement>) => {
    onPointerEnter?.(e);
    if (!hasHoverTrigger || visibleControlledByParent) {
      return;
    }
    window.clearTimeout(pointerLeaveTimer.current);

    pointerEnterTimer.current = window.window.setTimeout(() => {
      setVisible(true);
    }, pointerEnterDelay);
  };

  const onPointerLeaveHandler = (e: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(e);

    if (!hasHoverTrigger || visibleControlledByParent) {
      return;
    }
    window.clearTimeout(pointerEnterTimer.current);
    pointerLeaveTimer.current = window.window.setTimeout(() => {
      setVisible(false);
    }, pointerLeaveDelay);
  };

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  useImperativeHandle(popperHandlerRef, () => {
    return {
      setVisible: (visible: boolean) => {
        !visibleControlledByParent && setVisible(visible);
      },
    };
  });

  const mergedClass = [anchorClassName, children.props.className]
    .filter(Boolean)
    .join(' ');

  return (
    <ClickAwayListener
      onClickAway={() => {
        if (visibleControlledByParent) {
          onClickAway?.();
        } else {
          setVisible(false);
        }
      }}
    >
      <Container style={triggerContainerStyle}>
        {cloneElement(children, {
          ref: (dom: HTMLDivElement) => setAnchorEl(dom),
          onClick: (e: MouseEvent) => {
            children.props.onClick?.(e);
            if (!hasClickTrigger || visibleControlledByParent) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              onClick?.(e);
              return;
            }
            setVisible(!visible);
          },
          onPointerEnter: onPointerEnterHandler,
          onPointerLeave: onPointerLeaveHandler,
          ...(mergedClass
            ? {
                className: mergedClass,
              }
            : {}),
        })}
        {content && (
          <BasicStyledPopper
            open={visibleControlledByParent ? propsVisible : visible}
            zIndex={zIndex}
            anchorEl={isAnchorCustom ? propsAnchorEl : anchorEl}
            placement={placement}
            transition
            modifiers={[
              {
                name: 'offset',
                options: {
                  offset,
                },
              },
              {
                name: 'arrow',
                enabled: showArrow,
                options: {
                  element: arrowRef,
                },
              },
            ]}
            {...popperProps}
          >
            {({ TransitionProps }) => (
              <Grow {...TransitionProps}>
                <div
                  onPointerEnter={onPointerEnterHandler}
                  onPointerLeave={onPointerLeaveHandler}
                  style={popoverStyle}
                  className={popoverClassName}
                  onClick={() => {
                    if (hasClickTrigger && !visibleControlledByParent) {
                      setVisible(false);
                    }
                  }}
                >
                  {showArrow ? (
                    <>
                      {placement.indexOf('bottom') === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="11"
                            height="6"
                            viewBox="0 0 11 6"
                            fill="none"
                          >
                            <path
                              d="M6.38889 0.45C5.94444 -0.15 5.05555 -0.150001 4.61111 0.449999L0.499999 6L10.5 6L6.38889 0.45Z"
                              style={{ fill: 'var(--affine-tooltip)' }}
                            />
                          </svg>
                          {content}
                        </div>
                      ) : placement.indexOf('top') === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}
                        >
                          {content}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="11"
                            height="6"
                            viewBox="0 0 11 6"
                            fill="none"
                          >
                            <path
                              d="M4.61111 5.55C5.05556 6.15 5.94445 6.15 6.38889 5.55L10.5 -4.76837e-07H0.5L4.61111 5.55Z"
                              style={{ fill: 'var(--affine-tooltip)' }}
                            />
                          </svg>
                        </div>
                      ) : placement.indexOf('left') === 0 ? (
                        <>
                          {content}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="6"
                            height="10"
                            viewBox="0 0 6 10"
                            fill="none"
                          >
                            <path
                              d="M5.55 5.88889C6.15 5.44444 6.15 4.55555 5.55 4.11111L-4.76837e-07 0L-4.76837e-07 10L5.55 5.88889Z"
                              style={{ fill: 'var(--affine-tooltip)' }}
                            />
                          </svg>
                        </>
                      ) : placement.indexOf('right') === 0 ? (
                        <>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="6"
                            height="10"
                            viewBox="0 0 6 10"
                            style={{ fill: 'var(--affine-tooltip)' }}
                          >
                            <path
                              d="M0.45 4.11111C-0.15 4.55556 -0.15 5.44445 0.45 5.88889L6 10V0L0.45 4.11111Z"
                              style={{ fill: 'var(--affine-tooltip)' }}
                            />
                          </svg>
                          {content}
                        </>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}
                        >
                          {content}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="11"
                            height="6"
                            viewBox="0 0 11 6"
                            fill="none"
                          >
                            <path
                              d="M4.61111 5.55C5.05556 6.15 5.94445 6.15 6.38889 5.55L10.5 -4.76837e-07H0.5L4.61111 5.55Z"
                              style={{ fill: 'var(--affine-tooltip)' }}
                            />
                          </svg>
                        </div>
                      )}
                    </>
                  ) : (
                    <>{content}</>
                  )}
                </div>
              </Grow>
            )}
          </BasicStyledPopper>
        )}
      </Container>
    </ClickAwayListener>
  );
};

// The children of ClickAwayListener must be a DOM Node to judge whether the click is outside, use node.contains
const Container = styled('div')({
  display: 'contents',
});

export const BasicStyledPopper = styled(PopperUnstyled, {
  shouldForwardProp: (propName: string) =>
    !['zIndex'].some(name => name === propName),
})<{
  zIndex?: CSSProperties['zIndex'];
}>(({ zIndex }) => {
  return {
    zIndex: zIndex ?? 'var(--affine-z-index-popover)',
  };
});
