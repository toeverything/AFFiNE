#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CORE_ICONS = [
  // Mode switch
  ['PAGE', 'PageIcon'],
  ['EDGELESS', 'EdgelessIcon'],
  // Headings
  ['HEADING_1', 'Heading1Icon'],
  ['HEADING_2', 'Heading2Icon'],
  ['HEADING_3', 'Heading3Icon'],
  ['HEADING_4', 'Heading4Icon'],
  ['HEADING_5', 'Heading5Icon'],
  ['HEADING_6', 'Heading6Icon'],
  // Lists
  ['BULLETED_LIST', 'BulletedListIcon'],
  ['NUMBERED_LIST', 'NumberedListIcon'],
  ['CHECKBOX_UNCHECKED', 'CheckBoxUnIcon'],
  ['CHECKBOX_CHECKED_SOLID', 'CheckBoxCheckSolidIcon'],
  ['CHECKBOX_CHECKED_LINEAR', 'CheckBoxCheckLinearIcon'],
  ['TOGGLE_DOWN', 'ToggleDownIcon'],
  ['TOGGLE_RIGHT', 'ToggleRightIcon'],
  // Blocks
  ['QUOTE', 'QuoteIcon'],
  ['DIVIDER', 'DividerIcon'],
  ['CODE_BLOCK', 'CodeBlockIcon'],
  ['INLINE_CODE', 'CodeIcon'],
  // Formatting & actions
  ['COPY', 'CopyIcon'],
  ['LINK', 'LinkIcon'],
  ['LINKED_PAGE', 'LinkedPageIcon'],
  ['BOLD', 'BoldIcon'],
  ['ITALIC', 'ItalicIcon'],
  ['UNDERLINE', 'UnderLineIcon'],
  ['STRIKETHROUGH', 'StrikeThroughIcon'],
  ['DELETE', 'DeleteIcon'],
  ['DRAG_HANDLE', 'DragCursorIcon'],
  // Edgeless tools
  ['SHAPE', 'ShapeIcon'],
  ['SQUARE', 'SquareIcon'],
  ['ROUNDED_RECTANGLE', 'RoundedRectangleIcon'],
  ['DIAMOND', 'DiamondIcon'],
  ['TRIANGLE', 'TriangleIcon'],
  ['CONNECTOR_STRAIGHT', 'ConnectorLIcon'],
  ['CONNECTOR_ELBOW', 'ConnectorEIcon'],
  ['CONNECTOR_CURVE', 'ConnectorCIcon'],
  ['BRUSH', 'BrushIcon'],
  ['PEN', 'PenIcon'],
  ['HAND', 'HandIcon'],
  ['SELECT', 'SelectIcon'],
  ['NOTE', 'NoteShadowDuotoneIcon'],
  ['FRAME', 'FrameIcon'],
  ['TEXT', 'TextIcon'],
  ['ADD_TEXT', 'AddTextIcon'],
  ['ZOOM_IN', 'ZoomUpIcon'],
  ['ZOOM_OUT', 'ZoomDownIcon'],
  ['PLUS', 'PlusIcon'],
  ['MINUS', 'MinusIcon'],
];

/**
 * Deterministic UTF-8 / code-unit byte-order comparison matching Rust `&str` `Ord`.
 */
function cmpCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseArgs(argv) {
  const opts = {
    check: false,
    outDir: __dirname,
    nodeModules: process.env.NP_NODE_MODULES ?? null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      opts.check = true;
    } else if (arg === '--out-dir') {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg === '--node-modules') {
      opts.nodeModules = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: extract-tokens.mjs [--check] [--out-dir <dir>] [--node-modules <dir>]'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function findNodeModulesDir(explicitDir) {
  if (explicitDir) {
    const themeCss = path.join(
      explicitDir,
      '@toeverything/theme/dist/style.css'
    );
    if (!fs.existsSync(themeCss)) {
      throw new Error(`Theme stylesheet not found at ${themeCss}`);
    }
    return explicitDir;
  }

  let dir = __dirname;
  while (true) {
    const candidate = path.join(dir, 'node_modules');
    if (
      fs.existsSync(
        path.join(candidate, '@toeverything/theme/dist/style.css')
      )
    ) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Could not locate node_modules/@toeverything/theme/dist/style.css. Pass --node-modules <dir> or set NP_NODE_MODULES.'
  );
}

/**
 * Strip CSS comments and all `@...` at-rules (including nested `@media print { ... }`)
 * using balanced brace scanning so screen `:root` and `[data-theme=...]` tokens are
 * never overwritten by print or conditional media blocks.
 */
function stripCssAtRules(cssText) {
  const noComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  const n = noComments.length;

  while (i < n) {
    const ch = noComments[i];
    if (ch === '@') {
      // Advance to either ';' (statement at-rule) or '{' (block at-rule)
      while (i < n && noComments[i] !== ';' && noComments[i] !== '{') {
        i += 1;
      }
      if (i < n && noComments[i] === ';') {
        i += 1;
      } else if (i < n && noComments[i] === '{') {
        let depth = 1;
        i += 1;
        while (i < n && depth > 0) {
          if (noComments[i] === '{') depth += 1;
          else if (noComments[i] === '}') depth -= 1;
          i += 1;
        }
      }
      continue;
    }
    out += ch;
    i += 1;
  }

  return out;
}

function parseCssCustomProperties(cssText) {
  const stripped = stripCssAtRules(cssText);
  const root = new Map();
  const light = new Map();
  const dark = new Map();

  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector = match[1].trim();
    const body = match[2];
    const target =
      selector === ':root'
        ? root
        : selector === '[data-theme=light]' ||
            selector === '[data-theme="light"]'
          ? light
          : selector === '[data-theme=dark]' ||
              selector === '[data-theme="dark"]'
            ? dark
            : null;
    if (!target) continue;

    for (const decl of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g)) {
      target.set(decl[1].trim(), decl[2].trim());
    }
  }

  return { root, light, dark };
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseColor(raw) {
  const val = raw.trim();
  if (val === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (val.startsWith('#')) {
    const hex = val.slice(1);
    if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 255,
      };
    }
    if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16),
      };
    }
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 255,
      };
    }
    if (hex.length === 8 && /^[0-9a-fA-F]{8}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16),
      };
    }
    return null;
  }

  const rgbaMatch = val.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (rgbaMatch) {
    const r = clampByte(Number(rgbaMatch[1]));
    const g = clampByte(Number(rgbaMatch[2]));
    const b = clampByte(Number(rgbaMatch[3]));
    let a = 255;
    if (rgbaMatch[4] !== undefined) {
      if (rgbaMatch[4].endsWith('%')) {
        a = clampByte((Number(rgbaMatch[4].slice(0, -1)) / 100) * 255);
      } else {
        a = clampByte(Number(rgbaMatch[4]) * 255);
      }
    }
    return { r, g, b, a };
  }

  return null;
}

function requireVar(map, name) {
  const value = map.get(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`Required CSS custom property missing: ${name}`);
  }
  return value.trim();
}

function parsePxStrict(raw, name) {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (m) return Number(m[1]);
  const num = Number(raw.trim());
  if (Number.isFinite(num)) return num;
  throw new Error(`Expected px or numeric value for ${name}, got: ${raw}`);
}

function requirePx(map, name) {
  return parsePxStrict(requireVar(map, name), name);
}

function formatF32(n) {
  const s = Number(n).toString();
  return s.includes('.') ? `${s}_f32` : `${s}.0_f32`;
}

function rustStr(s) {
  return JSON.stringify(String(s));
}

