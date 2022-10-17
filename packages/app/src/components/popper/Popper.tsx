import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import PopperUnstyled from '@mui/base/PopperUnstyled';
import ClickAwayListener from '@mui/base/ClickAwayListener';
import Grow from '@mui/material/Grow';

import { styled } from '@/styles';

import { PopperProps, VirtualElement } from './interface';
import { PopperArrow } from './PopoverArrow';
export const Popper = ({
  children,
  content,
  anchorEl: propsAnchorEl,
  placement = 'top-start',
  defaultVisible = false,
  visible: propsVisible,
  trigger = 'hover',
  pointerEnterDelay = 100,
  pointerLeaveDelay = 100,
  onVisibleChange,
  popoverStyle,
  popoverClassName,
  anchorStyle,
  anchorClassName,
  zIndex,
  offset = [0, 5],
  showArrow = false,
  popperHandlerRef,
  onClick,
  onClickAway,
  ...popperProps
}: PopperProps) => {
  // @ts-ignore
  const [anchorEl, setAnchorEl] = useState<VirtualElement>(null);
  const [visible, setVisible] = useState(defaultVisible);
  // @ts-ignore
  const [arrowRef, setArrowRef] = useState<HTMLElement>(null);
  const popperRef = useRef();
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

  const onPointerEnterHandler = () => {
    if (!hasHoverTrigger || visibleControlledByParent) {
      return;
    }
    window.clearTimeout(pointerLeaveTimer.current);

    pointerEnterTimer.current = window.setTimeout(() => {
      setVisible(true);
    }, pointerEnterDelay);
  };

  const onPointerLeaveHandler = () => {
    if (!hasHoverTrigger || visibleControlledByParent) {
      return;
    }
    window.clearTimeout(pointerEnterTimer.current);
    pointerLeaveTimer.current = window.setTimeout(() => {
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

  // @ts-ignore
  // @ts-ignore
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
      <Container>
        {isAnchorCustom ? null : (
          <div
            ref={(dom: HTMLDivElement) => setAnchorEl(dom)}
            onClick={e => {
              if (!hasClickTrigger || visibleControlledByParent) {
                onClick?.(e);
                return;
              }
              setVisible(!visible);
            }}
            onPointerEnter={onPointerEnterHandler}
            onPointerLeave={onPointerLeaveHandler}
            style={anchorStyle}
            className={anchorClassName}
          >
            {children}
          </div>
        )}
        <BasicStyledPopper
          // @ts-ignore
          popperRef={popperRef}
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
              >
                {showArrow && (
                  // @ts-ignore
                  <PopperArrow placement={placement} ref={setArrowRef} />
                )}
                {content}
              </div>
            </Grow>
          )}
        </BasicStyledPopper>
      </Container>
    </ClickAwayListener>
  );
};

// The children of ClickAwayListener must be a DOM Node to judge whether the click is outside, use node.contains
const Container = styled('div')({
  display: 'contents',
});

const BasicStyledPopper = styled(PopperUnstyled, {
  shouldForwardProp: (propName: string) =>
    !['zIndex'].some(name => name === propName),
})<{
  zIndex?: number;
}>(({ zIndex, theme }) => {
  return {
    zIndex: zIndex,
  };
});
