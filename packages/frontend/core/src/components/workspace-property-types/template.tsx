import { Checkbox, PropertyValue } from '@affine/component';
import { DocService } from '@affine/core/modules/doc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ChangeEvent, useCallback } from 'react';

import type { PropertyValueProps } from '../properties/types';
import * as styles from './template.css';

export const TemplateValue = ({ readonly }: PropertyValueProps) => {
  const docService = useService(DocService);

  const isTemplate = useLiveData(
    docService.doc.record.properties$.selector(p => p.isTemplate)
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (readonly) return;
      const value = e.target.checked;
      docService.doc.record.setProperty('isTemplate', value);
    },
    [docService.doc.record, readonly]
  );

  const toggle = useCallback(() => {
    if (readonly) return;
    docService.doc.record.setProperty('isTemplate', !isTemplate);
  }, [docService.doc.record, isTemplate, readonly]);

  return (
    <PropertyValue className={styles.property} onClick={toggle} readonly>
      <Checkbox
        data-testid="toggle-template-checkbox"
        checked={!!isTemplate}
        onChange={onChange}
        className={styles.checkbox}
        disabled={readonly}
      />
    </PropertyValue>
  );
};
