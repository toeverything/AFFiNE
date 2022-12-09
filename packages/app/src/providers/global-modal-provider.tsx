import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import ShortcutsModal from '@/components/shortcuts-modal';
import ContactModal from '@/components/contact-modal';
import QuickSearch from '@/components/quick-search';
import { ImportModal } from '@/components/import';

type ModalContextValue = {
  triggerShortcutsModal: () => void;
  triggerContactModal: () => void;
  triggerQuickSearchModal: () => void;
  triggerImportModal: () => void;
};
type ModalContextProps = PropsWithChildren<{}>;
type ModalMap = {
  contact: boolean;
  shortcuts: boolean;
  quickSearch: boolean;
  import: boolean;
};

export const ModalContext = createContext<ModalContextValue>({
  triggerShortcutsModal: () => {},
  triggerContactModal: () => {},
  triggerQuickSearchModal: () => {},
  triggerImportModal: () => {},
});

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({
  children,
}: PropsWithChildren<ModalContextProps>) => {
  const [modalMap, setModalMap] = useState<ModalMap>({
    contact: false,
    shortcuts: false,
    quickSearch: false,
    import: false,
  });

  const triggerHandler = (key: keyof ModalMap, visible?: boolean) => {
    setModalMap({
      ...modalMap,
      [key]: visible ?? !modalMap[key],
    });
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        const selection = window.getSelection();
        if (selection?.toString()) {
          triggerHandler('quickSearch', false);
          return;
        }
        if (selection?.isCollapsed) {
          triggerHandler('quickSearch');
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <ModalContext.Provider
      value={{
        triggerShortcutsModal: () => {
          triggerHandler('shortcuts');
        },
        triggerContactModal: () => {
          triggerHandler('contact');
        },
        triggerQuickSearchModal: () => {
          triggerHandler('quickSearch');
        },
        triggerImportModal: () => {
          triggerHandler('import');
        },
      }}
    >
      <ContactModal
        open={modalMap.contact}
        onClose={() => {
          triggerHandler('contact', false);
        }}
      ></ContactModal>
      <ShortcutsModal
        open={modalMap.shortcuts}
        onClose={() => {
          triggerHandler('shortcuts', false);
        }}
      ></ShortcutsModal>
      <QuickSearch
        open={modalMap.quickSearch}
        onClose={() => {
          triggerHandler('quickSearch', false);
        }}
      ></QuickSearch>
      <ImportModal
        open={modalMap.import}
        onClose={() => {
          triggerHandler('import', false);
        }}
      ></ImportModal>
      {children}
    </ModalContext.Provider>
  );
};

export default ModalProvider;
