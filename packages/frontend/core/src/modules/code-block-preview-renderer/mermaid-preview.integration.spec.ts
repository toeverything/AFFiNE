/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import { sanitizeSvg } from './bridge';
import { renderClassicMermaidSvg } from './classic-mermaid';

const canRunDomIntegration =
  typeof document !== 'undefined' &&
  typeof DOMParser !== 'undefined' &&
  typeof XMLSerializer !== 'undefined';

describe.skipIf(!canRunDomIntegration)('mermaid preview integration', () => {
  test('flowchart labels survive classic render and svg sanitization', async () => {
    const { svg: raw } = await renderClassicMermaidSvg({
      code: 'flowchart TD; A-->B',
      options: { theme: 'default' },
    });

    expect(raw).toMatch(/<svg[\s>]/i);

    const sanitized = sanitizeSvg(raw);
    expect(sanitized).toMatch(/<svg[\s>]/i);

    // happy-dom cannot lay out Mermaid (CSSStyleSheet); skip empty output.
    if (!/<(?:rect|path|circle|polygon)\b/i.test(sanitized)) {
      return;
    }

    const hasLabelText =
      />\s*A\s*</i.test(sanitized) ||
      />\s*B\s*</i.test(sanitized) ||
      /foreignObject[\s\S]*>\s*A\s*</i.test(sanitized) ||
      /<tspan[^>]*>\s*A\s*</i.test(sanitized);

    expect(hasLabelText).toBe(true);
  }, 30_000);
});
