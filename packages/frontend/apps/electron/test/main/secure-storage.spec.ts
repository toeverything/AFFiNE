import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const commandLine = vi.hoisted(() => ({
  hasSwitch: vi.fn(),
  appendSwitch: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { commandLine },
}));

vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn() },
}));

import { ensureSecureLinuxPasswordStore } from '../../src/main/secure-storage';

let platformSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  // Avoid leaking the host desktop environment into tests.
  delete process.env.XDG_CURRENT_DESKTOP;
  delete process.env.XDG_SESSION_DESKTOP;
  delete process.env.KDE_SESSION_VERSION;
  delete process.env.KDE_FULL_SESSION;
  commandLine.hasSwitch.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  platformSpy?.mockRestore();
  platformSpy = undefined;
});

describe('ensureSecureLinuxPasswordStore', () => {
  test('does nothing on non-Linux platforms', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  test('does nothing when password-store is already set by the user', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    commandLine.hasSwitch.mockReturnValue(true);

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  test('does nothing when no desktop environment variables are set', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  test('does nothing for an unrecognized desktop environment', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'EXWM');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  test('sets password-store=gnome-libsecret for recognized GNOME desktops', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'GNOME');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'gnome-libsecret'
    );
  });

  test('sets password-store=gnome-libsecret for colon-separated desktop lists', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'sway:wlroots');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'gnome-libsecret'
    );
  });

  test.each([
    'sway',
    'i3',
    'i3wm',
    'hyprland',
    'bspwm',
    'awesome',
    'dwm',
    'qtile',
    'xmonad',
    'niri',
    'wayfire',
    'river',
    'weston',
  ])('sets password-store=gnome-libsecret for tiling WM %s', desktop => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', desktop);

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'gnome-libsecret'
    );
  });

  test.each([
    { version: '6', expected: 'kwallet6' },
    { version: '5', expected: 'kwallet5' },
    { version: '4', expected: 'kwallet' },
    { version: undefined, expected: 'kwallet' },
  ])(
    'sets password-store=$expected for KDE with KDE_SESSION_VERSION=$version',
    ({ version, expected }) => {
      platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('linux');
      vi.stubEnv('XDG_CURRENT_DESKTOP', 'KDE');
      if (version !== undefined) {
        vi.stubEnv('KDE_SESSION_VERSION', version);
      }

      ensureSecureLinuxPasswordStore();

      expect(commandLine.appendSwitch).toHaveBeenCalledWith(
        'password-store',
        expected
      );
    }
  );

  test('sets password-store=kwallet5 for plasma', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'plasma');
    vi.stubEnv('KDE_SESSION_VERSION', '5');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet5'
    );
  });

  test('sets kwallet for an unknown desktop when KDE session variables are present', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'custom');
    vi.stubEnv('KDE_FULL_SESSION', 'true');
    vi.stubEnv('KDE_SESSION_VERSION', '5');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet5'
    );
  });

  test('sets kwallet for i3 when KDE session variables are present', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'i3');
    vi.stubEnv('KDE_SESSION_VERSION', '6');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet6'
    );
  });

  test('combines differing XDG_CURRENT_DESKTOP and XDG_SESSION_DESKTOP values, keeping KWallet precedence', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'gnome');
    vi.stubEnv('XDG_SESSION_DESKTOP', 'kde');
    vi.stubEnv('KDE_SESSION_VERSION', '6');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet6'
    );
  });

  test('ignores an empty XDG_CURRENT_DESKTOP and still selects KWallet via XDG_SESSION_DESKTOP', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', '');
    vi.stubEnv('XDG_SESSION_DESKTOP', 'KDE');
    vi.stubEnv('KDE_SESSION_VERSION', '6');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet6'
    );
  });

  test('is case-insensitive', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'SWAY:Wlroots');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'gnome-libsecret'
    );
  });

  test('falls back to XDG_SESSION_DESKTOP when XDG_CURRENT_DESKTOP is not set', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_SESSION_DESKTOP', 'sway');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'gnome-libsecret'
    );
  });

  test('prioritizes KWallet over gnome-libsecret in colon-separated KDE desktops', () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('XDG_CURRENT_DESKTOP', 'kde:gnome');
    vi.stubEnv('KDE_SESSION_VERSION', '6');

    ensureSecureLinuxPasswordStore();

    expect(commandLine.appendSwitch).toHaveBeenCalledWith(
      'password-store',
      'kwallet6'
    );
  });
});
