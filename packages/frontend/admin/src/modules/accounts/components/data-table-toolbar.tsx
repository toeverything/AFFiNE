import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { getUserByEmailQuery } from '@affine/graphql';
import { PlusIcon } from 'lucide-react';
import type { SetStateAction } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRightPanel } from '../../layout';
import { DiscardChanges } from './discard-changes';
import { CreateUserForm } from './user-form';

interface DataTableToolbarProps<TData> {
  data: TData[];
  setDataTable: (data: TData[]) => void;
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
  setDataTable,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedValue = useDebouncedValue(value, 1000);
  const { setRightPanelContent, openPanel, closePanel, isOpen } =
    useRightPanel();
  const { result, query } = useSearch();

  const handleConfirm = useCallback(() => {
    setRightPanelContent(<CreateUserForm onComplete={closePanel} />);
    if (dialogOpen) {
      setDialogOpen(false);
    }
    if (!isOpen) {
      openPanel();
    }
  }, [setRightPanelContent, closePanel, dialogOpen, isOpen, openPanel]);

  useEffect(() => {
    query(debouncedValue);
  }, [debouncedValue, query]);

  useEffect(() => {
    startTransition(() => {
      if (!debouncedValue) {
        setDataTable(data);
      } else if (result) {
        setDataTable([result as TData]);
      } else {
        setDataTable([]);
      }
    });
  }, [data, debouncedValue, result, setDataTable]);

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

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder="Search Email"
          value={value}
          onChange={onValueChange}
          className="h-10 w-full mr-[10px]"
        />
      </div>
      <Button
        className="px-4 py-2 space-x-[10px] text-sm font-medium"
        onClick={handleOpenConfirm}
      >
        <PlusIcon size={20} /> <span>Add User</span>
      </Button>
      <DiscardChanges
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
