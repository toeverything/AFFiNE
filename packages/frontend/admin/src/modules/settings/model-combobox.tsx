import { Button } from '@affine/admin/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@affine/admin/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@affine/admin/components/ui/popover';
import { cn } from '@affine/admin/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { ModelGroup } from './use-copilot-models';

export function ModelCombobox({
  value,
  onChange,
  groups,
  placeholder = 'Select model...',
}: {
  value: string;
  onChange: (model: string) => void;
  groups: ModelGroup[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const handleSelect = useCallback(
    (model: string) => {
      onChange(model);
      setOpen(false);
      setSearch('');
    },
    [onChange]
  );

  const handleUseCustom = useCallback(() => {
    if (search.trim()) {
      onChange(search.trim());
      setOpen(false);
      setSearch('');
    }
  }, [search, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value || (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search or type model ID..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  className="w-full px-2 py-1.5 text-sm text-left cursor-pointer hover:bg-accent rounded-sm"
                  onClick={handleUseCustom}
                >
                  Use &ldquo;{search.trim()}&rdquo;
                </button>
              ) : (
                'No models found.'
              )}
            </CommandEmpty>
            {groups.map(group =>
              group.models.length > 0 ? (
                <CommandGroup
                  key={group.profileId}
                  heading={`${group.provider} (${group.profileId})`}
                >
                  {group.models.map(model => (
                    <CommandItem
                      key={`${group.profileId}:${model}`}
                      value={`${group.profileId}:${model}`}
                      onSelect={() => handleSelect(model)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === model ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {model}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
