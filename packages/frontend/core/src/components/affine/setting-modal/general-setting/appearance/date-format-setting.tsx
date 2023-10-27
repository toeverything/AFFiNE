import { Menu, MenuItem, MenuTrigger } from '@toeverything/components/menu';
import dayjs from 'dayjs';
import { useCallback } from 'react';

import {
  dateFormatOptions,
  type DateFormats,
} from '../../../../../atoms/settings';
import { useAppSettingHelper } from '../../../../../hooks/affine/use-app-setting-helper';

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
  const { appSettings, updateSettings } = useAppSettingHelper();
  const handleSelect = useCallback(
    (option: DateFormats) => {
      updateSettings('dateFormat', option);
    },
    [updateSettings]
  );

  return (
    <Menu
      items={
        <DateFormatMenuContent
          onSelect={handleSelect}
          currentOption={appSettings.dateFormat}
        />
      }
    >
      <MenuTrigger data-testid="date-format-menu-trigger" block>
        {dayjs(new Date()).format(appSettings.dateFormat)}
      </MenuTrigger>
    </Menu>
  );
};