function formatRgba(c) {
  return `Rgba::new(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

function resolveColorVar(map, name, depth = 0) {
  if (depth > 8) return null;
  const raw = map.get(name);
  if (!raw) return null;
  const varRef = raw.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/);
  if (varRef) {
    return resolveColorVar(map, varRef[1], depth + 1);
  }
  return parseColor(raw);
}

function buildThemeSection(mergedMap) {
  const colors = [];
  const shadows = [];
  const notePalette = [];
  const shapePalette = [];
  const connectorPalette = [];

  const sortedNames = [...mergedMap.keys()].sort(cmpCodeUnit);
  for (const name of sortedNames) {
    const raw = mergedMap.get(name);
    if (/shadow/i.test(name) && !parseColor(raw)) {
      shadows.push([name, raw]);
      continue;
    }

    const color = resolveColorVar(mergedMap, name);
    if (color) {
      colors.push([name, color]);
      if (
        name.startsWith('--affine-note-background-') ||
        name.startsWith('--affine-v2-edgeless-note-')
      ) {
        notePalette.push([name, color]);
      }
      if (
        name.startsWith('--affine-palette-shape-') ||
        name.startsWith('--affine-v2-edgeless-palette-')
      ) {
        shapePalette.push([name, color]);
      }
      if (name.startsWith('--affine-palette-line-')) {
        connectorPalette.push([name, color]);
      }
    }
  }

  return { colors, shadows, notePalette, shapePalette, connectorPalette };
}

function generateTokensRs(nodeModulesDir) {
  const themePkg = JSON.parse(
    fs.readFileSync(
      path.join(nodeModulesDir, '@toeverything/theme/package.json'),
      'utf8'
    )
  );
  const cssText = fs.readFileSync(
    path.join(nodeModulesDir, '@toeverything/theme/dist/style.css'),
    'utf8'
  );
  const { root, light, dark } = parseCssCustomProperties(cssText);

  const lightMerged = new Map([...root, ...light]);
  const darkMerged = new Map([...root, ...dark]);

  const lightData = buildThemeSection(lightMerged);
  const darkData = buildThemeSection(darkMerged);

  const radii = [...root.entries()]
    .filter(([k]) => /radius/i.test(k))
    .sort(([a], [b]) => cmpCodeUnit(a, b))
    .map(([k, v]) => [k, parsePxStrict(v, k)]);

  const pickColor = (map, key) => {
    const c = resolveColorVar(map, key);
    if (!c) {
      throw new Error(`Required color token missing or unparseable: ${key}`);
    }
    return c;
  };

  const renderColorSlice = entries =>
    entries.map(([k, c]) => `    (${rustStr(k)}, ${formatRgba(c)}),`).join('\n');

  const renderShadowSlice = entries =>
    entries.map(([k, v]) => `    (${rustStr(k)}, ${rustStr(v)}),`).join('\n');

  const renderThemeConst = (constName, map, data) => `pub const ${constName}: ThemeTokens = ThemeTokens {
    brand: ${formatRgba(pickColor(map, '--affine-brand-color'))},
    primary: ${formatRgba(pickColor(map, '--affine-primary-color'))},
    secondary: ${formatRgba(pickColor(map, '--affine-secondary-color'))},
    text_primary: ${formatRgba(pickColor(map, '--affine-text-primary-color'))},
    text_secondary: ${formatRgba(pickColor(map, '--affine-text-secondary-color'))},
    text_emphasis: ${formatRgba(pickColor(map, '--affine-text-emphasis-color'))},
    text_disable: ${formatRgba(pickColor(map, '--affine-text-disable-color'))},
    background_primary: ${formatRgba(pickColor(map, '--affine-background-primary-color'))},
    background_secondary: ${formatRgba(pickColor(map, '--affine-background-secondary-color'))},
    background_tertiary: ${formatRgba(pickColor(map, '--affine-background-tertiary-color'))},
    background_code_block: ${formatRgba(pickColor(map, '--affine-background-code-block'))},
    background_modal: ${formatRgba(pickColor(map, '--affine-background-modal-color'))},
    background_overlay_panel: ${formatRgba(pickColor(map, '--affine-background-overlay-panel-color'))},
    border: ${formatRgba(pickColor(map, '--affine-border-color'))},
    divider: ${formatRgba(pickColor(map, '--affine-divider-color'))},
    quote: ${formatRgba(pickColor(map, '--affine-quote-color'))},
    link: ${formatRgba(pickColor(map, '--affine-link-color'))},
    icon: ${formatRgba(pickColor(map, '--affine-icon-color'))},
    icon_secondary: ${formatRgba(pickColor(map, '--affine-icon-secondary'))},
    placeholder: ${formatRgba(pickColor(map, '--affine-placeholder-color'))},
    hover: ${formatRgba(pickColor(map, '--affine-hover-color'))},
    edgeless_grid: ${formatRgba(pickColor(map, '--affine-edgeless-grid-color'))},
    colors: &[
${renderColorSlice(data.colors)}
    ],
    shadows: &[
${renderShadowSlice(data.shadows)}
    ],
    note_palette: &[
${renderColorSlice(data.notePalette)}
    ],
    shape_palette: &[
${renderColorSlice(data.shapePalette)}
    ],
    connector_palette: &[
${renderColorSlice(data.connectorPalette)}
    ],
};`;

  const lineHeightRaw = requireVar(root, '--affine-line-height');
  const basePx = requirePx(root, '--affine-font-base');
  const lineHeightCalcMatch = lineHeightRaw.match(
    /^calc\(\s*1em\s*\+\s*(\d+(?:\.\d+)?)px\s*\)$/i
  );
  const resolvedLineHeightPx = lineHeightCalcMatch
    ? basePx + Number(lineHeightCalcMatch[1])
    : parsePxStrict(lineHeightRaw, '--affine-line-height');

  return `// @generated by packages/ui/tokens/extract-tokens.mjs
// Source: @toeverything/theme@${themePkg.version} (dist/style.css)
// Do not edit manually; regenerate with extract-tokens.mjs.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Rgba {
    pub const TRANSPARENT: Self = Self::new(0, 0, 0, 0);

    pub const fn new(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self { r, g, b, a }
    }

    pub const fn to_u32(self) -> u32 {
        ((self.r as u32) << 24)
            | ((self.g as u32) << 16)
            | ((self.b as u32) << 8)
            | (self.a as u32)
    }

    pub fn to_f32(self) -> [f32; 4] {
        [
            self.r as f32 / 255.0,
            self.g as f32 / 255.0,
            self.b as f32 / 255.0,
            self.a as f32 / 255.0,
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeMode {
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy)]
pub struct TypographyTokens {
    pub font_family: &'static str,
    pub font_serif_family: &'static str,
    pub font_mono_family: &'static str,
    pub font_sans_family: &'static str,
    pub font_number_family: &'static str,
    pub font_code_family: &'static str,
    pub font_base_px: f32,
    pub font_sm_px: f32,
    pub font_xs_px: f32,
    pub font_h1_px: f32,
    pub font_h2_px: f32,
    pub font_h3_px: f32,
    pub font_h4_px: f32,
    pub font_h5_px: f32,
    pub font_h6_px: f32,
    pub line_height_css: &'static str,
    pub line_height_base_px: f32,
    pub editor_width_px: f32,
    pub paragraph_space_px: f32,
    pub popover_radius_px: f32,
    pub radii: &'static [(&'static str, f32)],
}

