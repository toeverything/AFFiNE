import {
    ArrowDropDownIcon,
    ArrowRightIcon,
} from '@toeverything/components/icons';
import { forwardRef, type HTMLAttributes } from 'react';
import { useParams } from 'react-router-dom';

import { useFlag } from '@toeverything/datasource/feature-flags';

import { DotIcon } from '../../dot-icon';
import MoreActions from './MoreActions';
import {
    ActionButton,
    Counter,
    TextLink,
    TreeItemContainer,
    TreeItemContent,
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
    indentationWidth: number;
    onCollapse?(): void;
    onRemove?(): void;
} & HTMLAttributes<HTMLDivElement>;

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
            collapsed,
            onCollapse,
            onRemove,
            value,
            pageId,
            ...props
        },
        ref
    ) => {
        const { workspaceId, page_id } = useParams();
        const BooleanPageTreeItemMoreActions = useFlag(
            'BooleanPageTreeItemMoreActions',
            true
        );

        return (
            <TreeItemContainer
                ref={ref}
                clone={clone}
                ghost={ghost}
                disableSelection={disableSelection}
                disableInteraction={disableInteraction}
                spacing={`${indentationWidth * depth + 12}px`}
                active={pageId === page_id}
                {...props}
            >
                {childCount !== 0 ? (
                    collapsed ? (
                        <ActionButton tabIndex={0} onClick={onCollapse}>
                            <ArrowRightIcon />
                        </ActionButton>
                    ) : (
                        <ActionButton tabIndex={0} onClick={onCollapse}>
                            <ArrowDropDownIcon />
                        </ActionButton>
                    )
                ) : (
                    <DotIcon />
                )}

                <TreeItemContent {...handleProps}>
                    <TextLink to={`/${workspaceId}/${pageId}`}>
                        {value}
                    </TextLink>
                    {BooleanPageTreeItemMoreActions && (
                        <MoreActions
                            workspaceId={workspaceId}
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
        );
    }
);
