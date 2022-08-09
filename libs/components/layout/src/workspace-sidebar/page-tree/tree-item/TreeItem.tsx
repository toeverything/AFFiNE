import React, {
    forwardRef,
    type CSSProperties,
    type HTMLAttributes,
} from 'react';
import { useParams, Link } from 'react-router-dom';
import cx from 'clsx';
import { CloseIcon } from '@toeverything/components/common';
import {
    ArrowDropDownIcon,
    ArrowRightIcon,
} from '@toeverything/components/icons';

import styles from './tree-item.module.scss';
import { useFlag } from '@toeverything/datasource/feature-flags';

import MoreActions from './MoreActions';
export type TreeItemProps = {
    /** The main text to display on this line */
    value: string;
    /** The layer number of the node, 0, 1, 2 */
    depth: number;
    /** The item in the DragOverlay is clone, the one in the normal list is not clone, and the delete icon is displayed through the clone control */
    clone?: boolean;
    pageId?: string;
    childCount?: number;
    collapsed?: boolean;
    disableInteraction?: boolean;
    disableSelection?: boolean;
    /** isDragging */
    ghost?: boolean;
    handleProps?: any;
    indicator?: boolean;
    indentationWidth: number;
    onCollapse?(): void;
    onRemove?(): void;
    /** The ref of the outermost container is often used as droppaHTMLAttributes<HTMLLIElement>ble-node; the ref of the inner dom is often used as draggable-node */
    wrapperRef?(node: HTMLLIElement): void;
} & HTMLAttributes<HTMLLIElement>;

export const TreeItem = forwardRef<HTMLDivElement, TreeItemProps>(
    (
        {
            childCount,
            clone,
            depth,
            disableSelection,
            disableInteraction,
            ghost,
            handleProps,
            indentationWidth,
            indicator,
            collapsed,
            onCollapse,
            onRemove,
            style,
            value,
            wrapperRef,
            pageId,
            ...props
        },
        ref
    ) => {
        const { workspace_id } = useParams();
        const BooleanPageTreeItemMoreActions = useFlag(
            'BooleanPageTreeItemMoreActions',
            true
        );
        return (
            <li
                ref={wrapperRef}
                className={cx(
                    styles['Wrapper'],
                    clone && styles['clone'],
                    ghost && styles['ghost'],
                    indicator && styles['indicator'],
                    disableSelection && styles['disableSelection'],
                    disableInteraction && styles['disableInteraction']
                )}
                style={
                    {
                        '--spacing': `${indentationWidth * depth}px`,
                        paddingTop: 0,
                        paddingBottom: 0,
                    } as CSSProperties
                }
                {...props}
            >
                <div
                    ref={ref}
                    className={styles['TreeItem']}
                    style={style}
                    title={value}
                >
                    <Action onClick={onCollapse}>
                        {childCount !== 0 &&
                            (collapsed ? (
                                <ArrowRightIcon />
                            ) : (
                                <ArrowDropDownIcon />
                            ))}
                    </Action>

                    <div className={styles['ItemContent']}>
                        <Link
                            className={styles['Text']}
                            {...handleProps}
                            to={`/${workspace_id}/${pageId}`}
                        >
                            {value}
                        </Link>
                        {BooleanPageTreeItemMoreActions && (
                            <MoreActions
                                workspaceId={workspace_id}
                                pageId={pageId}
                                onRemove={onRemove}
                            />
                        )}

                        {/*{!clone && onRemove && <Remove onClick={onRemove} />}*/}
                        {clone && childCount && childCount > 1 ? (
                            <span className={styles['Count']}>
                                {childCount}
                            </span>
                        ) : null}
                    </div>
                </div>
            </li>
        );
    }
);

export interface ActionProps extends React.HTMLAttributes<HTMLButtonElement> {
    active?: {
        fill: string;
        background: string;
    };
    // cursor?: CSSProperties['cursor'];
    cursor?: 'pointer' | 'grab';
}

/** Customizable buttons */
export function Action({
    active,
    className,
    cursor,
    style,
    ...props
}: ActionProps) {
    return (
        <button
            {...props}
            className={cx(styles['Action'], className)}
            tabIndex={0}
            style={
                {
                    ...style,
                    '--fill': active?.fill,
                    '--background': active?.background,
                } as CSSProperties
            }
        />
    );
}

export function Handle(props: ActionProps) {
    return (
        <Action cursor="grab" data-cypress="draggable-handle" {...props}>
            <ArrowDropDownIcon />
        </Action>
    );
}

export function Remove(props: ActionProps) {
    return (
        <Action
            {...props}
            active={{
                fill: 'rgba(255, 70, 70, 0.95)',
                background: 'rgba(255, 70, 70, 0.1)',
            }}
        >
            <CloseIcon style={{ fontSize: 12 }} />
            {/* <svg width="8" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.99998 -0.000206962C2.7441 -0.000206962 2.48794 0.0972617 2.29294 0.292762L0.292945 2.29276C-0.0980552 2.68376 -0.0980552 3.31682 0.292945 3.70682L7.58591 10.9998L0.292945 18.2928C-0.0980552 18.6838 -0.0980552 19.3168 0.292945 19.7068L2.29294 21.7068C2.68394 22.0978 3.31701 22.0978 3.70701 21.7068L11 14.4139L18.2929 21.7068C18.6829 22.0978 19.317 22.0978 19.707 21.7068L21.707 19.7068C22.098 19.3158 22.098 18.6828 21.707 18.2928L14.414 10.9998L21.707 3.70682C22.098 3.31682 22.098 2.68276 21.707 2.29276L19.707 0.292762C19.316 -0.0982383 18.6829 -0.0982383 18.2929 0.292762L11 7.58573L3.70701 0.292762C3.51151 0.0972617 3.25585 -0.000206962 2.99998 -0.000206962Z" />
            </svg> */}
        </Action>
    );
}