pub const TYPOGRAPHY: TypographyTokens = TypographyTokens {
    font_family: ${rustStr(requireVar(root, '--affine-font-family'))},
    font_serif_family: ${rustStr(requireVar(root, '--affine-font-serif-family'))},
    font_mono_family: ${rustStr(requireVar(root, '--affine-font-mono-family'))},
    font_sans_family: ${rustStr(requireVar(root, '--affine-font-sans-family'))},
    font_number_family: ${rustStr(requireVar(root, '--affine-font-number-family'))},
    font_code_family: ${rustStr(requireVar(root, '--affine-font-code-family'))},
    font_base_px: ${formatF32(basePx)},
    font_sm_px: ${formatF32(requirePx(root, '--affine-font-sm'))},
    font_xs_px: ${formatF32(requirePx(root, '--affine-font-xs'))},
    font_h1_px: ${formatF32(requirePx(root, '--affine-font-h-1'))},
    font_h2_px: ${formatF32(requirePx(root, '--affine-font-h-2'))},
    font_h3_px: ${formatF32(requirePx(root, '--affine-font-h-3'))},
    font_h4_px: ${formatF32(requirePx(root, '--affine-font-h-4'))},
    font_h5_px: ${formatF32(requirePx(root, '--affine-font-h-5'))},
    font_h6_px: ${formatF32(requirePx(root, '--affine-font-h-6'))},
    line_height_css: ${rustStr(lineHeightRaw)},
    line_height_base_px: ${formatF32(resolvedLineHeightPx)},
    editor_width_px: ${formatF32(requirePx(root, '--affine-editor-width'))},
    paragraph_space_px: ${formatF32(requirePx(root, '--affine-paragraph-space'))},
    popover_radius_px: ${formatF32(requirePx(root, '--affine-popover-radius'))},
    radii: &[
${radii.map(([k, v]) => `        (${rustStr(k)}, ${formatF32(v)}),`).join('\n')}
    ],
};

