import { MuiBackdrop, styled, useTheme } from '@toeverything/components/ui';
import { createContext, ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../Contexts';
import { RenderBlock } from '../render-block';

const Dialog = styled('div')({
    flex: 1,
    width: '880px',
    margin: '72px auto',
    background: '#fff',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    borderRadius: '10px',
    padding: '72px 120px',
    overflow: 'scroll',
});

const Modal = ({ open, children }: { open: boolean; children?: ReactNode }) => {
    const theme = useTheme();
    const { closeSubPage } = useRefPage();

    return createPortal(
        <MuiBackdrop
            open={open}
            style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(58, 76, 92, 0.4)',
                zIndex: theme.affine.zIndex.popover,
            }}
            onClick={closeSubPage}
        >
            <Dialog
                onClick={e => {
                    e.stopPropagation();
                }}
            >
                {children}
            </Dialog>
        </MuiBackdrop>,

        document.body
    );
};

const ModalPage = ({ blockId }: { blockId: string | null }) => {
    const { editor } = useEditor();

    return (
        <Modal open={!!blockId}>
            {blockId && <RenderBlock blockId={blockId} />}
        </Modal>
    );
};

const RefPageContext = createContext<
    ReturnType<typeof useState<string | null>> | undefined
>(undefined);

export const RefPageProvider = ({ children }: { children: ReactNode }) => {
    const state = useState<string | null>();
    const [blockId, setBlockId] = state;

    return (
        <RefPageContext.Provider value={state}>
            {children}
            <ModalPage blockId={blockId ?? null} />
        </RefPageContext.Provider>
    );
};

export const useRefPage = () => {
    const context = useContext(RefPageContext);
    if (!context) {
        throw new Error(
            'Wrap your app inside of a `SubPageProvider` to have access to the hook context!'
        );
    }
    const [blockId, setBlockId] = context;
    const openSubPage = (blockId: string) => {
        setBlockId(blockId);
    };
    const closeSubPage = () => {
        setBlockId(null);
    };

    return { blockId, open: !!blockId, openSubPage, closeSubPage };
};

// export const openSubPage = () => {};
