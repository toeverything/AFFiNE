import { Input } from '@affine/admin/components/ui/input';
import { Switch } from '@affine/admin/components/ui/switch';
import type { RuntimeConfigType } from '@affine/graphql';

export const renderInput = (
  type: RuntimeConfigType,
  value: any,
  onChange: (value?: any) => void
) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  const handleSwitchChange = (checked: boolean) => {
    onChange(checked);
  };
  switch (type) {
    case 'Boolean':
      return <Switch checked={value} onCheckedChange={handleSwitchChange} />;
    case 'String':
      return (
        <Input
          type="text"
          minLength={1}
          value={value}
          onChange={handleInputChange}
        />
      );
    case 'Number':
      return (
        <div style={{ width: '100%' }}>
          <Input type="number" value={value} onChange={handleInputChange} />
        </div>
      );
    // TODO(@JimmFly): add more types
    default:
      return null;
  }
};

export const isEqual = (a: any, b: any) => {
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
};

export const formatValue = (value: any) => {
  if (typeof value === 'object') return JSON.stringify(value);
  return value.toString();
};

export const formatValueForInput = (value: any, type: RuntimeConfigType) => {
  let newValue = null;
  switch (type) {
    case 'Boolean':
      newValue = !!value;
      break;
    case 'String':
      newValue = value;
      break;
    case 'Number':
      newValue = Number(value);
      break;
    case 'Array':
      newValue = value.split(',');
      break;
    case 'Object':
      newValue = JSON.parse(value);
      break;
    default:
      break;
  }
  return newValue;
};
