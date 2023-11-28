import { RadioButton, RadioButtonGroup } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';

import { allPageModeSelectAtom } from '../../../atoms';
import * as styles from './index.css';

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
    <RadioButtonGroup value={value} onValueChange={handleValueChange}>
      <RadioButton value="all" spanStyle={styles.filterTab}>
        {t['com.affine.pageMode.all']()}
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="page">
        {t['com.affine.pageMode.page']()}
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="edgeless">
        {t['com.affine.pageMode.edgeless']()}
      </RadioButton>
    </RadioButtonGroup>
  );
};
