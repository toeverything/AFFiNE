import { RenderBlock } from '@toeverything/components/editor-core';
import { MuiBackdrop, styled, useTheme } from '@toeverything/components/ui';
import { createContext, ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

const Dialog = styled('div')({
    flex: 1,
    width: '880px',
    margin: '72px auto',
    background: '#fff',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    borderRadius: '10px',
    padding: '40px 50px',
});

const Modal = ({ open, children }: { open: boolean; children?: ReactNode }) => {
    const theme = useTheme();
    const { closeSubPage } = useSubPage();

    return createPortal(
        <MuiBackdrop
            open={open}
            style={{
                display: 'flex',
                flexDirection: 'column',
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

const ModalPage = ({ blockId }: { blockId: string }) => {
    if (!blockId) {
        return null;
    }
    return (
        <Modal open={true}>
            <RenderBlock blockId={blockId} />
        </Modal>
    );
};

const SubPageContext = createContext<
    ReturnType<typeof useState<string | null>> | undefined
>(undefined);

export const SubPageProvider = ({ children }: { children: ReactNode }) => {
    const state = useState<string | null>();
    const [blockId, setBlockId] = state;

    return (
        <SubPageContext.Provider value={state}>
            {children}
            {blockId && <ModalPage blockId={blockId} />}
        </SubPageContext.Provider>
    );
};

export const useSubPage = () => {
    const context = useContext(SubPageContext);
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
