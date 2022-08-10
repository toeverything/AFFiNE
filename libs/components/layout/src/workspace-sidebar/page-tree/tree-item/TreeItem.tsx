import {
    ArrowDropDownIcon,
    ArrowRightIcon,
} from '@toeverything/components/icons';
import { forwardRef, type HTMLAttributes } from 'react';
import { useParams } from 'react-router-dom';

import { useFlag } from '@toeverything/datasource/feature-flags';

import MoreActions from './MoreActions';
import {
    ActionButton,
    Counter,
    TextLink,
    TreeItemContainer,
    TreeItemContent,
    Wrapper,
} from './styles';

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
        const { workspace_id, page_id } = useParams();
        const BooleanPageTreeItemMoreActions = useFlag(
            'BooleanPageTreeItemMoreActions',
            true
        );

        return (
            <Wrapper
                ref={wrapperRef}
                clone={clone}
                ghost={ghost}
                disableSelection={disableSelection}
                disableInteraction={disableInteraction}
                spacing={`${indentationWidth * depth}px`}
                {...props}
            >
                <TreeItemContainer ref={ref} style={style} title={value}>
                    <ActionButton tabIndex={0} onClick={onCollapse}>
                        {childCount !== 0 &&
                            (collapsed ? (
                                <ArrowRightIcon />
                            ) : (
                                <ArrowDropDownIcon />
                            ))}
                    </ActionButton>

                    <TreeItemContent {...handleProps}>
                        <TextLink
                            to={`/${workspace_id}/${pageId}`}
                            active={pageId === page_id}
                        >
                            {value}
                        </TextLink>
                        {BooleanPageTreeItemMoreActions && (
                            <MoreActions
                                workspaceId={workspace_id}
                                pageId={pageId}
                                onRemove={onRemove}
                            />
                        )}

                        {/*{!clone && onRemove && <Remove onClick={onRemove} />}*/}
                        {clone && childCount && childCount > 1 ? (
                            <Counter>{childCount}</Counter>
                        ) : null}
                    </TreeItemContent>
                </TreeItemContainer>
            </Wrapper>
        );
    }
);
