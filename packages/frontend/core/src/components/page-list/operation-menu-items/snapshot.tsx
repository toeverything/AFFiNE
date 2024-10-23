import { MenuItem, MenuSeparator, MenuSub } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ExportIcon, ImportIcon, ToneIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import { transitionStyle } from './index.css';

interface SnapshotMenuItemProps<T> {
  onSelect: () => void;
  className?: string;
  type: T;
  icon: ReactNode;
  label: string;
}

interface SnapshotProps {
  snapshotActionHandler: (action: 'import' | 'export' | 'disable') => void;
  className?: string;
}

export function SnapshotMenuItem<T>({
  onSelect,
  className,
  type,
  icon,
  label,
}: SnapshotMenuItemProps<T>) {
  return (
    <MenuItem
      className={className}
      data-testid={`snapshot-${type}`}
      onSelect={onSelect}
      block
      prefixIcon={icon}
    >
      {label}
    </MenuItem>
  );
}

export const DisableSnapshotMenuItems = ({
  snapshotActionHandler,
  className = transitionStyle,
}: SnapshotProps) => {
  const t = useI18n();
  return (
    <SnapshotMenuItem
      onSelect={() => snapshotActionHandler('disable')}
      className={className}
      type="disable"
      icon={<ToneIcon />}
      label={t['Disable Snapshot']()}
    />
  );
};

export const SnapshotMenuItems = ({
  snapshotActionHandler,
  className = transitionStyle,
}: SnapshotProps) => {
  const t = useI18n();
  return (
    <>
      <SnapshotMenuItem
        onSelect={() => snapshotActionHandler('import')}
        className={className}
        type="import"
        icon={<ImportIcon />}
        label={t['Import']()}
      />
      <SnapshotMenuItem
        onSelect={() => snapshotActionHandler('export')}
        className={className}
        type="export"
        icon={<ExportIcon />}
        label={t['Export']()}
      />
    </>
  );
};

export const Snapshot = ({
  snapshotActionHandler,
  className,
}: SnapshotProps) => {
  const t = useI18n();
  const items = (
    <>
      <SnapshotMenuItems
        snapshotActionHandler={snapshotActionHandler}
        className={className}
      />
      <MenuSeparator />
      <DisableSnapshotMenuItems
        snapshotActionHandler={snapshotActionHandler}
        className={className}
      />
    </>
  );

  return (
    <MenuSub
      items={items}
      triggerOptions={{
        className: transitionStyle,
        prefixIcon: <ToneIcon />,
        ['data-testid' as string]: 'snapshot-menu',
      }}
      subOptions={{}}
    >
      {t['Snapshot']()}
    </MenuSub>
  );
};
