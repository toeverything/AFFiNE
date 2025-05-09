import type { TemplateResult } from 'lit';

export function templateToString({ strings, values }: TemplateResult): string {
  return strings.reduce(
    (result, str, i) =>
      result + str + (i < values.length ? String(values[i]) : ''),
    ''
  );
}
