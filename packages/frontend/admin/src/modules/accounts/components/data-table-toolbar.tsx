import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { useQuery } from '@affine/admin/use-query';
import { getUserByEmailQuery } from '@affine/graphql';
import { ExportIcon, ImportIcon, PlusIcon } from '@blocksuite/icons/rc';
import type { Table } from '@tanstack/react-table';
import type { Dispatch, SetStateAction } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRightPanel } from '../../panel/context';
import type { UserType } from '../schema';
import { DiscardChanges } from './discard-changes';
import { ExportUsersDialog } from './export-users-dialog';
import { ImportUsersDialog } from './import-users';
import { CreateUserForm } from './user-form';

interface DataTableToolbarProps<TData> {
  data: TData[];
  usersCount: number;
  selectedUsers: UserType[];
  setDataTable: (data: TData[]) => void;
  setRowCount: (rowCount: number) => void;
  setMemoUsers: Dispatch<SetStateAction<UserType[]>>;
  table?: Table<TData>;
}

const useSearch = () => {
  const [value, setValue] = useState('');
  const { data } = useQuery({
    query: getUserByEmailQuery,
    variables: { email: value },
  });

  const result = useMemo(() => data?.userByEmail, [data]);

  return {
    result,
    query: setValue,
  };
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function DataTableToolbar<TData>({
  data,
  usersCount,
  selectedUsers,
  setDataTable,
  setRowCount,
  setMemoUsers,
  table,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const debouncedValue = useDebouncedValue(value, 1000);
  const { setPanelContent, openPanel, closePanel, isOpen } = useRightPanel();
  const { result, query } = useSearch();

  const handleConfirm = useCallback(() => {
    setPanelContent(<CreateUserForm onComplete={closePanel} />);
    if (dialogOpen) {
      setDialogOpen(false);
    }
    if (!isOpen) {
      openPanel();
    }
  }, [setPanelContent, closePanel, dialogOpen, isOpen, openPanel]);

  useEffect(() => {
    query(debouncedValue);
  }, [debouncedValue, query]);

  useEffect(() => {
    startTransition(() => {
      if (!debouncedValue) {
        setDataTable(data);
        setRowCount(usersCount);
      } else if (result) {
        setMemoUsers(prev => [...new Set([...prev, result])]);
        setDataTable([result as TData]);
        setRowCount(1);
      } else {
        setDataTable([]);
        setRowCount(0);
      }
    });
  }, [
    data,
    debouncedValue,
    result,
    setDataTable,
    setMemoUsers,
    setRowCount,
    usersCount,
  ]);

  const onValueChange = useCallback(
    (e: { currentTarget: { value: SetStateAction<string> } }) => {
      setValue(e.currentTarget.value);
    },
    []
  );

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleOpenConfirm = useCallback(() => {
    if (isOpen) {
      return setDialogOpen(true);
    }
    return handleConfirm();
  }, [handleConfirm, isOpen]);

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
        <div className="flex">
          <Input
            placeholder="Search Email"
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