#[derive(Debug, Clone, Copy)]
pub struct ThemeTokens {
    pub brand: Rgba,
    pub primary: Rgba,
    pub secondary: Rgba,
    pub text_primary: Rgba,
    pub text_secondary: Rgba,
    pub text_emphasis: Rgba,
    pub text_disable: Rgba,
    pub background_primary: Rgba,
    pub background_secondary: Rgba,
    pub background_tertiary: Rgba,
    pub background_code_block: Rgba,
    pub background_modal: Rgba,
    pub background_overlay_panel: Rgba,
    pub border: Rgba,
    pub divider: Rgba,
    pub quote: Rgba,
    pub link: Rgba,
    pub icon: Rgba,
    pub icon_secondary: Rgba,
    pub placeholder: Rgba,
    pub hover: Rgba,
    pub edgeless_grid: Rgba,
    pub colors: &'static [(&'static str, Rgba)],
    pub shadows: &'static [(&'static str, &'static str)],
    pub note_palette: &'static [(&'static str, Rgba)],
    pub shape_palette: &'static [(&'static str, Rgba)],
    pub connector_palette: &'static [(&'static str, Rgba)],
}

impl ThemeTokens {
    pub fn color(&self, css_var: &str) -> Option<Rgba> {
        self.colors
            .binary_search_by_key(&css_var, |(name, _)| *name)
            .ok()
            .map(|idx| self.colors[idx].1)
    }

    pub fn shadow(&self, css_var: &str) -> Option<&'static str> {
        self.shadows
            .binary_search_by_key(&css_var, |(name, _)| *name)
            .ok()
            .map(|idx| self.shadows[idx].1)
    }
}

${renderThemeConst('LIGHT_THEME', lightMerged, lightData)}

${renderThemeConst('DARK_THEME', darkMerged, darkData)}

