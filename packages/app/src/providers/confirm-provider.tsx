import { createContext, useContext, useState, ReactNode } from 'react';
import type { PropsWithChildren } from 'react';
import { Confirm, ConfirmProps } from '@/ui/confirm';

type ConfirmContextValue = {
  confirm: (props: ConfirmProps) => void;
};
type ConfirmContextProps = PropsWithChildren<{}>;

export const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => {},
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
        confirm: (props: ConfirmProps) => {
          const confirmId = String(Date.now());
          setConfirmRecord(oldConfirmRecord => {
            return {
              ...oldConfirmRecord,
              [confirmId]: (
                <Confirm
                  {...props}
                  onClose={() => {
                    delete confirmRecord[confirmId];
                    setConfirmRecord({ ...confirmRecord });
                  }}
                />
              ),
            };
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
