// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DatePicker } from '@blocksuite/blocks/src/_common/components/date-picker/index';
import { createComponent } from '@lit/react';
import React from 'react';

export const BlocksuiteDatePicker = createComponent({
  tagName: 'date-picker',
  elementClass: DatePicker,
  react: React,
  events: {},
});
