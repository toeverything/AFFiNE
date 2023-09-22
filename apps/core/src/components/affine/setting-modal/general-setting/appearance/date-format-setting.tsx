import { Menu, MenuItem, MenuTrigger } from '@toeverything/components/menu';
import dayjs from 'dayjs';
import { useCallback } from 'react';

import {
  dateFormatOptions,
  type DateFormats,
  useAppSetting,
} from '../../../../../atoms/settings';

interface DateFormatMenuContentProps {
  currentOption: DateFormats;
  onSelect: (option: DateFormats) => void;
}

const DateFormatMenuContent = ({
  onSelect,
  currentOption,
}: DateFormatMenuContentProps) => {
  return (
    <>
      {dateFormatOptions.map(option => {
        return (
          <MenuItem
            key={option}
            selected={currentOption === option}
            onSelect={() => onSelect(option)}
          >
            {dayjs(new Date()).format(option)}
          </MenuItem>
        );
      })}
    </>
  );
};

export const DateFormatSetting = () => {
  const [appearanceSettings, setAppSettings] = useAppSetting();
  const handleSelect = useCallback(
    (option: DateFormats) => {
      setAppSettings({ dateFormat: option });
    },
    [setAppSettings]
  );

  return (
    <Menu
      items={
        <DateFormatMenuContent
          onSelect={handleSelect}
          currentOption={appearanceSettings.dateFormat}
        />
      }
    >
      <MenuTrigger data-testid="date-format-menu-trigger" block>
        {dayjs(new Date()).format(appearanceSettings.dateFormat)}
      </MenuTrigger>
    </Menu>
  );
};
