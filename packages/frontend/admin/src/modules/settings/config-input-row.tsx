import { Input } from '@affine/admin/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import { Switch } from '@affine/admin/components/ui/switch';
import { cn } from '@affine/admin/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Textarea } from '../../components/ui/textarea';

export type ConfigInputProps = {
  field: string;
  desc: string;
  defaultValue: any;
  onChange: (field: string, value: any) => void;
  error?: string;
  onErrorChange?: (field: string, error?: string) => void;
} & (
  | {
      type: 'String' | 'Number' | 'Boolean' | 'JSON';
    }
  | {
      type: 'Enum';
      options: string[];
    }
);

const Inputs: Record<
  ConfigInputProps['type'],
  React.ComponentType<{
    defaultValue: any;
    onChange: (value?: any) => void;
    options?: string[];
    error?: string;
    onValidationChange?: (error?: string) => void;
  }>
> = {
  Boolean: function SwitchInput({ defaultValue, onChange }) {
    const handleSwitchChange = (checked: boolean) => {
      onChange(checked);
    };

    return (
      <Switch
        checked={Boolean(defaultValue)}
        onCheckedChange={handleSwitchChange}
      />
    );
  },
  String: function StringInput({ defaultValue, onChange }) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    return (
      <Input
        type="text"
        minLength={1}
        value={defaultValue ?? ''}
        onChange={handleInputChange}
      />
    );
  },
  Number: function NumberInput({ defaultValue, onChange }) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      onChange(next === '' ? undefined : parseInt(next, 10));
    };

    return (
      <Input
        type="number"
        value={defaultValue ?? ''}
        onChange={handleInputChange}
      />
    );
  },
  JSON: function ObjectInput({
    defaultValue,
    onChange,
    error,
    onValidationChange,
  }) {
    const fallbackText = useMemo(
      () =>
        typeof defaultValue === 'string'
          ? defaultValue
          : JSON.stringify(defaultValue ?? null),
      [defaultValue]
    );
    const [text, setText] = useState(fallbackText);

    useEffect(() => {
      setText(fallbackText);
    }, [fallbackText]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextText = e.target.value;
      setText(nextText);
      try {
        const value = JSON.parse(nextText);
        onValidationChange?.(undefined);
        onChange(value);
      } catch {
        onValidationChange?.('Invalid JSON format');
        // Keep the draft "dirty" even when JSON is temporarily invalid
        // so Save/Cancel state can reflect real editing progress.
        onChange(nextText);
      }
    };

    return (
      <Textarea
        value={text}
        onChange={handleInputChange}
        className={cn(
          'w-full',
          error
            ? 'border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20'
            : undefined
        )}
      />
    );
  },
  Enum: function EnumInput({ defaultValue, onChange, options }) {
    return (
      <Select
        value={typeof defaultValue === 'string' ? defaultValue : undefined}
        onValueChange={onChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {options?.map(option => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
};

export const ConfigRow = ({
  field,
  desc,
  type,
  defaultValue,
  onChange,
  error,
  onErrorChange,
  ...props
}: ConfigInputProps) => {
  const Input = Inputs[type] ?? Inputs.JSON;
  const [validationError, setValidationError] = useState<string>();

  const onValueChange = useCallback(
    (value?: any) => {
      onChange(field, value);
    },
    [field, onChange]
  );

  const onValidationChange = useCallback((nextError?: string) => {
    setValidationError(nextError);
  }, []);

  const mergedError = error ?? validationError;

  useEffect(() => {
    onErrorChange?.(field, mergedError);
    return () => {
      onErrorChange?.(field, undefined);
    };
  }, [field, mergedError, onErrorChange]);

  return (
    <div
      className={cn(
        'flex flex-grow gap-3',
        type === 'Boolean' ? 'items-start justify-between' : 'flex-col'
      )}
    >
      <div
        className="flex-3 text-sm font-semibold leading-6 text-foreground"
        dangerouslySetInnerHTML={{ __html: desc }}
      />
      <div
        className={cn(
          'relative flex flex-1 flex-col',
          type === 'Boolean' ? 'items-end' : 'items-stretch'
        )}
      >
        <Input
          defaultValue={defaultValue}
          onChange={onValueChange}
          error={mergedError}
          onValidationChange={onValidationChange}
          {...props}
        />
        {mergedError && (
          <div className="mt-1 w-full break-words text-sm text-destructive">
            {mergedError}
          </div>
        )}
      </div>
    </div>
  );
};
