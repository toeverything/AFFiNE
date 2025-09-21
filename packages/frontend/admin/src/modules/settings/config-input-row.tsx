import { Input } from '@affine/admin/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import { Switch } from '@affine/admin/components/ui/switch';
import { useCallback } from 'react';

import { Textarea } from '../../components/ui/textarea';

export type ConfigInputProps = {
  field: string;
  desc: string;
  defaultValue: any;
  onChange: (field: string, value: any) => void;
  error?: string;
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
  }>
> = {
  Boolean: function SwitchInput({ defaultValue, onChange }) {
    const handleSwitchChange = (checked: boolean) => {
      onChange(checked);
    };

    return (
      <Switch
        defaultChecked={defaultValue}
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
        defaultValue={defaultValue}
        onChange={handleInputChange}
      />
    );
  },
  Number: function NumberInput({ defaultValue, onChange }) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseInt(e.target.value));
    };

    return (
      <Input
        type="number"
        defaultValue={defaultValue}
        onChange={handleInputChange}
      />
    );
  },
  JSON: function ObjectInput({ defaultValue, onChange }) {
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      try {
        const value = JSON.parse(e.target.value);
        onChange(value);
      } catch {}
    };

    return (
      <Textarea
        defaultValue={JSON.stringify(defaultValue)}
        onChange={handleInputChange}
        className="w-full"
      />
    );
  },
  Enum: function EnumInput({ defaultValue, onChange, options }) {
    return (
      <Select defaultValue={defaultValue} onValueChange={onChange}>
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
  ...props
}: ConfigInputProps) => {
  const Input = Inputs[type] ?? Inputs.JSON;

  const onValueChange = useCallback(
    (value?: any) => {
      onChange(field, value);
    },
    [field, onChange]
  );

  return (
    <div
      className={`flex justify-between flex-grow space-y-[10px]
         ${type === 'Boolean' ? 'flex-row' : 'flex-col'}`}
    >
      <div
        className="text-base font-bold flex-3"
        dangerouslySetInnerHTML={{ __html: desc }}
      />
      <div className="flex flex-col items-end relative flex-1">
        <Input
          defaultValue={defaultValue}
          onChange={onValueChange}
          error={error}
          {...props}
        />
        {error && (
          <div className="absolute bottom-[-25px] text-sm right-0 break-words text-red-500">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
