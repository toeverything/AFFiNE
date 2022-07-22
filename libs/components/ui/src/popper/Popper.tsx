import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import {
    MuiPopper,
    MuiClickAwayListener as ClickAwayListener,
    MuiGrow as Grow,
} from '../mui';
import { styled } from '../styled';

import { PopperProps, PopperHandler, VirtualElement } from './interface';
import { useTheme } from '../theme';
import { PopperArrow } from './PopoverArrow';
export const Popper = forwardRef<PopperHandler, PropsWithChildren<PopperProps>>(
    (
        {
            children,
            content,
            anchor: propsAnchor,
            placement = 'top-start',
            defaultVisible = false,
            container,
            keepMounted = false,
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
        },
        ref
    ) => {
        const [anchorEl, setAnchorEl] = useState<VirtualElement>(null);
        const [visible, setVisible] = useState(defaultVisible);
        const [arrowRef, setArrowRef] = useState<HTMLElement>(null);

        const pointerLeaveTimer = useRef<number>();
        const pointerEnterTimer = useRef<number>();

        const visibleControlledByParent = typeof propsVisible !== 'undefined';
        const isAnchorCustom = typeof propsAnchor !== 'undefined';

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

        const theme = useTheme();

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

        useImperativeHandle(ref, () => {
            return {
                setVisible: (visible: boolean) => {
                    !visibleControlledByParent && setVisible(visible);
                },
            };
        });

        return (
            <ClickAwayListener
                onClickAway={() => {
                    setVisible(false);
                }}
            >
                <Container>
                    {isAnchorCustom ? null : (
                        <div
                            ref={(dom: HTMLDivElement) => setAnchorEl(dom)}
                            onClick={() => {
                                if (
                                    !hasClickTrigger ||
                                    visibleControlledByParent
                                ) {
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
                    <MuiPopper
                        open={
                            visibleControlledByParent ? propsVisible : visible
                        }
                        sx={{ zIndex: zIndex || theme.affine.zIndex.popover }}
                        anchorEl={isAnchorCustom ? propsAnchor : anchorEl}
                        placement={placement}
                        container={container}
                        keepMounted={keepMounted}
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
                                        <PopperArrow
                                            placement={placement}
                                            ref={setArrowRef}
                                        />
                                    )}
                                    {content}
                                </div>
                            </Grow>
                        )}
                    </MuiPopper>
                </Container>
            </ClickAwayListener>
        );
    }
);

// The children of ClickAwayListener must be a DOM Node to judge whether the click is outside, use node.contains
const Container = styled('div')({
    display: 'contents',
});
