import { app } from "electron";

import { logger } from "./logger";

// Desktops that Electron already maps to gnome-libsecret, or to which it is
// safe to force that backend (GNOME, MATE, Budgie, etc., and tiling window
// managers that typically run gnome-keyring/libsecret).
const GNOME_LIBSECRET_DESKTOPS = new Set([
  // Electron's recognized GNOME-based desktops
  "gnome",
  "x-cinnamon",
  "cinnamon",
  "deepin",
  "pantheon",
  "xfce",
  "ukui",
  "unity",
  // Other common libsecret-compatible environments
  "mate",
  "budgie",
  // Common tiling / minimalist WMs where users often run gnome-keyring
  "sway",
  "i3",
  "i3wm",
  "hyprland",
  "bspwm",
  "awesome",
  "dwm",
  "qtile",
  "xmonad",
  "niri",
  "wayfire",
  "river",
  "weston",
  "wlroots",
]);

// KDE/Plasma sessions should use KWallet rather than gnome-libsecret.
const KWALLET_DESKTOPS = new Set(["kde", "plasma"]);

function getKWalletFlag(): string {
  const version = process.env.KDE_SESSION_VERSION;
  if (version === "6") return "kwallet6";
  if (version === "5") return "kwallet5";
  if (version === "4") return "kwallet";
  // Fallback matches Chromium's behaviour for KDE without KDE_SESSION_VERSION.
  return "kwallet";
}

function isKdeSession(): boolean {
  return (
    process.env.KDE_FULL_SESSION === "true" ||
    process.env.KDE_SESSION_VERSION !== undefined
  );
}

function getDesktopTokens(): string[] {
  const raw = [process.env.XDG_CURRENT_DESKTOP, process.env.XDG_SESSION_DESKTOP]
    .filter((desktop): desktop is string => Boolean(desktop))
    .join(":");
  if (!raw) {
    return [];
  }
  return raw
    .split(":")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function detectLinuxPasswordStore(): string | null {
  const tokens = getDesktopTokens();

  if (tokens.some((token) => KWALLET_DESKTOPS.has(token))) {
    return getKWalletFlag();
  }

  // When the desktop is unknown, fall back on KDE session variables so we do
  // not force gnome-libsecret on a Plasma/i3 hybrid that uses KWallet.
  if (tokens.length > 0 && isKdeSession()) {
    return getKWalletFlag();
  }

  if (tokens.some((token) => GNOME_LIBSECRET_DESKTOPS.has(token))) {
    return "gnome-libsecret";
  }

  return null;
}

export function ensureSecureLinuxPasswordStore() {
  if (process.platform !== "linux") {
    return;
  }

  if (app.commandLine.hasSwitch("password-store")) {
    return;
  }

  const store = detectLinuxPasswordStore();
  if (store) {
    logger.info(`Secure password store detected; using ${store}`);
    app.commandLine.appendSwitch("password-store", store);
  }
}
