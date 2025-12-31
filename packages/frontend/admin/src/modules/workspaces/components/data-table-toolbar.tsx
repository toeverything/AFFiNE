import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { AdminWorkspaceSort, FeatureType } from '@affine/graphql';
import type { Table } from '@tanstack/react-table';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { FeatureFilterPopover } from '../../../components/shared/feature-filter-popover';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../components/ui/popover';
import { useDebouncedValue } from '../../../hooks/use-debounced-value';
import { useServerConfig } from '../../common';

interface DataTableToolbarProps<TData> {
  table?: Table<TData>;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  selectedFeatures: FeatureType[];
  onFeaturesChange: (features: FeatureType[]) => void;
  sort: AdminWorkspaceSort | undefined;
  onSortChange: (sort: AdminWorkspaceSort | undefined) => void;
  disabled?: boolean;
}

const sortOptions: { value: AdminWorkspaceSort; label: string }[] = [
  { value: AdminWorkspaceSort.SnapshotSize, label: 'Snapshot size' },
  { value: AdminWorkspaceSort.BlobCount, label: 'Blob count' },
  { value: AdminWorkspaceSort.BlobSize, label: 'Blob size' },
  { value: AdminWorkspaceSort.SnapshotCount, label: 'Snapshot count' },
  { value: AdminWorkspaceSort.MemberCount, label: 'Member count' },
  { value: AdminWorkspaceSort.PublicPageCount, label: 'Public pages' },
  { value: AdminWorkspaceSort.CreatedAt, label: 'Created time' },
];

export function DataTableToolbar<TData>({
  keyword,
  onKeywordChange,
  selectedFeatures,
  onFeaturesChange,
  sort,
  onSortChange,
  disabled = false,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = useState(keyword);
  const debouncedValue = useDebouncedValue(value, 400);
  const serverConfig = useServerConfig();
  const availableFeatures = serverConfig.availableWorkspaceFeatures ?? [];

  useEffect(() => {
    setValue(keyword);
  }, [keyword]);

  useEffect(() => {
    onKeywordChange(debouncedValue.trim());
  }, [debouncedValue, onKeywordChange]);

  const onValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.currentTarget.value);
  }, []);

  const handleSortChange = useCallback(
    (value: AdminWorkspaceSort) => {
      onSortChange(value);
    },
    [onSortChange]
  );

  const selectedSortLabel = useMemo(
    () =>
      sortOptions.find(option => option.value === sort)?.label ??
      'Created time',
    [sort]
  );

  return (
    <div className="flex items-center justify-between gap-y-2 gap-x-4 flex-wrap">
      <FeatureFilterPopover
        selectedFeatures={selectedFeatures}
        availableFeatures={availableFeatures}
        onChange={onFeaturesChange}
        align="start"
        disabled={disabled}
      />

      <div className="flex items-center gap-y-2 flex-wrap justify-end gap-2">
        <Popover open={disabled ? false : undefined}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 lg:px-3"
              disabled={disabled}
            >
              Sort: {selectedSortLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <div className="flex flex-col gap-1">
              {sortOptions.map(option => (
                <Button
                  key={option.value}
                  variant="ghost"
                  className="justify-start"
                  size="sm"
                  disabled={disabled}
                  onClick={() => handleSortChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex">
          <Input
            placeholder="Search Workspace / Owner"
            value={value}
            onChange={onValueChange}
            className="h-8 w-[150px] lg:w-[250px]"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