pub const fn theme(mode: ThemeMode) -> &'static ThemeTokens {
    match mode {
        ThemeMode::Light => &LIGHT_THEME,
        ThemeMode::Dark => &DARK_THEME,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_strictly_sorted<T>(slice: &[(&str, T)], label: &str) {
        for pair in slice.windows(2) {
            assert!(
                pair[0].0 < pair[1].0,
                "{label} is not strictly sorted in Rust Ord: {:?} >= {:?}",
                pair[0].0,
                pair[1].0
            );
        }
    }

    #[test]
    fn token_tables_are_sorted_and_round_trip() {
        assert_strictly_sorted(LIGHT_THEME.colors, "LIGHT_THEME.colors");
        assert_strictly_sorted(DARK_THEME.colors, "DARK_THEME.colors");
        assert_strictly_sorted(LIGHT_THEME.shadows, "LIGHT_THEME.shadows");
        assert_strictly_sorted(DARK_THEME.shadows, "DARK_THEME.shadows");
        assert_strictly_sorted(TYPOGRAPHY.radii, "TYPOGRAPHY.radii");

        for &(k, v) in LIGHT_THEME.colors {
            assert_eq!(LIGHT_THEME.color(k), Some(v), "LIGHT_THEME.color({k})");
        }
        for &(k, v) in DARK_THEME.colors {
            assert_eq!(DARK_THEME.color(k), Some(v), "DARK_THEME.color({k})");
        }
        for &(k, v) in LIGHT_THEME.shadows {
            assert_eq!(LIGHT_THEME.shadow(k), Some(v), "LIGHT_THEME.shadow({k})");
        }
        for &(k, v) in DARK_THEME.shadows {
            assert_eq!(DARK_THEME.shadow(k), Some(v), "DARK_THEME.shadow({k})");
        }
    }

    #[test]
    fn screen_font_stack_not_overwritten_by_print_media_rule() {
        assert!(
            TYPOGRAPHY.font_family.contains("apple-system"),
            "expected screen font stack to retain apple-system, got: {}",
            TYPOGRAPHY.font_family
        );
        assert!(
            TYPOGRAPHY.font_family.contains("BlinkMacSystemFont"),
            "expected screen font stack to retain BlinkMacSystemFont, got: {}",
            TYPOGRAPHY.font_family
        );
    }
}
`;
}

function parseSvgAttributes(tagText) {
  const attrs = {};
  for (const m of tagText.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    attrs[m[1]] = m[2] ?? m[3] ?? '';
  }
  return attrs;
}

function generateIconsRs(nodeModulesDir) {
  const iconsPkg = JSON.parse(
    fs.readFileSync(
      path.join(nodeModulesDir, '@blocksuite/icons/package.json'),
      'utf8'
    )
  );
  const litMjs = fs.readFileSync(
    path.join(nodeModulesDir, '@blocksuite/icons/dist/lit.mjs'),
    'utf8'
  );

  const exportBlockMatch = litMjs.match(/export\s*\{([\s\S]*?)\};/);
  if (!exportBlockMatch) {
    throw new Error(
      'Could not locate export block in @blocksuite/icons/dist/lit.mjs'
    );
  }
  const exportToLocal = new Map();
  for (const m of exportBlockMatch[1].matchAll(/(\w+)\s+as\s+(\w+)/g)) {
    exportToLocal.set(m[2], m[1]);
  }

  const localToSvg = new Map();
  for (const m of litMjs.matchAll(
    /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*html`([\s\S]*?)`;/g
  )) {
    localToSvg.set(m[1], m[2]);
  }

  const extracted = [];
  for (const [rustConstName, exportName] of CORE_ICONS) {
    const localName = exportToLocal.get(exportName);
    if (!localName) {
      throw new Error(
        `Icon export not found in @blocksuite/icons: ${exportName}`
      );
    }
    const svgTemplate = localToSvg.get(localName);
    if (!svgTemplate) {
      throw new Error(
        `Icon template not found for ${exportName} (${localName})`
      );
    }
    const svgTagMatch = svgTemplate.match(/<svg\b([^>]*)>/);
    const svgAttrs = svgTagMatch ? parseSvgAttributes(svgTagMatch[1]) : {};
    const viewBox = svgAttrs.viewBox ?? '0 0 24 24';
    const inheritedFill = svgAttrs.fill ?? 'currentColor';

    const paths = [];
    for (const pm of svgTemplate.matchAll(/<path\b([^>]*)\/?>/g)) {
      const attrs = parseSvgAttributes(pm[1]);
      if (!attrs.d) continue;
      const strokeWidthNum =
        attrs['stroke-width'] !== undefined
          ? Number(attrs['stroke-width'])
          : 0;
      paths.push({
        d: attrs.d,
        fill_rule: attrs['fill-rule'] ?? 'nonzero',
        clip_rule: attrs['clip-rule'] ?? 'nonzero',
        fill: attrs.fill ?? inheritedFill,
        stroke: attrs.stroke ?? '',
        stroke_width: Number.isFinite(strokeWidthNum) ? strokeWidthNum : 0,
        stroke_linecap: attrs['stroke-linecap'] ?? '',
        stroke_linejoin: attrs['stroke-linejoin'] ?? '',
      });
    }

    if (paths.length === 0) {
      throw new Error(`No <path d=...> elements found in icon ${exportName}`);
    }

    extracted.push({
      rustConstName,
      exportName,
      viewBox,
      paths,
    });
  }

  const sortedByExport = [...extracted].sort((a, b) =>
    cmpCodeUnit(a.exportName, b.exportName)
  );

  const renderIconDef = item => {
    const pathLines = item.paths
      .map(
        p =>
          `        IconPath { d: ${rustStr(p.d)}, fill_rule: ${rustStr(
            p.fill_rule
          )}, clip_rule: ${rustStr(p.clip_rule)}, fill: ${rustStr(
            p.fill
          )}, stroke: ${rustStr(p.stroke)}, stroke_width: ${formatF32(
            p.stroke_width
          )}, stroke_linecap: ${rustStr(
            p.stroke_linecap
          )}, stroke_linejoin: ${rustStr(p.stroke_linejoin)} },`
      )
      .join('\n');
    return `IconDef {
    name: ${rustStr(item.exportName)},
    view_box: ${rustStr(item.viewBox)},
    paths: &[
${pathLines}
    ],
}`;
  };

  const constDefs = extracted
    .map(
      item =>
        `pub const ${item.rustConstName}: IconDef = ${renderIconDef(item)};`
    )
    .join('\n\n');

  const tableEntries = sortedByExport
    .map(item => `    ${item.rustConstName},`)
    .join('\n');

  return `// @generated by packages/ui/tokens/extract-tokens.mjs
