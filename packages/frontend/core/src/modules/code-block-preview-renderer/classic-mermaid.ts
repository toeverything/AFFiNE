import type { Mermaid } from 'mermaid';

import type {
  MermaidRenderOptions,
  MermaidRenderRequest,
  MermaidRenderResult,
  MermaidRenderTheme,
} from '../mermaid/renderer';

let mermaidPromise: Promise<Mermaid> | null = null;

function toTheme(theme: MermaidRenderTheme | undefined) {
  return theme === 'modern' ? ('base' as const) : ('default' as const);
}

function createClassicMermaidConfig(options?: MermaidRenderOptions) {
  return {
    startOnLoad: false,
    theme: toTheme(options?.theme),
    securityLevel: 'strict' as const,
    fontFamily: options?.fontFamily ?? 'IBM Plex Mono',
    flowchart: { useMaxWidth: true, htmlLabels: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
    pie: { useMaxWidth: true },
    journey: { useMaxWidth: true },
    gitGraph: { useMaxWidth: true },
  };
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(module => module.default);
  }
  return mermaidPromise;
}

function createDiagramId() {
  return `mermaid-diagram-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function renderClassicMermaidSvg(
  request: MermaidRenderRequest
): Promise<MermaidRenderResult> {
  const mermaid = await loadMermaid();
  mermaid.initialize(createClassicMermaidConfig(request.options));

  const { svg } = await mermaid.render(createDiagramId(), request.code);
  return { svg };
}
