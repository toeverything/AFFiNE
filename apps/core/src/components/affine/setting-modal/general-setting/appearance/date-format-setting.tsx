import { Menu, MenuItem, MenuTrigger } from '@toeverything/components/menu';
import dayjs from 'dayjs';
import { useCallback, useRef } from 'react';

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
  const ref = useRef(null);
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
      portalOptions={{ container: ref.current }}
    >
      <MenuTrigger ref={ref} data-testid="date-format-menu-trigger" block>
        {dayjs(new Date()).format(appearanceSettings.dateFormat)}
      </MenuTrigger>
    </Menu>
  );
};
