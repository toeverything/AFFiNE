import { ThemeEditorService } from '@affine/core/modules/theme-editor';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

let _provided = false;

export const CustomThemeModifier = () => {
  const { themeEditorService, featureFlagService } = useServices({
    ThemeEditorService,
    FeatureFlagService,
  });
  const enableThemeEditor = useLiveData(
    featureFlagService.flags.enable_theme_editor.$
  );
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!enableThemeEditor) return;
    if (_provided) return;

    _provided = true;

    const sub = themeEditorService.customTheme$.subscribe(themeObj => {
      if (!themeObj) return;

      const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
      const valueMap = themeObj[mode];

      // remove previous style
      // TOOD(@CatsJuice): find better way to remove previous style
      document.documentElement.style.cssText = '';
      // recover color scheme set by next-themes
      document.documentElement.style.colorScheme = mode;

      Object.entries(valueMap).forEach(([key, value]) => {
        value && document.documentElement.style.setProperty(key, value);
      });
    });

    return () => {
      _provided = false;
      sub.unsubscribe();
    };
  }, [resolvedTheme, enableThemeEditor, themeEditorService]);

  return null;
};
