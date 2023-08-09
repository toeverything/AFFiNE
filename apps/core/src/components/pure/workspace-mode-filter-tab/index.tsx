import { RadioButton, RadioButtonGroup } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';

import { allPageModeSelectAtom } from '../../../atoms';

export const WorkspaceModeFilterTab = () => {
  const t = useAFFiNEI18N();
  const [value, setMode] = useAtom(allPageModeSelectAtom);
  const handleValueChange = (value: string) => {
    if (value !== 'all' && value !== 'page' && value !== 'edgeless') {
      throw new Error('Invalid value for page mode option');
    }
    setMode(value);
  };

  return (
    <RadioButtonGroup
      width={300}
      defaultValue={value}
      onValueChange={handleValueChange}
    >
      <RadioButton value="all" style={{ textTransform: 'capitalize' }}>
        {t['all']()}
      </RadioButton>
      <RadioButton value="page">{t['Page']()}</RadioButton>
      <RadioButton value="edgeless">{t['Edgeless']()}</RadioButton>
    </RadioButtonGroup>
  );
};
