import { createContext, useContext, useState, ReactNode } from 'react';
import type { PropsWithChildren } from 'react';
import { Confirm, ConfirmProps } from '@/ui/confirm';

type ConfirmContextValue = {
  confirm: (props: ConfirmProps) => Promise<boolean>;
};
type ConfirmContextProps = PropsWithChildren<Record<string, unknown>>;

export const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({
  children,
}: PropsWithChildren<ConfirmContextProps>) => {
  const [confirmRecord, setConfirmRecord] = useState<Record<string, ReactNode>>(
    {}
  );
  return (
    <ConfirmContext.Provider
      value={{
        confirm: ({ onCancel, onConfirm, ...props }: ConfirmProps) => {
          return new Promise(resolve => {
            const confirmId = String(Date.now());
            const closeHandler = () => {
              delete confirmRecord[confirmId];
              setConfirmRecord({ ...confirmRecord });
            };
            setConfirmRecord(oldConfirmRecord => {
              return {
                ...oldConfirmRecord,
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
              };
            });
          });
        },
      }}
    >
      {children}
      {Object.entries(confirmRecord).map(([confirmId, confirmNode]) => {
        return <div key={confirmId}>{confirmNode}</div>;
      })}
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
