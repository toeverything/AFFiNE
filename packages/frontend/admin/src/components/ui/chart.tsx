import { cn } from '@affine/admin/utils';
import { createContext, forwardRef, useContext, useId, useMemo } from 'react';
import type { TooltipProps } from 'recharts';
import { ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
    theme?: Partial<Record<keyof typeof THEMES, string>>;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = createContext<ChartContextValue | null>(null);

function useChart() {
  const value = useContext(ChartContext);
  if (!value) {
    throw new Error('useChart must be used within <ChartContainer />');
  }
  return value;
}

function ChartStyle({
  chartId,
  config,
}: {
  chartId: string;
  config: ChartConfig;
}) {
  const colorEntries = Object.entries(config).filter(
    ([, item]) => item.color || item.theme
  );

  if (!colorEntries.length) {
    return null;
  }

  const css = Object.entries(THEMES)
    .map(([themeKey, prefix]) => {
      const declarations = colorEntries
        .map(([key, item]) => {
          const color =
            item.theme?.[themeKey as keyof typeof THEMES] ?? item.color;
          return color ? `  --color-${key}: ${color};` : '';
        })
        .filter(Boolean)
        .join('\n');

      if (!declarations) {
        return '';
      }

      return `${prefix} [data-chart="${chartId}"] {\n${declarations}\n}`;
    })
    .filter(Boolean)
    .join('\n');

  if (!css) {
    return null;
  }

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

type ChartContainerProps = React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>['children'];
};

const ChartContainer = forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = useId();
    const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;
    const chartContextValue = useMemo(() => ({ config }), [config]);

    return (
      <ChartContext.Provider value={chartContextValue}>
        <div
          ref={ref}
          data-chart={chartId}
          className={cn(
            'flex min-h-0 w-full items-center justify-center text-xs',
            className
          )}
          {...props}
        >
          <ChartStyle chartId={chartId} config={config} />
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  }
);
ChartContainer.displayName = 'ChartContainer';

const ChartTooltip = RechartsTooltip;

type TooltipContentProps = {
  active?: boolean;
  payload?: TooltipProps<number, string>['payload'];
  label?: string | number;
  labelFormatter?: (
    label: string | number,
    payload: TooltipProps<number, string>['payload']
  ) => React.ReactNode;
  valueFormatter?: (value: number, key: string) => React.ReactNode;
};

const ChartTooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ active, payload, label, labelFormatter, valueFormatter }, ref) => {
    const { config } = useChart();

    if (!active || !payload?.length) {
      return null;
    }

    const title = labelFormatter ? labelFormatter(label ?? '', payload) : label;

    return (
      <div
        ref={ref}
        className="min-w-44 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      >
        {title ? (
          <div className="mb-2 font-medium text-foreground/90">{title}</div>
        ) : null}
        <div className="space-y-1">
          {payload.map((item, index) => {
            const dataKey = String(item.dataKey ?? item.name ?? index);
            const itemConfig = config[dataKey];
            const labelText = itemConfig?.label ?? item.name ?? dataKey;
            const numericValue =
              typeof item.value === 'number'
                ? item.value
                : Number(item.value ?? 0);
            const valueText = valueFormatter
              ? valueFormatter(numericValue, dataKey)
              : numericValue;
            const color = item.color ?? `var(--color-${dataKey})`;

            return (
              <div
                key={`${dataKey}-${index}`}
                className="flex items-center gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{labelText}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {valueText}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = 'ChartTooltipContent';

export { ChartContainer, ChartTooltip, ChartTooltipContent };
