/**
 * @vitest-environment happy-dom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';
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

vi.mock('@affine/component', async () => {
  const React = await import('react');
  const MockScrollableViewport = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >((props, ref) => <div ref={ref} {...props} />);
  MockScrollableViewport.displayName = 'MockScrollableViewport';

  return {
    Loading: () => null,
    Menu: ({
      children,
      items,
    }: React.PropsWithChildren<{ items: React.ReactNode }>) => (
      <div>
        {children}
        <div>{items}</div>
      </div>
    ),
    MenuItem: ({
      children,
      onSelect,
      ...props
    }: React.PropsWithChildren<{
      onSelect?: () => void;
    }>) => (
      <button type="button" onClick={onSelect} {...props}>
        {children}
      </button>
    ),
    MenuSeparator: () => null,
    MenuTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props} />
    ),
    RadioGroup: () => null,
    RowInput: () => null,
    Scrollable: {
      Root: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      Viewport: MockScrollableViewport,
      Scrollbar: () => null,
    },
    Slider: () => null,
    Switch: ({
      checked,
      onChange,
    }: {
      checked: boolean;
      onChange: (checked: boolean) => void;
    }) => (
      <input
        aria-label="toggle"
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
    ),
    useConfirmModal: () => ({
      openConfirmModal: vi.fn(),
    }),
  };
});

vi.mock('@affine/component/setting-components', () => {
  return {
    SettingRow: ({
      name,
      desc,
      children,
    }: PropsWithChildren<{ name: string; desc: ReactNode }>) => (
      <section>
        <h2>{name}</h2>
        <div>{desc}</div>
        {children}
      </section>
    ),
    SettingWrapper: ({ children }: PropsWithChildren) => <div>{children}</div>,
  };
});

vi.mock('@affine/core/components/hooks/affine-async-hooks', () => ({
  useAsyncCallback: (fn: (...args: never[]) => Promise<unknown>) => fn,
}));

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
        get: (_, key: string) => () => translations[key] ?? key,
      }
    );

  return {
    Trans: ({ children }: PropsWithChildren) => children,
    useI18n,
  };
});

vi.mock('@toeverything/infra', async importOriginal => {
  const actual = await importOriginal();

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

    fireEvent.click(screen.getByLabelText('toggle'));

    expect(editorSettingSet).toHaveBeenCalledWith(
      'autoTitleNewDocWithCurrentDate',
      false
    );
  });

  test('persists the selected date format through EditorSettingService', () => {
    render(<NewDocDateTitleSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'YYYY-MM-DD' }));

    expect(editorSettingSet).toHaveBeenCalledWith(
      'newDocDateTitleFormat',
      'YYYY-MM-DD'
    );
  });

  test('renders all supported date format options', () => {
    render(<NewDocDateTitleSettings />);

    expect(
      screen.getByTestId('new-doc-date-title-format-trigger').textContent
    ).toBe('DD-MM-YYYY');
    expect(screen.getAllByRole('button', { name: 'DD-MM-YYYY' })).toHaveLength(
      2
    );
    expect(screen.getByRole('button', { name: 'MM-DD-YYYY' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'YYYY-MM-DD' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Journal style (localized)' })
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
