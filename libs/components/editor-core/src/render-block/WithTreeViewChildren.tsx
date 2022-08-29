import { styled } from '@toeverything/components/ui';
import type {
    ComponentPropsWithoutRef,
    ComponentPropsWithRef,
    CSSProperties,
    ReactElement,
} from 'react';
import { forwardRef } from 'react';
import { CreateView } from '../editor';
import { BlockRender } from './Context';
import { NullBlockRender } from './RenderBlock';

type WithChildrenConfig = {
    indent: CSSProperties['marginLeft'];
};

const defaultConfig: WithChildrenConfig = {
    indent: '30px',
};

const TreeView = forwardRef<
    HTMLDivElement,
    { lastItem?: boolean } & ComponentPropsWithRef<'div'>
>(({ lastItem = false, children, onClick, ...restProps }, ref) => {
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
        const { block } = props;
        const collapsed = block.getProperty('collapsed')?.value;
        const childrenIds = block.childrenIds;
        const showChildren =
            !collapsed &&
            childrenIds.length > 0 &&
            BlockRender !== NullBlockRender;

        const handleCollapse = () => {
            block.setProperty('collapsed', { value: true });
        };

        const handleExpand = () => {
            block.setProperty('collapsed', { value: false });
        };

        return (
            <>
                {creator(props)}

                {collapsed && (
                    <CollapsedNode
                        onClick={handleExpand}
                        style={{ marginLeft: config.indent }}
                    />
                )}
                {showChildren &&
                    childrenIds.map((childId, idx) => {
                        return (
                            <TreeView
                                key={childId}
                                lastItem={idx === childrenIds.length - 1}
                                onClick={handleCollapse}
                                style={{ marginLeft: config.indent }}
                            >
                                <BlockRender key={childId} blockId={childId} />
                            </TreeView>
                        );
                    })}
            </>
        );
    };
};

const TREE_COLOR = '#D5DFE6';
// adjust left and right margins of the the tree line
const TREE_LINE_LEFT_OFFSET = '-16px';
// determine the position of the horizontal line by the type of the item
const TREE_LINE_TOP_OFFSET = '20px'; // '50%'
const TREE_LINE_WIDTH = '12px';

const TreeWrapper = styled('div')({
    position: 'relative',
    display: 'flex',
});

const StyledTreeView = styled('div')({
    position: 'absolute',
    left: TREE_LINE_LEFT_OFFSET,
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
    height: last ? TREE_LINE_TOP_OFFSET : '100%',
    paddingTop: 0,
    paddingBottom: 0,
    transform: 'translate(-50%, 0)',

    opacity: last ? 0 : 'unset',
}));

const HorizontalLine = styled(Line)<{ last: boolean }>(({ last }) => ({
    width: TREE_LINE_WIDTH,
    height: '1px',
    paddingLeft: 0,
    paddingRight: 0,
    top: TREE_LINE_TOP_OFFSET,
    transform: 'translate(0, -50%)',
    opacity: last ? 0 : 'unset',
}));

const Collapsed = styled('div')({
    cursor: 'pointer',
    display: 'inline-block',
    color: '#98ACBD',
    padding: '8px',
});

const LastItemRadius = styled('div')({
    boxSizing: 'content-box',
    position: 'absolute',
    left: '-0.5px',
    top: 0,
    height: TREE_LINE_TOP_OFFSET,
    bottom: '50%',
    width: TREE_LINE_WIDTH,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderLeftColor: TREE_COLOR,
    borderBottomColor: TREE_COLOR,
    borderTop: 'none',
    borderRight: 'none',
    borderRadius: '0 0 0 3px',
    pointerEvents: 'none',
});
