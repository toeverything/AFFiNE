import {
  AddTextIcon,
  AlignLeftIcon,
  GridIcon,
  HeaderColumnIcon,
  MailPanelIcon,
  PenIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import type { Meta, StoryFn } from '@storybook/react';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { Button } from '../button';
import type { MenuItemProps, MenuProps } from './index';
import { Menu, MenuItem, MenuSeparator, MenuSub } from './index';

export default {
  title: 'UI/Menu',
  component: Menu,
} satisfies Meta<typeof Menu>;

const Template: StoryFn<MenuProps> = args => (
  <Menu {...args}>
    <Button>menu trigger</Button>
  </Menu>
);

interface Items {
  label: ReactNode;
  type?: MenuItemProps['type'];
  prefixIcon?: MenuItemProps['prefixIcon'];
  disabled?: boolean;
  divider?: boolean;
  subItems?: Items[];
  block?: boolean;
}

const items: Items[] = [
  {
    label: 'Значение 1',
    prefixIcon: <MailPanelIcon />,
  },
  {
    label: 'Значение 2',
    prefixIcon: <AlignLeftIcon />,
  },
  {
    label: 'Значение 3',
    prefixIcon: <HeaderColumnIcon />,
    subItems: [
      {
        label: 'Настройки',
        prefixIcon: <SettingsIcon />,
      },
      {
        label: 'Шаблон',
        prefixIcon: <PenIcon />,
        subItems: [
          {
            label: 'Нет иконок у всех',
          },
          {
            label: 'Значение 5',
            divider: true,
          },
          {
            label: 'Значение 6',
            disabled: true,
          },
        ],
      },
      {
        label: 'Нет иконок у одного',
        prefixIcon: ' ',
      },
    ],
  },
  {
    label: 'Значение 4',
    prefixIcon: <GridIcon />,
  },
  {
    label: (
      <Button
        importance="primary"
        size={500}
        style={{
          backgroundColor: '#FF6E44',
          borderColor: '#FF6E44',
          width: '100%',
        }}
        prefix={<AddTextIcon />}
      >
        Кнопка
      </Button>
    ),
    block: true,
  },
];

export const Default: StoryFn<MenuProps> = Template.bind(undefined);

const ItemRender = ({ label, divider, subItems, ...otherProps }: Items) => {
  const onSelect = useCallback(() => {
    console.log('value', label);
  }, [label]);

  if (subItems) {
    return (
      <>
        <MenuSub
          items={subItems.map((props, i) => (
            <ItemRender key={i} {...props} />
          ))}
          triggerOptions={otherProps}
        >
          {label}
        </MenuSub>
        {divider ? <MenuSeparator /> : null}
      </>
    );
  }

  return (
    <>
      <MenuItem onSelect={onSelect} {...otherProps}>
        {label}
      </MenuItem>
      {divider ? <MenuSeparator /> : null}
    </>
  );
};

Default.args = {
  items: items.map((props, i) => {
    return <ItemRender key={i} {...props} />;
  }),
};

const selectList = [
  { name: 'AFFiNE', value: '1' },
  { name: 'blocksuite', value: '2' },
  { name: 'octobase', value: '3' },
  { name: 'virgo', value: '4' },
];
const SelectItems = ({
  selectedValue,
  onSelect,
}: {
  selectedValue: string;
  onSelect: (value: string) => void;
}) => {
  return selectList.map(({ name, value }) => (
    <MenuItem
      key={value}
      selected={selectedValue === value}
      onSelect={() => onSelect(value)}
    >
      {name}
    </MenuItem>
  ));
};

const AsSelectTemplate: StoryFn<MenuProps> = () => {
  const [value, setValue] = useState('1');
  const name = selectList.find(item => item.value === value)?.name;
  return (
    <Menu items={<SelectItems selectedValue={value} onSelect={setValue} />}>
      <Button>selected: {name}</Button>
    </Menu>
  );
};

export const AsSelect: StoryFn<MenuProps> = AsSelectTemplate.bind({});
