import {
    MuiClickAwayListener as ClickAwayListener,
    styled,
} from '@toeverything/components/ui';
import { Protocol } from '@toeverything/datasource/db-service';
import type {
    AsyncBlock,
    PluginHooks,
    Virgo,
} from '@toeverything/framework/virgo';
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type CSSProperties,
} from 'react';

export type Store =
    | {
          editor: Virgo;
          hooks: PluginHooks;
      }
    | Record<string, never>;

export const StoreContext = createContext<Store>({});

export const MenuApp = () => {
    const { editor } = useContext(StoreContext);
    const [show, setShow] = useState<boolean>(false);
    const [style, setStyle] = useState<CSSProperties>();
    const [selectedNodes, setSelectedNodes] = useState<AsyncBlock[]>([]);

    useEffect(() => {
        if (!editor) {
            console.warn('Failed to found editor! ');
            return undefined;
        }
        const unsubscribe = editor.selection.onSelectEnd(
            async ({ type, selectedNodesIds }) => {
                if (type !== 'Block' || selectedNodesIds.length <= 1) {
                    // Not show menu if only one node is selected.
                    // The user can still create a group with only one block.
                    return;
                }
                const selectedNodes = (
                    await Promise.all(
                        selectedNodesIds.map(id => editor.getBlockById(id))
                    )
                ).filter(Boolean) as AsyncBlock[];
                if (
                    !selectedNodes.every(
                        node => node.type === Protocol.Block.Type.group
                    )
                ) {
                    return;
                }

                // Assume the first block is the topmost block
                const topmostBlock = selectedNodes[0];
                if (!topmostBlock) {
                    throw new Error(
                        'Failed to get block, id: ' + selectedNodesIds[0]
                    );
                }
                const dom = topmostBlock.dom;
                if (!dom) {
                    return;
                }
                const rect = dom.getBoundingClientRect();

                setSelectedNodes(selectedNodes);
                setStyle({
                    position: 'fixed',
                    left: rect.right,
                    top: rect.top,
                    transform: 'translate(-100%, -100%)',
                });
                setShow(true);
            }
        );
        return unsubscribe;
    }, [editor]);

    const handleGroup = () => {
        editor.commands.blockCommands.mergeGroup(...selectedNodes);
        setShow(false);
    };

    const handleClickAway = () => {
        if (show) {
            setShow(false);
        }
    };

    return show ? (
        <ClickAwayListener onClickAway={handleClickAway}>
            <IconButton style={style} onClick={handleGroup}>
                Merge Group
            </IconButton>
        </ClickAwayListener>
    ) : null;
};

const IconButton = styled('span')({
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#3E6FDB',
    cursor: 'pointer',

    '&:hover': {
        backgroundColor: 'rgba(62, 111, 219, 0.1)',
    },

    '&.active': {
        backgroundColor: 'rgba(62, 111, 219, 0.1)',
    },
});
