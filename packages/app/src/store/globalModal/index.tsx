import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { createStore, useStore } from 'zustand';
import { combine, subscribeWithSelector } from 'zustand/middleware';
import { UseBoundStore } from 'zustand/react';
import ContactModal from '@/components/contact-modal';
import ShortcutsModal from '@/components/shortcuts-modal';
import QuickSearch from '@/components/quick-search';
import { LoginModal } from '@/components/login-modal';
import ImportModal from '@/components/import';

export type ModalState = {
  contact: boolean;
  shortcuts: boolean;
  quickSearch: boolean;
  import: boolean;
  login: boolean;
};

export type ModalActions = {
  triggerShortcutsModal: () => void;
  triggerContactModal: () => void;
  triggerQuickSearchModal: (visible?: boolean) => void;
  triggerImportModal: () => void;
  triggerLoginModal: () => void;
};

const create = () =>
  createStore(
    subscribeWithSelector(
      combine<ModalState, ModalActions>(
        {
          contact: false,
          shortcuts: false,
          quickSearch: false,
          import: false,
          login: false,
        },
        set => ({
          triggerShortcutsModal: () => {
            set(({ shortcuts }) => ({
              shortcuts: !shortcuts,
            }));
          },
          triggerContactModal: () => {
            set(({ contact }) => ({
              contact: !contact,
            }));
          },
          triggerQuickSearchModal: (visible?: boolean) => {
            set(({ quickSearch }) => ({
              quickSearch: visible ?? !quickSearch,
            }));
          },
          triggerImportModal: () => {
            set(state => ({
              import: !state.import,
            }));
          },
          triggerLoginModal: () => {
            set(({ login }) => ({
              login: !login,
            }));
          },
        })
      )
    )
  );
type Store = ReturnType<typeof create>;

const ModalContext = createContext<Store | null>(null);

export const useModalApi = () => {
  const api = useContext(ModalContext);
  if (!api) {
    throw new Error('cannot find modal context');
  }
  return api;
};

export const useModal: UseBoundStore<Store> = ((
  selector: Parameters<UseBoundStore<Store>>[0],
  equals: Parameters<UseBoundStore<Store>>[1]
) => {
  const api = useModalApi();
  return useStore(api, selector, equals);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const Modals: React.FC = function Modal() {
  const api = useModalApi();
  return (
    <>
      <ContactModal
        open={useModal(state => state.contact)}
        onClose={() => {
          api.setState({
            contact: false,
          });
        }}
      ></ContactModal>
      <ShortcutsModal
        open={useModal(state => state.shortcuts)}
        onClose={() => {
          api.setState({
            shortcuts: false,
          });
        }}
      ></ShortcutsModal>
      <QuickSearch
        open={useModal(state => state.quickSearch)}
        onClose={() => {
          api.setState({
            quickSearch: false,
          });
        }}
      ></QuickSearch>
      <ImportModal
        open={useModal(state => state.import)}
        onClose={() => {
          api.setState({
            import: false,
          });
        }}
      ></ImportModal>
      <LoginModal
        open={useModal(state => state.login)}
        onClose={() => {
          api.setState({
            login: false,
          });
        }}
      />
    </>
  );
};

export const ModalProvider: React.FC<React.PropsWithChildren> =
  function ModelProvider({ children }) {
    return (
      <ModalContext.Provider value={useMemo(() => create(), [])}>
        <Modals />
        {children}
      </ModalContext.Provider>
    );
  };