// Source: @blocksuite/icons@${iconsPkg.version} (dist/lit.mjs)
// Do not edit manually; regenerate with extract-tokens.mjs.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IconPath {
    pub d: &'static str,
    pub fill_rule: &'static str,
    pub clip_rule: &'static str,
    pub fill: &'static str,
    pub stroke: &'static str,
    pub stroke_width: f32,
    pub stroke_linecap: &'static str,
    pub stroke_linejoin: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IconDef {
    pub name: &'static str,
    pub view_box: &'static str,
    pub paths: &'static [IconPath],
}

${constDefs}

pub const ALL_ICONS: &[IconDef] = &[
${tableEntries}
];

pub fn icon_by_name(name: &str) -> Option<&'static IconDef> {
    ALL_ICONS
        .binary_search_by_key(&name, |icon| icon.name)
        .ok()
        .map(|idx| &ALL_ICONS[idx])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icons_are_sorted_in_rust_ord_and_round_trip() {
        for pair in ALL_ICONS.windows(2) {
            assert!(
                pair[0].name < pair[1].name,
                "ALL_ICONS not strictly sorted: {:?} >= {:?}",
                pair[0].name,
                pair[1].name
            );
        }
        for icon in ALL_ICONS {
            assert_eq!(icon_by_name(icon.name), Some(icon));
        }
        assert_eq!(icon_by_name("LinkIcon"), Some(&LINK));
        assert_eq!(icon_by_name("LinkedPageIcon"), Some(&LINKED_PAGE));
    }

    #[test]
    fn drag_handle_preserves_inherited_fill_none_and_stroke_attributes() {
        assert!(!DRAG_HANDLE.paths.is_empty());
        let stroked: Vec<&IconPath> = DRAG_HANDLE
            .paths
            .iter()
            .filter(|p| !p.stroke.is_empty())
            .collect();
        assert!(!stroked.is_empty(), "DRAG_HANDLE must contain stroked paths");
        for path in stroked {
            assert_eq!(path.fill, "none");
            assert!((path.stroke_width - 0.5).abs() < 1e-6);
        }
    }
}
`;
}

function walkFilesSorted(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  results.sort(cmpCodeUnit);
  return results;
}

function parseFontFaces(fontsCssText) {
  const faces = [];
  for (const m of fontsCssText.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const body = m[1];
    const pick = prop => {
      const pm = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'i'));
      return pm ? pm[1].trim().replace(/^['"]|['"]$/g, '') : null;
    };
    const srcMatch = body.match(/src\s*:\s*url\(\s*['"]?([^)'"]+)['"]?\s*\)/i);
    faces.push({
      family: pick('font-family'),
      style: pick('font-style') ?? 'normal',
      weight: pick('font-weight') ?? 'normal',
      display: pick('font-display'),
      src: srcMatch ? srcMatch[1].trim() : null,
    });
  }
  return faces;
}

function parseCommunityCanvasTextFonts(repoRoot) {
  const configPath = path.join(
    repoRoot,
    'blocksuite/affine/shared/src/services/font-loader/config.ts'
  );
  if (!fs.existsSync(configPath)) return [];

  const text = fs.readFileSync(configPath, 'utf8');
  const startIdx = text.indexOf('export const CommunityCanvasTextFonts');
  if (startIdx === -1) return [];
  const slice = text.slice(startIdx);
  const endIdx = slice.indexOf('];');
  const block = endIdx === -1 ? slice : slice.slice(0, endIdx);

  const descriptors = [];
  for (const objMatch of block.matchAll(/\{([\s\S]*?)\}/g)) {
    const body = objMatch[1];
    const fontM = body.match(/font\s*:\s*FontFamily\.([A-Za-z0-9_]+)/);
    const urlM = body.match(/url\s*:\s*['"]([^'"]+)['"]/);
    const weightM = body.match(/weight\s*:\s*FontWeight\.([A-Za-z0-9_]+)/);
    const styleM = body.match(/style\s*:\s*FontStyle\.([A-Za-z0-9_]+)/);
    if (fontM && urlM) {
      descriptors.push({
        font: fontM[1],
        url: urlM[1],
        weight: weightM ? weightM[1] : 'Regular',
        style: styleM ? styleM[1] : 'Normal',
      });
    }
  }
  return descriptors;
}

function generateFontsLock(nodeModulesDir) {
  const themeDir = path.join(nodeModulesDir, '@toeverything/theme');
  const themePkg = JSON.parse(
    fs.readFileSync(path.join(themeDir, 'package.json'), 'utf8')
  );

  const fontsDir = fs.existsSync(path.join(themeDir, 'fonts'))
    ? path.join(themeDir, 'fonts')
    : path.join(themeDir, 'dist/fonts');
  if (!fs.existsSync(fontsDir)) {
    throw new Error(`Bundled fonts directory not found under ${themeDir}`);
  }

  const allFiles = walkFilesSorted(fontsDir);
  const bundledFiles = allFiles.map(fullPath => {
    const bytes = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const relPath = path.relative(themeDir, fullPath).split(path.sep).join('/');
    return {
      path: relPath,
      bytes: bytes.length,
      sha256,
    };
  });

  const fontsCssPath = path.join(fontsDir, 'fonts.css');
  const fontFaces = fs.existsSync(fontsCssPath)
    ? parseFontFaces(fs.readFileSync(fontsCssPath, 'utf8'))
    : [];

  const repoRoot = path.resolve(__dirname, '../../..');
  const communityCanvasTextFonts = parseCommunityCanvasTextFonts(repoRoot);

  if (bundledFiles.length === 0) {
    throw new Error('Generated fonts.lock bundled_files must not be empty');
  }
  if (fontFaces.length === 0) {
    throw new Error('Generated fonts.lock font_faces must not be empty');
  }
  if (communityCanvasTextFonts.length === 0) {
    throw new Error(
      `Generated fonts.lock community_canvas_text_fonts must not be empty (repoRoot=${repoRoot})`
    );
  }

  const manifest = {
    schema_version: 1,
    source_package: `@toeverything/theme@${themePkg.version}`,
    bundled_files: bundledFiles,
    font_faces: fontFaces,
    community_canvas_text_fonts: communityCanvasTextFonts,
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function writeOrCheck(filePath, content, checkMode) {
  if (checkMode) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing generated file: ${filePath}`);
    }
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing !== content) {
      throw new Error(`Generated file is out of date: ${filePath}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const nodeModulesDir = findNodeModulesDir(opts.nodeModules);

  const tokensRs = generateTokensRs(nodeModulesDir);
  const iconsRs = generateIconsRs(nodeModulesDir);
  const fontsLock = generateFontsLock(nodeModulesDir);

  const tokensPath = path.join(opts.outDir, 'tokens.rs');
  const iconsPath = path.join(opts.outDir, 'icons.rs');
  const fontsLockPath = path.join(opts.outDir, 'fonts.lock');

  writeOrCheck(tokensPath, tokensRs, opts.check);
  writeOrCheck(iconsPath, iconsRs, opts.check);
  writeOrCheck(fontsLockPath, fontsLock, opts.check);

  if (opts.check) {
    console.log(
      'OK: tokens.rs, icons.rs, and fonts.lock match @toeverything/theme and @blocksuite/icons byte-for-byte.'
    );
  } else {
    console.log(
      `Generated ${tokensPath} (${tokensRs.length} bytes), ${iconsPath} (${iconsRs.length} bytes), and ${fontsLockPath} (${fontsLock.length} bytes).`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
