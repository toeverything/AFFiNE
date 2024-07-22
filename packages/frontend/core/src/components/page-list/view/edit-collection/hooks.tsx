import { Modal } from '@affine/component';
import { useCallback, useState } from 'react';

import type { AllPageListConfig } from './edit-collection';
import { SelectPage } from './select-page';
export const useSelectPage = ({
  allPageListConfig,
}: {
  allPageListConfig: AllPageListConfig;
}) => {
  const [value, onChange] = useState<{
    init: string[];
    onConfirm: (ids: string[]) => void;
  }>();
  const close = useCallback((open: boolean) => {
    if (!open) {
      onChange(undefined);
    }
  }, []);
  const handleCancel = useCallback(() => {
    close(false);
  }, [close]);
  return {
    node: (
      <Modal
        open={!!value}
        onOpenChange={close}
        withoutCloseButton
        width="calc(100% - 32px)"
        height="80%"
        overlayOptions={{ style: { backgroundColor: 'transparent' } }}
        contentOptions={{
          style: {
            padding: 0,
            transform: 'translateY(16px)',
            maxWidth: 976,
            backgroundColor: 'var(--affine-white)',
          },
        }}
      >
        {value ? (
          <SelectPage
            allPageListConfig={allPageListConfig}
            init={value.init}
            onConfirm={value.onConfirm}
            onCancel={handleCancel}
          />
        ) : null}
      </Modal>
    ),
    open: (init: string[]): Promise<string[]> =>
      new Promise<string[]>(res => {
        onChange({
          init,
          onConfirm: list => {
            close(false);
            res(list);
          },
        });
      }),
  };
};
