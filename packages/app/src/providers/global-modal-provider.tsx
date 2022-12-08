import { createContext, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import ShortcutsModal from '@/components/shortcuts-modal';
import ContactModal from '@/components/contact-modal';
import QuickSearch from '@/components/quick-search';
type ModalContextValue = {
  shortcutsModalHandler: (visible: boolean) => void;
  triggerContactModal: (visible: boolean) => void;
  triggerQuickSearchModal: (visible: boolean) => void;
};
type ModalContextProps = PropsWithChildren<{}>;

export const ModalContext = createContext<ModalContextValue>({
  shortcutsModalHandler: () => {},
  triggerContactModal: () => {},
  triggerQuickSearchModal: () => {},
});

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({
  children,
}: PropsWithChildren<ModalContextProps>) => {
  const [openContactModal, setOpenContactModal] = useState(false);
  const [openShortcutsModal, setOpenShortcutsModal] = useState(false);
  const [openQuickSearchModal, setOpenQuickSearchModal] = useState(false);

  return (
    <ModalContext.Provider
      value={{
        shortcutsModalHandler: visible => {
          setOpenShortcutsModal(visible);
        },
        triggerContactModal: visible => {
          setOpenContactModal(visible);
        },
        triggerQuickSearchModal: visible => {
          setOpenQuickSearchModal(visible);
        },
      }}
    >
      <ContactModal
        open={openContactModal}
        onClose={() => {
          setOpenContactModal(false);
        }}
      ></ContactModal>
      <ShortcutsModal
        open={openShortcutsModal}
        onClose={() => {
          setOpenShortcutsModal(false);
        }}
      ></ShortcutsModal>
      <QuickSearch
        open={openQuickSearchModal}
        onClose={() => {
          setOpenQuickSearchModal(false);
        }}
      ></QuickSearch>
      {children}
    </ModalContext.Provider>
  );
};

export default ModalProvider;
