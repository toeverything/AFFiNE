import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import type { FeatureType } from '@affine/graphql';
import { ExportIcon, ImportIcon, PlusIcon } from '@blocksuite/icons/rc';
import type { Table } from '@tanstack/react-table';
import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { DiscardChanges } from '../../../components/shared/discard-changes';
import { FeatureFilterPopover } from '../../../components/shared/feature-filter-popover';
import { useDebouncedValue } from '../../../hooks/use-debounced-value';
import { useServerConfig } from '../../common';
import { useRightPanel } from '../../panel/context';
import type { UserType } from '../schema';
import { ExportUsersDialog } from './export-users-dialog';
import { ImportUsersDialog } from './import-users';
import { CreateUserForm } from './user-form';

interface DataTableToolbarProps<TData> {
  selectedUsers: UserType[];
  table?: Table<TData>;
  keyword: string;
  onKeywordChange: Dispatch<SetStateAction<string>>;
  selectedFeatures: FeatureType[];
  onFeaturesChange: Dispatch<SetStateAction<FeatureType[]>>;
}

export function DataTableToolbar<TData>({
  selectedUsers,
  table,
  keyword,
  onKeywordChange,
  selectedFeatures,
  onFeaturesChange,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = useState(keyword);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const debouncedValue = useDebouncedValue(value, 500);
  const {
    setPanelContent,
    openPanel,
    closePanel,
    isOpen,
    hasDirtyChanges,
    setHasDirtyChanges,
  } = useRightPanel();
  const serverConfig = useServerConfig();
  const availableFeatures = serverConfig.availableUserFeatures ?? [];

  const handleConfirm = useCallback(() => {
    setPanelContent(
      <CreateUserForm
        onComplete={closePanel}
        onDirtyChange={setHasDirtyChanges}
      />
    );
    if (dialogOpen) {
      setDialogOpen(false);
    }
    if (!isOpen) {
      openPanel();
    }
  }, [
    setPanelContent,
    closePanel,
    dialogOpen,
    isOpen,
    openPanel,
    setHasDirtyChanges,
  ]);

  useEffect(() => {
    setValue(keyword);
  }, [keyword]);

  useEffect(() => {
    onKeywordChange(debouncedValue.trim());
  }, [debouncedValue, onKeywordChange]);

  const onValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.currentTarget.value);
  }, []);

  const handleFeatureToggle = useCallback(
    (features: FeatureType[]) => {
      onFeaturesChange(features);
    },
    [onFeaturesChange]
  );

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleOpenConfirm = useCallback(() => {
    if (hasDirtyChanges) {
      return setDialogOpen(true);
    }
    return handleConfirm();
  }, [handleConfirm, hasDirtyChanges]);

  const handleExportUsers = useCallback(() => {
    if (!table) return;

    const selectedRows = table.getFilteredSelectedRowModel().rows;

    if (selectedRows.length === 0) {
      alert('Please select at least one user to export');
      return;
    }

    setExportDialogOpen(true);
  }, [table]);

  const handleImportUsers = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  return (
    <div className="flex items-center justify-between gap-y-2 gap-x-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 lg:px-3"
          onClick={handleImportUsers}
        >
          <ImportIcon fontSize={20} />
          <span className="ml-2 hidden md:inline-block">Import</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 lg:px-3"
          onClick={handleExportUsers}
          disabled={
            !table || table.getFilteredSelectedRowModel().rows.length === 0
          }
        >
          <ExportIcon fontSize={20} />
          <span className="ml-2 hidden md:inline-block">Export</span>
        </Button>

        {table && (
          <ExportUsersDialog
            users={selectedUsers}
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
          />
        )}

        <ImportUsersDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
        />
      </div>

      <div className="flex items-center gap-y-2 flex-wrap justify-end gap-2">
        <FeatureFilterPopover
          selectedFeatures={selectedFeatures}
          availableFeatures={availableFeatures}
          onChange={handleFeatureToggle}
          align="end"
        />
        <div className="flex">
          <Input
            placeholder="Search Email / UUID"
            value={value}
            onChange={onValueChange}
            className="h-8 w-[150px] lg:w-[250px]"
          />
        </div>
        <Button
          className="h-8 px-2 lg:px-3 space-x-[6px] text-sm font-medium"
          onClick={handleOpenConfirm}
        >
          <PlusIcon fontSize={20} /> <span>Add User</span>
        </Button>
      </div>

      <DiscardChanges
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
