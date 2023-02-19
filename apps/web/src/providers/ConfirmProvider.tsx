import { Confirm, ConfirmProps } from '@affine/component';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { createStore, useStore } from 'zustand';
import { combine, subscribeWithSelector } from 'zustand/middleware';
import { UseBoundStore } from 'zustand/react';

type ConfirmActions = {
  confirm: (props: ConfirmProps) => Promise<boolean>;
};

type ConfirmState = {
  record: Record<string, JSX.Element>;
};

const create = () =>
  createStore(
    subscribeWithSelector(
      combine<ConfirmState, ConfirmActions>(
        {
          record: {},
        },
        (set, get) => ({
          confirm: ({ onCancel, onConfirm, ...props }: ConfirmProps) => {
            return new Promise(resolve => {
              const confirmRecord = { ...get().record };
              const confirmId = String(Date.now());
              const closeHandler = () => {
                delete confirmRecord[confirmId];
                set({ record: { ...confirmRecord } });
              };
              set(({ record }) => {
                return {
                  record: {
                    ...record,
                    [confirmId]: (
                      <Confirm
                        {...props}
                        onCancel={() => {
                          closeHandler();
                          onCancel?.();
                          resolve(false);
                        }}
                        onConfirm={() => {
                          closeHandler();
                          onConfirm?.();
                          resolve(true);
                        }}
                      />
                    ),
                  },
                };
              });
            });
          },
        })
      )
    )
  );

type Store = ReturnType<typeof create>;

export const ConfirmContext = createContext<Store | null>(null);

export const useConfirmApi = () => {
  const api = useContext(ConfirmContext);
  if (!api) {
    throw new Error('cannot find confirm context');
  }
  return api;
};

export const useConfirm: UseBoundStore<Store> = ((
  selector: Parameters<UseBoundStore<Store>>[0],
  equals: Parameters<UseBoundStore<Store>>[1]
) => {
  const api = useConfirmApi();
  return useStore(api, selector, equals);
}) as any;

function Records() {
  const conform = useConfirm(store => store.record);
  return (
    <>
      {Object.entries(conform).map(([confirmId, confirmNode]) => {
        return <div key={confirmId}>{confirmNode}</div>;
      })}
    </>
  );
}

export const ConfirmProvider = ({ children }: PropsWithChildren) => {
  return (
    <ConfirmContext.Provider value={useMemo(() => create(), [])}>
      {children}
      <Records />
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
