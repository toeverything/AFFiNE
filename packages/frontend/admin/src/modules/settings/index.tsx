import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@affine/admin/components/ui/accordion';
import { Button } from '@affine/admin/components/ui/button';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import { get } from 'lodash-es';
import { useCallback, useState } from 'react';

import { Header } from '../header';
import {
  ALL_CONFIG_DESCRIPTORS,
  ALL_SETTING_GROUPS,
  type AppConfig,
} from './config';
import { type ConfigInputProps, ConfigRow } from './config-input-row';
import { useAppConfig } from './use-app-config';

export function SettingsPage() {
  const {
    appConfig,
    update,
    saveGroup,
    resetGroup,
    patchedAppConfig,
    isGroupDirty,
    isGroupSaving,
    getGroupVersion,
  } = useAppConfig();
  const [expandedModules, setExpandedModules] = useState<string[]>([]);

  return (
    <div className="flex h-dvh flex-1 flex-col bg-background">
      <Header title="Settings" />
      <AdminPanel
        expandedModules={expandedModules}
        onExpandedModulesChange={setExpandedModules}
        onUpdate={update}
        appConfig={appConfig}
        patchedAppConfig={patchedAppConfig}
        onSaveGroup={saveGroup}
        onResetGroup={resetGroup}
        isGroupDirty={isGroupDirty}
        isGroupSaving={isGroupSaving}
        getGroupVersion={getGroupVersion}
      />
    </div>
  );
}

const AdminPanel = ({
  expandedModules,
  onExpandedModulesChange,
  appConfig,
  patchedAppConfig,
  onUpdate,
  onSaveGroup,
  onResetGroup,
  isGroupDirty,
  isGroupSaving,
  getGroupVersion,
}: {
  expandedModules: string[];
  onExpandedModulesChange: (modules: string[]) => void;
  appConfig: AppConfig;
  patchedAppConfig: AppConfig;
  onUpdate: (path: string, value: any) => void;
  onSaveGroup: (module: string) => Promise<void>;
  onResetGroup: (module: string) => void;
  isGroupDirty: (module: string) => boolean;
  isGroupSaving: (module: string) => boolean;
  getGroupVersion: (module: string) => number;
}) => {
  const [groupErrors, setGroupErrors] = useState<
    Record<string, Record<string, string>>
  >({});

  const onFieldErrorChange = useCallback((field: string, error?: string) => {
    const [module] = field.split('/');
    if (!module) {
      return;
    }

    setGroupErrors(prev => {
      const moduleErrors = prev[module] ?? {};

      if (error) {
        if (moduleErrors[field] === error) {
          return prev;
        }
        return {
          ...prev,
          [module]: {
            ...moduleErrors,
            [field]: error,
          },
        };
      }

      if (!(field in moduleErrors)) {
        return prev;
      }

      const nextModuleErrors = { ...moduleErrors };
      delete nextModuleErrors[field];

      if (Object.keys(nextModuleErrors).length === 0) {
        const next = { ...prev };
        delete next[module];
        return next;
      }

      return {
        ...prev,
        [module]: nextModuleErrors,
      };
    });
  }, []);

  const clearModuleErrors = useCallback((module: string) => {
    setGroupErrors(prev => {
      if (!prev[module]) {
        return prev;
      }

      const next = { ...prev };
      delete next[module];
      return next;
    });
  }, []);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-6 py-5">
        <Accordion
          type="multiple"
          className="w-full"
          value={expandedModules}
          onValueChange={onExpandedModulesChange}
        >
          {ALL_SETTING_GROUPS.map(group => {
            const { name, module, fields, operations } = group;
            const dirty = isGroupDirty(module);
            const saving = isGroupSaving(module);
            const sourceConfig = patchedAppConfig[module] ?? appConfig[module];
            const version = getGroupVersion(module);
            const hasValidationError = Boolean(
              groupErrors[module] &&
              Object.keys(groupErrors[module] ?? {}).length > 0
            );

            return (
              <AccordionItem
                key={module}
                value={module}
                id={`config-module-${module}`}
                className="mb-4 rounded-xl border border-border/60 bg-card px-5 shadow-1"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex flex-col items-start text-left gap-1">
                    <div className="text-base font-semibold">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      Manage {name.toLowerCase()} settings
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-2 pb-2 px-1">
                  <div
                    className="flex flex-col gap-8"
                    key={`${module}-${version}`}
                  >
                    {fields.map(field => {
                      let props: ConfigInputProps;
                      if (typeof field === 'string') {
                        const descriptor =
                          ALL_CONFIG_DESCRIPTORS[module][field];
                        props = {
                          field: `${module}/${field}`,
                          desc: descriptor.desc,
                          type: descriptor.type,
                          options: [],
                          defaultValue: get(sourceConfig, field),
                          onChange: onUpdate,
                        };
                      } else {
                        const descriptor =
                          ALL_CONFIG_DESCRIPTORS[module][field.key];
                        props = {
                          field: `${module}/${field.key}${field.sub ? `/${field.sub}` : ''}`,
                          desc: field.desc ?? descriptor.desc,
                          type: field.type ?? descriptor.type,
                          // @ts-expect-error for enum type
                          options: field.options,
                          defaultValue: get(
                            sourceConfig,
                            field.key + (field.sub ? '.' + field.sub : '')
                          ),
                          onChange: onUpdate,
                        };
                      }

                      return (
                        <ConfigRow
                          key={props.field}
                          {...props}
                          onErrorChange={onFieldErrorChange}
                        />
                      );
                    })}

                    {operations?.map(Operation => (
                      <Operation
                        key={Operation.name}
                        appConfig={patchedAppConfig}
                      />
                    ))}

                    <div className="flex justify-end gap-2">
                      {dirty ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 min-w-[88px]"
                          onClick={() => {
                            onResetGroup(module);
                            clearModuleErrors(module);
                          }}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="h-9 min-w-[88px]"
                        onClick={() => {
                          onSaveGroup(module).catch(err => {
                            console.error(err);
                          });
                        }}
                        disabled={!dirty || saving || hasValidationError}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </ScrollArea>
  );
};
