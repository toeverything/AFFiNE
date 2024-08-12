import { useService } from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import { ThemeEditorService } from '../services/theme-editor';

let _provided = false;

export const useCustomTheme = (target: HTMLElement) => {
  const themeEditor = useService(ThemeEditorService);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!runtimeConfig.enableThemeEditor) return;
    if (_provided) return;

    _provided = true;

    const sub = themeEditor.customTheme$.subscribe(themeObj => {
      if (!themeObj) return;

      const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
      const valueMap = themeObj[mode];

      // remove previous style
      target.style.cssText = '';

      Object.entries(valueMap).forEach(([key, value]) => {
        value && target.style.setProperty(key, value);
      });
    });

    return () => {
      _provided = false;
      sub.unsubscribe();
    };
  }, [resolvedTheme, target.style, themeEditor.customTheme$]);
};

export const CustomThemeModifier = () => {
  useCustomTheme(document.documentElement);

  return null;
};
