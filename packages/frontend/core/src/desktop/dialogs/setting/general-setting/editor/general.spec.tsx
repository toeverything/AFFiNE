/**
 * @vitest-environment happy-dom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const editorSettingSet = vi.fn();

const editorSettingService = {
  editorSetting: {
    ['settings$']: {
      value: {
        autoTitleNewDocWithCurrentDate: true,
        newDocDateTitleFormat: 'DD-MM-YYYY',
      },
    },
    set: editorSettingSet,
  },
};

vi.mock('@affine/i18n', () => {
  const translations: Record<string, string> = {
    'com.affine.settings.editorSettings.general.auto-date-title.title':
      'Auto-title new docs with current date',
    'com.affine.settings.editorSettings.general.auto-date-title.description':
      "Automatically title blank new docs with today's date.",
    'com.affine.settings.editorSettings.general.auto-date-title.format.title':
      'New doc date format',
    'com.affine.settings.editorSettings.general.auto-date-title.format.description':
      'Choose the date format used for automatic new doc titles.',
    'com.affine.settings.editorSettings.general.auto-date-title.format.dd-mm-yyyy':
      'DD-MM-YYYY',
    'com.affine.settings.editorSettings.general.auto-date-title.format.mm-dd-yyyy':
      'MM-DD-YYYY',
    'com.affine.settings.editorSettings.general.auto-date-title.format.yyyy-mm-dd':
      'YYYY-MM-DD',
    'com.affine.settings.editorSettings.general.auto-date-title.format.journal':
      'Journal style (localized)',
  };

  const useI18n = () =>
    new Proxy(
      {},
      {
        get: (_, key: string) => {
          if (key === 't') {
            return (translationKey: string) =>
              translations[translationKey] ?? translationKey;
          }
          return () => translations[key] ?? key;
        },
      }
    );

  return {
    Trans: ({ children }: PropsWithChildren) => children,
    useI18n,
  };
});

vi.mock('@toeverything/infra', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    useLiveData: (value: { value: unknown } | unknown) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return value.value;
      }
      return value;
    },
    useService: vi.fn(),
    useServices: () => ({
      editorSettingService,
    }),
  };
});

import { NewDocDateTitleSettings } from './general';

describe('NewDocDateTitleSettings', () => {
  beforeEach(() => {
    editorSettingSet.mockReset();
    editorSettingService.editorSetting['settings$'].value = {
      autoTitleNewDocWithCurrentDate: true,
      newDocDateTitleFormat: 'DD-MM-YYYY',
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('persists the auto title toggle through EditorSettingService', () => {
    render(<NewDocDateTitleSettings />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(editorSettingSet).toHaveBeenCalledWith(
      'autoTitleNewDocWithCurrentDate',
      false
    );
  });

  test('persists the selected date format through EditorSettingService', () => {
    render(<NewDocDateTitleSettings />);

    fireEvent.pointerDown(
      screen.getByTestId('new-doc-date-title-format-trigger')
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'YYYY-MM-DD' }));

    expect(editorSettingSet).toHaveBeenCalledWith(
      'newDocDateTitleFormat',
      'YYYY-MM-DD'
    );
  });

  test('renders all supported date format options', () => {
    render(<NewDocDateTitleSettings />);

    const trigger = screen.getByTestId('new-doc-date-title-format-trigger');

    expect(trigger.textContent).toContain('DD-MM-YYYY');

    fireEvent.pointerDown(trigger);

    expect(screen.getByRole('menuitem', { name: 'DD-MM-YYYY' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'MM-DD-YYYY' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'YYYY-MM-DD' })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Journal style (localized)' })
    ).toBeTruthy();
  });

  test('hides the date format row when auto title is disabled', () => {
    editorSettingService.editorSetting['settings$'].value = {
      autoTitleNewDocWithCurrentDate: false,
      newDocDateTitleFormat: 'DD-MM-YYYY',
    };

    render(<NewDocDateTitleSettings />);

    expect(
      screen.queryByTestId('new-doc-date-title-format-trigger')
    ).toBeNull();
    expect(screen.queryByText('New doc date format')).toBeNull();
  });
});
