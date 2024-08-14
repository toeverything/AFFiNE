import { Button } from '@affine/admin/components/ui/button';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import { Separator } from '@affine/admin/components/ui/separator';
import type { RuntimeConfigType } from '@affine/graphql';
import { CheckIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { useNav } from '../nav/context';
import { ConfirmChanges } from './confirm-changes';
import { RuntimeSettingRow } from './runtime-setting-row';
import { useGetServerRuntimeConfig } from './use-get-server-runtime-config';
import { useUpdateServerRuntimeConfigs } from './use-update-server-runtime-config';
import {
  formatValue,
  formatValueForInput,
  isEqual,
  renderInput,
} from './utils';

export type ModifiedValues = {
  id: string;
  expiredValue: any;
  newValue: any;
};

export function SettingsPage() {
  const { trigger } = useUpdateServerRuntimeConfigs();
  const { serverRuntimeConfig } = useGetServerRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [configValues, setConfigValues] = useState(
    serverRuntimeConfig.reduce(
      (acc, config) => {
        acc[config.id] = config.value;
        return acc;
      },
      {} as Record<string, any>
    )
  );
  const modifiedValues: ModifiedValues[] = useMemo(() => {
    return serverRuntimeConfig
      .filter(config => !isEqual(config.value, configValues[config.id]))
      .map(config => ({
        id: config.id,
        key: config.key,
        expiredValue: config.value,
        newValue: configValues[config.id],
      }));
  }, [configValues, serverRuntimeConfig]);
  const handleSave = useCallback(() => {
    // post value example: { "key1": "newValue1","key2": "newValue2"}
    const updates: Record<string, any> = {};

    modifiedValues.forEach(item => {
      if (item.id && item.newValue !== undefined) {
        updates[item.id] = item.newValue;
      }
    });
    trigger({ updates });
  }, [modifiedValues, trigger]);

  const disableSave = modifiedValues.length === 0;
  const onOpen = useCallback(() => setOpen(true), [setOpen]);
  const onClose = useCallback(() => setOpen(false), [setOpen]);
  const onConfirm = useCallback(() => {
    if (disableSave) {
      return;
    }
    handleSave();
    onClose();
  }, [disableSave, handleSave, onClose]);
  return (
    <div className=" h-screen flex-1 flex-col flex">
      <div className="flex items-center justify-between px-6 py-3 max-md:ml-9">
        <div className="text-base font-medium">Settings</div>
        <Button
          type="submit"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={onOpen}
          disabled={disableSave}
        >
          <CheckIcon size={20} />
        </Button>
      </div>
      <Separator />
      <AdminPanel
        configValues={configValues}
        setConfigValues={setConfigValues}
      />
      <ConfirmChanges
        modifiedValues={modifiedValues}
        open={open}
        onOpenChange={setOpen}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </div>
  );
}

export const AdminPanel = ({
  setConfigValues,
  configValues,
}: {
  setConfigValues: Dispatch<SetStateAction<Record<string, any>>>;
  configValues: Record<string, any>;
}) => {
  const { configGroup } = useGetServerRuntimeConfig();

  const { currentModule } = useNav();

  const handleInputChange = useCallback(
    (key: string, value: any, type: RuntimeConfigType) => {
      const newValue = formatValueForInput(value, type);
      setConfigValues(prevValues => ({
        ...prevValues,
        [key]: newValue,
      }));
    },
    [setConfigValues]
  );

  return (
    <ScrollArea>
      <div className="flex flex-col h-full gap-3 py-5 px-6 w-full">
        {configGroup
          .filter(group => group.moduleName === currentModule)
          .map(group => {
            const { moduleName, configs } = group;
            return (
              <div
                className="flex flex-col gap-5"
                id={moduleName}
                key={moduleName}
              >
                <div className="text-xl font-semibold">{moduleName}</div>
                {configs?.map((config, index) => {
                  const { id, type, description, updatedAt } = config;
                  const isValueEqual = isEqual(config.value, configValues[id]);
                  const formatServerValue = formatValue(config.value);
                  const formatCurrentValue = formatValue(configValues[id]);
                  return (
                    <div key={id} className="flex flex-col gap-10">
                      {index !== 0 && <Separator />}
                      <RuntimeSettingRow
                        key={id}
                        id={id}
                        description={description}
                        lastUpdatedTime={updatedAt}
                        operation={renderInput(type, configValues[id], value =>
                          handleInputChange(id, value, type)
                        )}
                      >
                        <div style={{ opacity: isValueEqual ? 0 : 1 }}>
                          <span
                            className="line-through"
                            style={{
                              color: 'rgba(198, 34, 34, 1)',
                              backgroundColor: 'rgba(254, 213, 213, 1)',
                            }}
                          >
                            {formatServerValue}
                          </span>{' '}
                          =&gt;{' '}
                          <span
                            style={{
                              color: 'rgba(20, 147, 67, 1)',
                              backgroundColor: 'rgba(225, 250, 177, 1)',
                            }}
                          >
                            {formatCurrentValue}
                          </span>
                        </div>
                      </RuntimeSettingRow>
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </ScrollArea>
  );
};

export { SettingsPage as Component };
