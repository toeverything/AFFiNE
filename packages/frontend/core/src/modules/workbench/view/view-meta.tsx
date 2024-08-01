import { useServiceOptional } from '@toeverything/infra';
import { useEffect } from 'react';

import type { ViewIconName } from '../constants';
import { ViewService } from '../services/view';

export const ViewTitle = ({ title }: { title: string }) => {
  const view = useServiceOptional(ViewService)?.view;

  useEffect(() => {
    if (view) {
      view.setTitle(title);
    }
  }, [title, view]);

  return null;
};

export const ViewIcon = ({ icon }: { icon: ViewIconName }) => {
  const view = useServiceOptional(ViewService)?.view;

  useEffect(() => {
    if (view) {
      view.setIcon(icon);
    }
  }, [icon, view]);

  return null;
};
