import {
    CreateView,
    RenderBlock,
    useCurrentView,
    useOnSelect,
    BlockPendantProvider,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import type {
    ComponentPropsWithoutRef,
    ComponentPropsWithRef,
    CSSProperties,
    ReactElement,
} from 'react';
import { forwardRef, useState } from 'react';
import { SCENE_CONFIG } from '../blocks/group/config';
import { BlockContainer } from '../components/BlockContainer';

type WithChildrenConfig = {
    indent: CSSProperties['marginLeft'];
};

const defaultConfig: WithChildrenConfig = {
    indent: '30px',
};

const TreeView = forwardRef<
    HTMLDivElement,
    { lastItem?: boolean } & ComponentPropsWithRef<'div'>
>(({ lastItem, children, onClick, ...restProps }, ref) => {
    return (
        <TreeWrapper ref={ref} {...restProps}>
            <StyledTreeView>
                <VerticalLine last={lastItem} onClick={onClick} />
                <HorizontalLine last={lastItem} onClick={onClick} />
                {lastItem && <LastItemRadius />}
            </StyledTreeView>
            {/* maybe need a child wrapper */}
            {children}
        </TreeWrapper>
    );
});

interface ChildrenViewProp {
    childrenIds: string[];
    handleCollapse: () => void;
    indent?: string | number;
}

const ChildrenView = ({
    childrenIds,
    handleCollapse,
    indent,
}: ChildrenViewProp) => {
    const [currentView] = useCurrentView();
    const isKanbanScene = currentView.type === SCENE_CONFIG.KANBAN;

    return (
        <Children style={{ ...(!isKanbanScene && { marginLeft: indent }) }}>
            {childrenIds.map((childId, idx) => {
                if (isKanbanScene) {
                    return (
                        <StyledBorder>
                            <RenderBlock key={childId} blockId={childId} />
                        </StyledBorder>
                    );
                }

                return (
                    <TreeView
                        key={childId}
                        lastItem={idx === childrenIds.length - 1}
                        onClick={handleCollapse}
                    >
                        <RenderBlock key={childId} blockId={childId} />
                    </TreeView>
                );
            })}
        </Children>
    );
};

const CollapsedNode = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>((props, ref) => {
    return (
        <TreeView ref={ref} lastItem={true} {...props}>
            <Collapsed onClick={props.onClick}>···</Collapsed>
        </TreeView>
    );
});

/**
 * Indent rendering child nodes
 */
export const withTreeViewChildren = (
    creator: (props: CreateView) => ReactElement,
    customConfig: Partial<WithChildrenConfig> = {}
) => {
    const config = {
        ...defaultConfig,
        ...customConfig,
    };

    return (props: CreateView) => {
        const { block, editor } = props;
        const collapsed = block.getProperty('collapsed')?.value;
        const childrenIds = block.childrenIds;
        const showChildren = !collapsed && childrenIds.length > 0;

        const [isSelect, setIsSelect] = useState<boolean>(false);
        useOnSelect(block.id, (isSelect: boolean) => {
            setIsSelect(isSelect);
        });
        const handleCollapse = () => {
            block.setProperty('collapsed', { value: true });
        };

        const handleExpand = () => {
            block.setProperty('collapsed', { value: false });
        };

        return (
            <BlockContainer
                editor={props.editor}
                block={block}
                selected={isSelect}
                className={Wrapper.toString()}
            >
                <BlockPendantProvider block={block}>
                    <div>{creator(props)}</div>
                </BlockPendantProvider>

                {collapsed && (
                    <CollapsedNode
                        onClick={handleExpand}
                        style={{ marginLeft: config.indent }}
                    />
                )}
                {showChildren && (
                    <ChildrenView
                        childrenIds={childrenIds}
                        handleCollapse={handleCollapse}
                        indent={config.indent}
                    />
                )}
            </BlockContainer>
        );
    };
};

const Wrapper = styled('div')({ display: 'flex', flexDirection: 'column' });

const Children = Wrapper;

const TREE_COLOR = '#D5DFE6';
// TODO determine the position of the horizontal line by the type of the item
const ITEM_POINT_HEIGHT = '12.5px'; // '50%'

const TreeWrapper = styled('div')({
    position: 'relative',
});

const StyledTreeView = styled('div')({
    position: 'absolute',
    left: '-21px',
    height: '100%',
});

const Line = styled('div')({
    position: 'absolute',
    cursor: 'pointer',
    backgroundColor: TREE_COLOR,
    // somehow tldraw would override this
    boxSizing: 'content-box!important' as any,
    // See [Can I add background color only for padding?](https://stackoverflow.com/questions/14628601/can-i-add-background-color-only-for-padding)
    backgroundClip: 'content-box',
    backgroundOrigin: 'content-box',
    // Increase click hot spot
    padding: '10px',
});

const VerticalLine = styled(Line)<{ last: boolean }>(({ last }) => ({
    width: '1px',
    height: last ? ITEM_POINT_HEIGHT : '100%',
    paddingTop: 0,
    paddingBottom: 0,
    transform: 'translate(-50%, 0)',

    opacity: last ? 0 : 'unset',
}));

const HorizontalLine = styled(Line)<{ last: boolean }>(({ last }) => ({
    width: '16px',
    height: '1px',
    paddingLeft: 0,
    paddingRight: 0,
    top: ITEM_POINT_HEIGHT,
    transform: 'translate(0, -50%)',
    opacity: last ? 0 : 'unset',
}));

const Collapsed = styled('div')({
    cursor: 'pointer',
    display: 'inline-block',
    color: '#B9CAD5',
});

const LastItemRadius = styled('div')({
    boxSizing: 'content-box',
    position: 'absolute',
    left: '-0.5px',
    top: 0,
    height: ITEM_POINT_HEIGHT,
    bottom: '50%',
    width: '16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderLeftColor: TREE_COLOR,
    borderBottomColor: TREE_COLOR,
    borderTop: 'none',
    borderRight: 'none',
    borderRadius: '0 0 0 3px',
    pointerEvents: 'none',
});

const StyledBorder = styled('div')({
    border: '1px solid #E0E6EB',
    borderRadius: '5px',
    margin: '4px',
});
