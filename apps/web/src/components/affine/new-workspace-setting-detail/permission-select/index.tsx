import { Permission } from '@affine/graphql';
import * as Select from '@radix-ui/react-select';
import {
  forwardRef,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
} from 'react';

import * as style from './index.css';

type SelectItemProps = {
  value: string;
};

const SelectItem = forwardRef<
  HTMLDivElement,
  PropsWithChildren<SelectItemProps>
>(function SelectItem({ children, ...props }, forwardedRef) {
  return (
    <Select.Item {...props} ref={forwardedRef}>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
});

export type PermissionSelectProps = {
  value: Permission;
  onChange: (value: Permission) => void;
};

export const PermissionSelect = (
  props: PermissionSelectProps
): ReactElement => {
  const { onChange } = props;
  return (
    <Select.Root
      value={props.value}
      onValueChange={useCallback(
        (value: Permission) => {
          onChange(value);
        },
        [onChange]
      )}
    >
      <Select.Trigger className={style.trigger}>
        <Select.Value placeholder="Permission" />
        <Select.Icon />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content className={style.content}>
          <Select.Viewport>
            <Select.Group>
              <SelectItem value={Permission.Admin}>Admin</SelectItem>
              <SelectItem value={Permission.Read}>Read</SelectItem>
              <SelectItem value={Permission.Owner}>Owner</SelectItem>
              <SelectItem value={Permission.Write}>Write</SelectItem>
            </Select.Group>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};
