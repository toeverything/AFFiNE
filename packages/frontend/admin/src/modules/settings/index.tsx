import { Button } from '@affine/admin/components/ui/button';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import { get } from 'lodash-es';
import { CheckIcon } from 'lucide-react';
import { useCallback } from 'react';

import { Header } from '../header';
import { useNav } from '../nav/context';
import {
  ALL_CONFIG_DESCRIPTORS,
  ALL_SETTING_GROUPS,
  type AppConfig,
} from './config';
import { type ConfigInputProps, ConfigRow } from './config-input-row';
import { useAppConfig } from './use-app-config';

export function SettingsPage() {
  const { appConfig, update, save, patchedAppConfig, updates } = useAppConfig();
  const disableSave = Object.keys(updates).length === 0;

  const saveChanges = useCallback(() => {
    if (disableSave) {
      return;
    }
    save();
  }, [save, disableSave]);

  return (
    <div className="h-screen flex-1 flex-col flex">
      <Header
        title="Settings"
        endFix={
          <Button
            type="submit"
            size="icon"
            className="w-7 h-7"
            variant="ghost"
            onClick={saveChanges}
            disabled={disableSave}
          >
            <CheckIcon size={20} />
          </Button>
        }
      />
      <AdminPanel
        onUpdate={update}
        appConfig={appConfig}
        patchedAppConfig={patchedAppConfig}
      />
    </div>
  );
}

const AdminPanel = ({
  appConfig,
  patchedAppConfig,
  onUpdate,
}: {
  appConfig: AppConfig;
  patchedAppConfig: AppConfig;
  onUpdate: (path: string, value: any) => void;
}) => {
  const { currentModule } = useNav();
  const group = ALL_SETTING_GROUPS.find(
    group => group.module === currentModule
  );

  if (!group) {
    return null;
  }

  const { name, module, fields, operations } = group;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col h-full gap-5 py-5 px-6 w-full max-w-[800px] mx-auto">
        <div className="text-2xl font-semibold">{name}</div>
        <div className="flex flex-col gap-10" id={`config-module-${module}`}>
          {fields.map(field => {
            let desc: string;
            let props: ConfigInputProps;
            if (typeof field === 'string') {
              const descriptor = ALL_CONFIG_DESCRIPTORS[module][field];
              desc = descriptor.desc;
              props = {
                field: `${module}/${field}`,
                desc,
                type: descriptor.type,
                options: [],
                defaultValue: get(appConfig[module], field),
                onChange: onUpdate,
              };
            } else {
              const descriptor = ALL_CONFIG_DESCRIPTORS[module][field.key];

              props = {
                field: `${module}/${field.key}${field.sub ? `/${field.sub}` : ''}`,
                desc: field.desc ?? descriptor.desc,
                type: field.type ?? descriptor.type,
                // @ts-expect-error for enum type
                options: field.options,
                defaultValue: get(
                  appConfig[module],
                  field.key + (field.sub ? '.' + field.sub : '')
                ),
                onChange: onUpdate,
              };
            }

            return <ConfigRow key={props.field} {...props} />;
          })}
          {operations?.map(Operation => (
            <Operation key={Operation.name} appConfig={patchedAppConfig} />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};
