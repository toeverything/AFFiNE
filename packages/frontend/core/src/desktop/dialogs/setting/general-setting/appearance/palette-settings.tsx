import { Button, Menu, type MenuProps, Switch } from '@affine/component';
import { SettingWrapper } from '@affine/component/setting-components';
import {
  WorkspaceLocalState,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import {
  ColorScheme,
  DefaultTheme,
  type LineWidth,
  type Palette,
  resolveColor,
  type StrokeStyle,
} from '@blocksuite/affine/model';
import {
  getShapePalettesStorageKey,
  SHAPE_PALETTES_STORAGE_EVENT,
  type ShapePalette,
  shapePaletteKeys,
  shapePalettes,
} from '@blocksuite/affine-gfx-shape';
import { useService } from '@toeverything/infra';
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './palette-settings.css';

type PaletteStrokeStyle = 'solid' | 'dash' | 'dot' | 'none';
type PaletteGradientDirection =
  | 'none'
  | 'N'
  | 'NE'
  | 'E'
  | 'SE'
  | 'S'
  | 'SW'
  | 'W'
  | 'NW';

type PaletteSwatch = {
  id: string;
  fillColor: string;
  strokeColor: string;
  ringColor?: string;
  gradientFinal: string;
  gradientDirection: PaletteGradientDirection;
  filled: boolean;
  strokeStyle: PaletteStrokeStyle;
  strokeWidth: number;
};

type PaletteDef = {
  id: string;
  name: string;
  editable: boolean;
  showInLine: boolean;
  showInFill: boolean;
  swatches: PaletteSwatch[];
};

const VERSION = 1;
const PALETTE_STORAGE_KEY = `appearance-palettes:v${VERSION}`;

function buildLegacyStorageKey(workspaceId: string) {
  return `affine:workspace:${workspaceId}:palettes:v${VERSION}`;
}

const STANDARD_PALETTES: PaletteDef[] = shapePalettes.map(palette => ({
  id: `std-${palette.id}`,
  name: palette.id,
  editable: false,
  showInLine: palette.showInLine ?? true,
  showInFill: palette.showInFill ?? true,
  swatches: shapePaletteKeys.map((key, index) => {
    const style = palette.styles[index];
    return buildSwatch(
      key,
      resolveColor(style.fill, ColorScheme.Light),
      resolveColor(style.stroke, ColorScheme.Light),
      true,
      (style.strokeStyle as PaletteStrokeStyle) ?? 'solid',
      style.strokeWidth ?? 2,
      resolveColor(style.gradientFinal ?? style.fill, ColorScheme.Light),
      style.gradientDirection ?? 'none',
      style.ringColor
        ? resolveColor(style.ringColor, ColorScheme.Light)
        : undefined
    );
  }),
}));

function buildSwatch(
  id: string,
  fillColor: string,
  strokeColor: string,
  filled = true,
  strokeStyle: PaletteStrokeStyle = 'solid',
  strokeWidth = 2,
  gradientFinal = fillColor,
  gradientDirection: PaletteGradientDirection = 'none',
  ringColor?: string
): PaletteSwatch {
  return {
    id,
    fillColor,
    strokeColor,
    ringColor,
    gradientFinal,
    gradientDirection,
    filled,
    strokeStyle,
    strokeWidth,
  };
}

function clonePalette(
  palette: PaletteDef,
  id: string,
  name: string
): PaletteDef {
  return {
    ...palette,
    id,
    name,
    editable: true,
    swatches: palette.swatches.map(swatch => ({ ...swatch })),
  };
}

function cloneStandardPalettes() {
  return STANDARD_PALETTES.map(palette => ({
    ...palette,
    swatches: palette.swatches.map(swatch => ({ ...swatch })),
  }));
}

function normalizeGradientDirection(
  direction: string | undefined
): PaletteGradientDirection {
  if (!direction) return 'none';
  const normalized = direction.toUpperCase();
  if (normalized === 'N') return 'N';
  if (normalized === 'NE') return 'NE';
  if (normalized === 'E') return 'E';
  if (normalized === 'SE') return 'SE';
  if (normalized === 'S') return 'S';
  if (normalized === 'SW') return 'SW';
  if (normalized === 'W') return 'W';
  if (normalized === 'NW') return 'NW';
  return 'none';
}

function sanitizePalettes(raw: unknown): PaletteDef[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const parsed: PaletteDef[] = [];
  for (const item of raw) {
    const palette = item as Partial<PaletteDef>;
    if (!palette.id || !palette.name || !Array.isArray(palette.swatches)) {
      continue;
    }

    parsed.push({
      id: String(palette.id),
      name: String(palette.name),
      editable: Boolean(palette.editable),
      showInLine: palette.showInLine ?? true,
      showInFill: palette.showInFill ?? true,
      swatches: palette.swatches.map((rawSwatch, index) => {
        const swatch = rawSwatch as Partial<PaletteSwatch>;
        const fillColor = String(swatch.fillColor ?? '#ffffff');
        return {
          id: String(swatch.id ?? `swatch-${index}`),
          fillColor,
          strokeColor: String(swatch.strokeColor ?? '#000000'),
          ringColor:
            typeof swatch.ringColor === 'string' ? swatch.ringColor : undefined,
          gradientFinal: String(swatch.gradientFinal ?? fillColor),
          gradientDirection: normalizeGradientDirection(
            swatch.gradientDirection
          ),
          filled: swatch.filled ?? true,
          strokeStyle:
            swatch.strokeStyle === 'dash' ||
            swatch.strokeStyle === 'dot' ||
            swatch.strokeStyle === 'none'
              ? swatch.strokeStyle
              : 'solid',
          strokeWidth: Number(swatch.strokeWidth ?? 2),
        } satisfies PaletteSwatch;
      }),
    } satisfies PaletteDef);
  }

  return parsed.length ? parsed : null;
}

function reorderPalettes(
  list: PaletteDef[],
  sourceId: string,
  targetId: string
) {
  const sourceIndex = list.findIndex(p => p.id === sourceId);
  const targetIndex = list.findIndex(p => p.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function getThemeScheme(): ColorScheme {
  if (typeof document === 'undefined') return ColorScheme.Light;
  const current = document.documentElement.dataset.theme;
  return current === 'dark' ? ColorScheme.Dark : ColorScheme.Light;
}

function getGradientPreview(
  swatch: PaletteSwatch,
  fallbackColor: string
): string | undefined {
  if (!swatch.filled) return undefined;
  if (!swatch.gradientFinal || swatch.gradientDirection === 'none') {
    return fallbackColor;
  }

  const direction = swatch.gradientDirection ?? 'none';
  const cssDirection: Record<PaletteGradientDirection, string> = {
    none: 'to right',
    N: 'to top',
    NE: 'to top right',
    E: 'to right',
    SE: 'to bottom right',
    S: 'to bottom',
    SW: 'to bottom left',
    W: 'to left',
    NW: 'to top left',
  };

  return `linear-gradient(${cssDirection[direction]}, ${swatch.fillColor}, ${swatch.gradientFinal})`;
}

function toStoredColor(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    try {
      return resolveColor(value as any, ColorScheme.Light);
    } catch {
      return null;
    }
  }

  return null;
}

const swatchMenuContentOptions: MenuProps['contentOptions'] = {
  align: 'center',
  side: 'top',
};

function SwatchStyleMenu({
  editable,
  swatch,
  onPatch,
}: {
  editable: boolean;
  swatch: PaletteSwatch;
  onPatch: (patch: Partial<PaletteSwatch>) => void;
}) {
  const pickerRef = useRef<HTMLElement | null>(null);
  const theme = getThemeScheme();

  useEffect(() => {
    const picker = pickerRef.current as any;
    if (!picker) return;

    picker.inline = true;
    picker.palettes = DefaultTheme.Palettes as Palette[];
    picker.payload = {
      fillColor: swatch.fillColor,
      strokeColor: swatch.strokeColor,
      gradientFinal: swatch.gradientFinal ?? swatch.fillColor,
      gradientDirection: swatch.gradientDirection ?? 'none',
      strokeWidth: swatch.strokeWidth as LineWidth,
      strokeStyle: swatch.strokeStyle as StrokeStyle,
      originalFillColor: swatch.fillColor,
      originalStrokeColor: swatch.strokeColor,
      theme,
      enableCustomColor: true,
      enableGradient: true,
    };

    const onPickFillColor = (event: Event) => {
      if (!editable) return;
      const color = toStoredColor(
        (event as CustomEvent<any>).detail?.detail?.value
      );
      if (!color) return;
      onPatch({ fillColor: color });
    };

    const onPickGradientFinalColor = (event: Event) => {
      if (!editable) return;
      const color = toStoredColor(
        (event as CustomEvent<any>).detail?.detail?.value
      );
      if (!color) return;
      onPatch({ gradientFinal: color });
    };

    const onPickGradientDirection = (event: Event) => {
      if (!editable) return;
      const direction = (event as CustomEvent<any>).detail;
      if (typeof direction !== 'string') return;
      onPatch({
        gradientDirection: normalizeGradientDirection(direction),
      });
    };

    const onPickStrokeColor = (event: Event) => {
      if (!editable) return;
      const color = toStoredColor(
        (event as CustomEvent<any>).detail?.detail?.value
      );
      if (!color) return;
      onPatch({ strokeColor: color });
    };

    const onPickStrokeStyle = (event: Event) => {
      if (!editable) return;
      const detail = (event as CustomEvent<any>).detail;
      if (detail?.type === 'size') {
        onPatch({ strokeWidth: Number(detail.value || 1) });
        return;
      }
      if (typeof detail?.value === 'string') {
        onPatch({ strokeStyle: detail.value as PaletteStrokeStyle });
      }
    };

    picker.addEventListener('pickFillColor', onPickFillColor as EventListener);
    picker.addEventListener(
      'pickGradientFinalColor',
      onPickGradientFinalColor as EventListener
    );
    picker.addEventListener(
      'pickGradientDirection',
      onPickGradientDirection as EventListener
    );
    picker.addEventListener(
      'pickStrokeColor',
      onPickStrokeColor as EventListener
    );
    picker.addEventListener(
      'pickStrokeStyle',
      onPickStrokeStyle as EventListener
    );

    return () => {
      picker.removeEventListener(
        'pickFillColor',
        onPickFillColor as EventListener
      );
      picker.removeEventListener(
        'pickGradientFinalColor',
        onPickGradientFinalColor as EventListener
      );
      picker.removeEventListener(
        'pickGradientDirection',
        onPickGradientDirection as EventListener
      );
      picker.removeEventListener(
        'pickStrokeColor',
        onPickStrokeColor as EventListener
      );
      picker.removeEventListener(
        'pickStrokeStyle',
        onPickStrokeStyle as EventListener
      );
    };
  }, [
    editable,
    onPatch,
    swatch.fillColor,
    swatch.strokeColor,
    swatch.gradientFinal,
    swatch.gradientDirection,
    swatch.strokeStyle,
    swatch.strokeWidth,
    theme,
  ]);

  return (
    <div
      className={styles.swatchMenu}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div className={styles.swatchHint}>
        {editable
          ? 'Same color and line controls as the shape drawing menu.'
          : 'Standard palettes are read-only. Clone to edit.'}
      </div>
      {createElement('edgeless-shape-color-picker', {
        ref: pickerRef,
        inline: true,
      })}
      <div className={styles.swatchField}>
        Filled
        {editable ? (
          <Switch
            checked={swatch.filled}
            onChange={checked => onPatch({ filled: checked })}
          />
        ) : (
          <span>{swatch.filled ? 'Yes' : 'No'}</span>
        )}
      </div>
    </div>
  );
}

export const PaletteSettings = () => {
  const workspace = useService(WorkspaceService).workspace;
  const workspaceLocalState = useService(WorkspaceLocalState);

  const [palettes, setPalettes] = useState<PaletteDef[]>(
    cloneStandardPalettes()
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const localStatePalettes =
      workspaceLocalState.get<PaletteDef[]>(PALETTE_STORAGE_KEY);
    const legacyRaw = localStorage.getItem(buildLegacyStorageKey(workspace.id));
    let legacyPalettes: unknown = null;
    if (legacyRaw) {
      try {
        legacyPalettes = JSON.parse(legacyRaw) as unknown;
      } catch {
        legacyPalettes = null;
      }
    }
    const stored = sanitizePalettes(localStatePalettes ?? legacyPalettes);
    setPalettes(stored ?? cloneStandardPalettes());
  }, [workspace.id, workspaceLocalState]);

  const persistPalettes = useCallback(
    (nextPalettes: PaletteDef[]) => {
      workspaceLocalState.set(PALETTE_STORAGE_KEY, nextPalettes);
      localStorage.setItem(
        buildLegacyStorageKey(workspace.id),
        JSON.stringify(nextPalettes)
      );
      const syncedShapePalettes: ShapePalette[] = nextPalettes.map(palette => ({
        id: palette.id,
        showInLine: palette.showInLine,
        showInFill: palette.showInFill,
        styles: palette.swatches.map(swatch => ({
          fill: swatch.fillColor,
          stroke: swatch.strokeColor,
          ringColor: swatch.ringColor,
          strokeWidth: swatch.strokeWidth as LineWidth,
          strokeStyle: swatch.strokeStyle as StrokeStyle,
          gradientFinal: swatch.gradientFinal,
          gradientDirection:
            swatch.gradientDirection === 'none'
              ? undefined
              : swatch.gradientDirection,
        })),
      }));
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          getShapePalettesStorageKey(workspace.id),
          JSON.stringify(syncedShapePalettes)
        );
        window.dispatchEvent(
          new CustomEvent(SHAPE_PALETTES_STORAGE_EVENT, {
            detail: { workspaceId: workspace.id },
          })
        );
      }
    },
    [workspace.id, workspaceLocalState]
  );

  const updatePalettes = useCallback(
    (updater: (prev: PaletteDef[]) => PaletteDef[]) => {
      setPalettes(prev => {
        const next = updater(prev);
        persistPalettes(next);
        return next;
      });
    },
    [persistPalettes]
  );

  const customCount = useMemo(
    () => palettes.filter(palette => palette.editable).length,
    [palettes]
  );

  const addPalette = useCallback(() => {
    const nextId = `custom-${Date.now()}`;
    const nextName = `Custom ${customCount + 1}`;
    updatePalettes(prev => [...prev, clonePalette(prev[0], nextId, nextName)]);
  }, [customCount, updatePalettes]);

  const resetPalettes = useCallback(() => {
    updatePalettes(() => cloneStandardPalettes());
  }, [updatePalettes]);

  const cloneById = useCallback(
    (id: string) => {
      updatePalettes(prev => {
        const source = prev.find(palette => palette.id === id);
        if (!source) return prev;
        const nextId = `custom-${Date.now()}`;
        const nextName = `${source.name} copy`;
        return [...prev, clonePalette(source, nextId, nextName)];
      });
    },
    [updatePalettes]
  );

  const deleteById = useCallback(
    (id: string) => {
      updatePalettes(prev => prev.filter(palette => palette.id !== id));
    },
    [updatePalettes]
  );

  const updatePalette = useCallback(
    (id: string, patch: Partial<PaletteDef>) => {
      updatePalettes(prev =>
        prev.map(palette =>
          palette.id === id ? { ...palette, ...patch } : palette
        )
      );
    },
    [updatePalettes]
  );

  const updateSwatch = useCallback(
    (paletteId: string, swatchId: string, patch: Partial<PaletteSwatch>) => {
      updatePalettes(prev =>
        prev.map(palette => {
          if (palette.id !== paletteId) return palette;
          return {
            ...palette,
            swatches: palette.swatches.map(swatch =>
              swatch.id === swatchId ? { ...swatch, ...patch } : swatch
            ),
          };
        })
      );
    },
    [updatePalettes]
  );

  return (
    <SettingWrapper title="Palettes">
      <div className={styles.wrapper}>
        <div className={styles.headerActions}>
          <div>Manage palette sets for line and fill.</div>
          <div className={styles.buttonGroup}>
            <Button variant="secondary" onClick={addPalette}>
              Add palette
            </Button>
            <Button variant="secondary" onClick={resetPalettes}>
              Reset all
            </Button>
          </div>
        </div>

        {palettes.map((palette, index) => {
          const isDragging = draggingId === palette.id;
          const cardClassName = isDragging
            ? `${styles.paletteCard} ${styles.paletteCardDragging}`
            : styles.paletteCard;

          return (
            <div
              key={palette.id}
              className={cardClassName}
              data-testid="palette-card"
              draggable
              onDragStart={() => setDraggingId(palette.id)}
              onDragOver={event => event.preventDefault()}
              onDrop={() => {
                if (!draggingId) return;
                setPalettes(prev =>
                  reorderPalettes(prev, draggingId, palette.id)
                );
                setDraggingId(null);
              }}
              onDragEnd={() => setDraggingId(null)}
            >
              <div className={styles.paletteHeader}>
                <div className={styles.paletteTitleArea}>
                  <span className={styles.dragHandle}>::</span>
                  {index === 0 ? (
                    <span className={styles.defaultBadge}>Default</span>
                  ) : null}
                  {palette.editable ? (
                    <input
                      data-testid="palette-name-input"
                      className={styles.paletteNameInput}
                      value={palette.name}
                      onChange={event =>
                        updatePalette(palette.id, { name: event.target.value })
                      }
                    />
                  ) : (
                    <div className={styles.paletteNameText}>{palette.name}</div>
                  )}
                </div>

                <div className={styles.buttonGroup}>
                  <Button variant="plain" onClick={() => cloneById(palette.id)}>
                    Clone
                  </Button>
                  {palette.editable ? (
                    <Button
                      variant="plain"
                      onClick={() => deleteById(palette.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className={styles.visibilityRow}>
                <label className={styles.visibilityItem}>
                  <span data-testid="line-visibility-label">
                    Line visibility
                  </span>
                  <Switch
                    data-testid="line-visibility-switch"
                    checked={palette.showInLine}
                    onChange={checked =>
                      updatePalette(palette.id, { showInLine: checked })
                    }
                  />
                </label>
                <label className={styles.visibilityItem}>
                  <span data-testid="fill-visibility-label">
                    Fill visibility
                  </span>
                  <Switch
                    data-testid="fill-visibility-switch"
                    checked={palette.showInFill}
                    onChange={checked =>
                      updatePalette(palette.id, { showInFill: checked })
                    }
                  />
                </label>
              </div>

              <div className={styles.swatchRow}>
                {palette.swatches.map(swatch => {
                  return (
                    <Menu
                      key={swatch.id}
                      noPortal
                      contentOptions={swatchMenuContentOptions}
                      items={
                        <SwatchStyleMenu
                          editable={palette.editable}
                          swatch={swatch}
                          onPatch={patch =>
                            updateSwatch(palette.id, swatch.id, patch)
                          }
                        />
                      }
                    >
                      <button
                        className={styles.swatchButton}
                        style={{
                          background:
                            getGradientPreview(swatch, swatch.fillColor) ??
                            'transparent',
                          borderColor: swatch.strokeColor,
                          borderStyle:
                            swatch.strokeStyle === 'none'
                              ? 'solid'
                              : swatch.strokeStyle,
                          borderWidth: swatch.strokeWidth,
                        }}
                        aria-label={`${palette.name} swatch`}
                      />
                    </Menu>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SettingWrapper>
  );
};
