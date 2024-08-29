import {
  Button,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuSub,
} from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon, DoneIcon } from '@blocksuite/icons/rc';
import { useCallback, useMemo } from 'react';

import type { PageDisplayProperties, PageGroupByType } from '../types';
import { useAllDocDisplayProperties } from '../use-all-doc-display-properties';
import * as styles from './page-display-menu.css';

type GroupOption = {
  value: PageGroupByType;
  label: string;
};

export function getGroupOptions(t: ReturnType<typeof useI18n>) {
  return [
    {
      value: 'createDate',
      label: t['Created'](),
    },
    {
      value: 'updatedDate',
      label: t['Updated'](),
    },
    {
      value: 'tag',
      label: t['com.affine.page.display.grouping.group-by-tag'](),
    },
    {
      value: 'favourites',
      label: t['com.affine.page.display.grouping.group-by-favourites'](),
    },
    {
      value: 'none',
      label: t['com.affine.page.display.grouping.no-grouping'](),
    },
  ] satisfies GroupOption[];
}

export const PageDisplayMenu = () => {
  const t = useI18n();
  const [workspaceProperties, setProperties] = useAllDocDisplayProperties();
  const handleSelect = useCallback(
    (value: PageGroupByType) => {
      setProperties('groupBy', value);
    },
    [setProperties]
  );
  const handleSetDocDisplayProperties = useCallback(
    (key: keyof PageDisplayProperties) => {
      setProperties('displayProperties', {
        ...workspaceProperties.displayProperties,
        [key]: !workspaceProperties.displayProperties[key],
      });
    },
    [setProperties, workspaceProperties.displayProperties]
  );
  const propertyOptions: Array<{
    key: keyof PageDisplayProperties;
    onClick: () => void;
    label: string;
  }> = useMemo(() => {
    return [
      {
        key: 'bodyNotes',
        onClick: () => handleSetDocDisplayProperties('bodyNotes'),
        label: t['com.affine.page.display.display-properties.body-notes'](),
      },
      {
        key: 'tags',
        onClick: () => handleSetDocDisplayProperties('tags'),
        label: t['Tags'](),
      },
      {
        key: 'createDate',
        onClick: () => handleSetDocDisplayProperties('createDate'),
        label: t['Created'](),
      },
      {
        key: 'updatedDate',
        onClick: () => handleSetDocDisplayProperties('updatedDate'),
        label: t['Updated'](),
      },
    ];
  }, [handleSetDocDisplayProperties, t]);

  const items = useMemo(() => {
    const groupOptions: GroupOption[] = getGroupOptions(t);

    const subItems = groupOptions.map(option => (
      <MenuItem
        key={option.value}
        onSelect={() => handleSelect(option.value)}
        data-active={workspaceProperties.groupBy === option.value}
        suffixIcon={
          workspaceProperties.groupBy === option.value ? (
            <DoneIcon fontSize={'20px'} />
          ) : null
        }
        className={styles.subMenuItem}
        data-testid={`group-by-${option.value}`}
      >
        <span>{option.label}</span>
      </MenuItem>
    ));

    const currentGroupType = groupOptions.find(
      option => option.value === workspaceProperties.groupBy
    )?.label;

    return (
      <>
        <MenuSub
          subContentOptions={{
            alignOffset: -8,
            sideOffset: 12,
          }}
          triggerOptions={{ className: styles.subMenuTrigger }}
          items={subItems}
        >
          <div
            className={styles.subMenuTriggerContent}
            data-testid="page-display-grouping-menuItem"
          >
            <span>{t['com.affine.page.display.grouping']()}</span>
            <span className={styles.currentGroupType}>{currentGroupType}</span>
          </div>
        </MenuSub>
        <MenuSeparator />
        <div className={styles.listOption}>
          {t['com.affine.page.display.list-option']()}
        </div>
        <div className={styles.properties}>
          {t['com.affine.page.display.display-properties']()}
        </div>
        <div className={styles.propertiesWrapper}>
          {propertyOptions.map(option => (
            <Button
              key={option.label}
              className={styles.propertyButton}
              onClick={option.onClick}
              data-active={!!workspaceProperties.displayProperties[option.key]}
              data-testid={`property-${option.key}`}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </>
    );
  }, [
    handleSelect,
    propertyOptions,
    t,
    workspaceProperties.displayProperties,
    workspaceProperties.groupBy,
  ]);
  return (
    <Menu
      items={items}
      contentOptions={{
        className: styles.menu,

        align: 'end',
      }}
    >
      <Button
        suffix={<ArrowDownSmallIcon />}
        className={styles.headerDisplayButton}
        data-testid="page-display-menu-button"
      >
        {t['com.affine.page.display']()}
      </Button>
    </Menu>
  );
};
