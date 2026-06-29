import { apis, type ClientHandler } from '@affine/electron-api';

import { RequestTimeoutError } from '../../provider/error';
import type { TextToTextOptions } from './message-transport';

const TIMEOUT = 50000;

const DEFAULT_SYSTEM_PROMPT =
  'You are the local AFFiNE desktop AI assistant. Answer directly and keep formatting useful for the editor.';

const MINDMAP_SYSTEM_PROMPT =
  'Use Markdown nested unordered list syntax to analyze and expand the input into a mind map. Return only the nested list. The first level must contain exactly one root item. Each node label must be plain text only. Do not output markdown links, footnotes, citations, URLs, headings, bold text, ordered lists, code fences, or explanatory text outside the nested list. Limit the tree to at most five indentation levels. Analyze the source deeply before structuring it: identify major themes, subthemes, examples, implications, contrasts, and relationships. Prefer many specific branches over a few generic ones. Expand abstract ideas into concrete child nodes. Use the same language as the source unless a keyword must stay in its original form. Keep proper nouns and technical keywords in their original form.';

const MINDMAP_GENERATION_OPTIONS = {
  temperature: 0.2,
  top_p: 0.75,
  max_tokens: 4096,
  frequency_penalty: 0.5,
  presence_penalty: 0.5,
} as const;

const MINDMAP_OUTLINE_SYSTEM_PROMPT =
  'Create a mind map outline from the source. Return only a Markdown nested unordered list. The first level must contain exactly one root item. Each node label must be plain text only. Do not output markdown links, footnotes, citations, URLs, headings, bold text, ordered lists, code fences, or explanatory text outside the nested list. Limit this outline to at most three indentation levels. Identify the major themes first, then add short child labels that signal what should be expanded later. Use the same language as the source unless a keyword must stay in its original form. Keep proper nouns and technical keywords in their original form.';

const MINDMAP_OUTLINE_GENERATION_OPTIONS = {
  temperature: 0.2,
  top_p: 0.75,
  max_tokens: 1024,
  frequency_penalty: 0.5,
  presence_penalty: 0.5,
} as const;

const MINDMAP_EXPAND_SYSTEM_PROMPT = MINDMAP_SYSTEM_PROMPT;

const QUALITY_BIASED_MINDMAP_SOURCE_CHAR_THRESHOLD = 5200;
const QUALITY_BIASED_MINDMAP_PARAGRAPH_THRESHOLD = 10;
const QUALITY_BIASED_MINDMAP_LINE_THRESHOLD = 72;
const MINDMAP_COMPRESSED_SECTION_LIMIT = 8;
const QUALITY_BIASED_MINDMAP_PROMPT_OPTIONS = [
  {
    evidenceBudget: 3200,
    coverageBudget: 900,
    maxEvidenceBlocks: 7,
    maxSections: 8,
  },
  {
    evidenceBudget: 2200,
    coverageBudget: 600,
    maxEvidenceBlocks: 5,
    maxSections: 7,
  },
  {
    evidenceBudget: 1500,
    coverageBudget: 360,
    maxEvidenceBlocks: 4,
    maxSections: 6,
  },
] as const;

const MINDMAP_MERGE_GENERATION_OPTIONS = {
  temperature: 0.15,
  top_p: 0.7,
  max_tokens: 2048,
  frequency_penalty: 0.4,
  presence_penalty: 0.4,
} as const;

type LocalStatus = Awaited<ReturnType<ClientHandler['localAI']['ensureReady']>>;
type LocalReadyStatus = Extract<LocalStatus, { state: 'ready' }>;

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type LocalRequestParams = {
  docs?: unknown;
  files?: unknown;
  selectedMarkdown?: unknown;
  selectedSnapshot?: unknown;
  html?: unknown;
};

type LocalRequestController = {
  signal: AbortSignal;
  armTimeout: () => void;
  clearTimeout: () => void;
  cleanup: () => void;
};

function describeLocalStatus(status: LocalStatus | undefined) {
  if (!status) {
    return 'Desktop local AI is not ready';
  }

  if (status.state === 'error' || status.state === 'unsupported') {
    return status.detail
      ? `Desktop local AI is not ready: ${status.detail}`
      : `Desktop local AI is not ready: ${status.reason}`;
  }

  if (status.state === 'starting') {
    return 'Desktop local AI is still starting';
  }

  return 'Desktop local AI is not ready';
}

function createLocalRequestController(
  signal: AbortSignal | undefined,
  timeout: number
): LocalRequestController {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimeoutFn = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const abort = (reason?: unknown) => {
    clearTimeoutFn();
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  const onAbort = () => {
    abort(signal?.reason);
  };

  if (signal?.aborted) {
    abort(signal.reason);
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    armTimeout: () => {
      clearTimeoutFn();
      if (timeout > 0 && !controller.signal.aborted) {
        timer = setTimeout(() => {
          abort(new RequestTimeoutError());
        }, timeout);
      }
    },
    clearTimeout: clearTimeoutFn,
    cleanup: () => {
      clearTimeoutFn();
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function withAbortSignal<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason ?? new RequestTimeoutError();
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new RequestTimeoutError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function getMindmapSourceMetrics(text: string) {
  const trimmed = text.trim();
  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const paragraphCount = trimmed
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean).length;
  const charCount = Array.from(trimmed).length;
  const bulletLineCount = lines.filter(line =>
    /^(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/.test(line)
  ).length;
  const headingLineCount = lines.filter(line => /^#{1,6}\s+/.test(line)).length;
  const sentenceCount = (trimmed.match(/[.!?。！？]/g) ?? []).length;

  return {
    trimmed,
    lines,
    paragraphCount,
    charCount,
    bulletLineCount,
    headingLineCount,
    sentenceCount,
  };
}

function detectMindmapStructureType(text: string) {
  const metrics = getMindmapSourceMetrics(text);

  if (
    (metrics.headingLineCount >= 1 && metrics.lines.length <= 3) ||
    (metrics.lines.length <= 2 &&
      metrics.charCount < 80 &&
      metrics.bulletLineCount === 0 &&
      metrics.sentenceCount <= 1)
  ) {
    return 'title' as const;
  }

  if (
    metrics.bulletLineCount >= 2 &&
    metrics.bulletLineCount >= Math.ceil(metrics.lines.length / 2)
  ) {
    return 'list' as const;
  }

  return 'paragraph' as const;
}

function buildMindmapProfile(text: string) {
  const metrics = getMindmapSourceMetrics(text);
  const structure = detectMindmapStructureType(text);

  const sizeProfile =
    metrics.charCount < 120 &&
    metrics.lines.length <= 3 &&
    metrics.paragraphCount <= 1
      ? 'compact'
      : metrics.charCount < 360 &&
          metrics.lines.length <= 6 &&
          metrics.paragraphCount <= 2
        ? 'balanced'
        : 'expanded';

  if (structure === 'title') {
    return {
      sizeProfile,
      structure,
      firstLevelBranches:
        sizeProfile === 'compact'
          ? '3-4'
          : sizeProfile === 'balanced'
            ? '4-5'
            : '4-6',
      childBranches:
        sizeProfile === 'compact'
          ? '1-2'
          : sizeProfile === 'balanced'
            ? '2-3'
            : '2-4',
      maxDepth:
        sizeProfile === 'compact' ? 3 : sizeProfile === 'balanced' ? 4 : 5,
      strategyLines: [
        'Treat the source as a topic title or heading.',
        'Expand into the main dimensions a reader would expect from this topic.',
        'Avoid creating sibling branches that merely rephrase the title.',
      ],
    } as const;
  }

  if (structure === 'list') {
    return {
      sizeProfile,
      structure,
      firstLevelBranches:
        sizeProfile === 'compact'
          ? '2-4'
          : sizeProfile === 'balanced'
            ? '3-5'
            : '4-6',
      childBranches:
        sizeProfile === 'compact'
          ? '1-2'
          : sizeProfile === 'balanced'
            ? '1-3'
            : '2-3',
      maxDepth:
        sizeProfile === 'compact' ? 3 : sizeProfile === 'balanced' ? 4 : 5,
      strategyLines: [
        'Map the existing list items into the main branches before inventing new ones.',
        'Preserve the source order when it already implies a useful structure.',
        'Only infer missing sibling branches when they are strongly implied by the list.',
      ],
    } as const;
  }

  return {
    sizeProfile,
    structure,
    firstLevelBranches:
      sizeProfile === 'compact'
        ? '3-4'
        : sizeProfile === 'balanced'
          ? '4-6'
          : '5-8',
    childBranches:
      sizeProfile === 'compact'
        ? '2-3'
        : sizeProfile === 'balanced'
          ? '2-4'
          : '3-5',
    maxDepth:
      sizeProfile === 'compact' ? 3 : sizeProfile === 'balanced' ? 4 : 5,
    strategyLines: [
      'Identify every major theme, tension, or argument in the source and promote it to a first-level branch.',
      'Under each branch, add specific sub-branches for examples, mechanisms, consequences, and distinctions.',
      'Expand abstract ideas into multiple concrete child nodes instead of stopping at one summary label.',
      'Use fourth and fifth levels when the source contains nested examples or sub-arguments.',
    ],
  } as const;
}

function buildMindmapContent(text: string) {
  const profile = buildMindmapProfile(text);

  return [
    'Analyze and expand the source below into a dense mind map.',
    `Profile: ${profile.sizeProfile}.`,
    `Structure: ${profile.structure}.`,
    'Requirements:',
    '- Return only a Markdown nested unordered list.',
    '- Do not include explanations before or after the list.',
    '- Do not use headings, numbered lists, or code fences.',
    '- Start with one root item only.',
    '- Analyze the full source before structuring the tree.',
    '- Prefer a rich multi-level map over a shallow summary.',
    `- Prefer ${profile.firstLevelBranches} strong first-level branches when the source is broad enough.`,
    `- For each major branch, prefer ${profile.childBranches} concrete children before adding deeper levels.`,
    `- Keep the total depth within ${profile.maxDepth} levels.`,
    '- Turn implied subtopics into explicit child branches when the source supports them.',
    '- Expand abstract ideas into multiple specific child nodes instead of one generic label.',
    ...profile.strategyLines.map(line => `- ${line}`),
    '- Avoid repeating the same phrasing across siblings.',
    '- Avoid single-child chains unless the source truly requires them.',
    '- Keep labels concise and information-rich.',
    '',
    'Source material:',
    text,
  ].join('\n');
}

function buildMindmapOutlineContent(text: string) {
  const profile = buildMindmapProfile(text);

  return [
    'Create a mind map outline from the source below.',
    `Profile: ${profile.sizeProfile}.`,
    `Structure: ${profile.structure}.`,
    'Requirements:',
    '- Return only a Markdown nested unordered list.',
    '- Do not include explanations before or after the list.',
    '- Start with one root item only.',
    `- Prefer ${profile.firstLevelBranches} strong first-level branches when the source is broad enough.`,
    `- Under each first-level branch, add ${profile.childBranches} short child labels that capture the subtopics to expand later.`,
    '- Keep this outline at most three levels deep.',
    '- Focus on structure and coverage, not final detail.',
    ...profile.strategyLines.map(line => `- ${line}`),
    '',
    'Source material:',
    text,
  ].join('\n');
}

function buildMindmapExpandContent(text: string, outline: string) {
  const profile = buildMindmapProfile(text);

  return [
    'Expand the outline below into a detailed mind map using the source material.',
    `Profile: ${profile.sizeProfile}.`,
    `Structure: ${profile.structure}.`,
    'Requirements:',
    '- Return only a Markdown nested unordered list.',
    '- Do not include explanations before or after the list.',
    '- Do not use headings, numbered lists, or code fences.',
    '- Keep the same root item and preserve the first-level branch structure from the outline unless the source clearly requires a small correction.',
    `- Expand every major branch with ${profile.childBranches} or more concrete child nodes drawn from the source.`,
    `- Keep the total depth within ${profile.maxDepth} levels.`,
    '- Add examples, implications, distinctions, and sub-arguments from the source under the matching branches.',
    '- Prefer a rich multi-level map over a shallow summary.',
    '- Avoid repeating the same phrasing across siblings.',
    '- Keep labels concise and information-rich.',
    '',
    'Outline to expand:',
    outline.trim(),
    '',
    'Source material:',
    text,
  ].join('\n');
}

type MindmapSection = {
  title: string;
  lead: string;
  paragraphs: string[];
};

type QualityBiasedMindmapPrompt = {
  skeleton: string;
  evidence: string[];
  coverageCues: string[];
};

function shouldUseQualityBiasedMindmapMode(options: TextToTextOptions) {
  if (options.actionId !== 'mindmap.generate') {
    return false;
  }

  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  if (!source) {
    return false;
  }

  const metrics = getMindmapSourceMetrics(source);
  return (
    metrics.charCount >= QUALITY_BIASED_MINDMAP_SOURCE_CHAR_THRESHOLD ||
    metrics.paragraphCount >= QUALITY_BIASED_MINDMAP_PARAGRAPH_THRESHOLD ||
    metrics.lines.length >= QUALITY_BIASED_MINDMAP_LINE_THRESHOLD
  );
}

function truncateMindmapText(text: string, maxChars: number) {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function splitMindmapParagraphs(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean);
}

function getMindmapSectionTitle(paragraph: string, index: number) {
  const firstLine = paragraph
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (firstLine) {
    if (/^#{1,6}\s+/.test(firstLine)) {
      return firstLine.replace(/^#{1,6}\s+/, '').trim();
    }

    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(firstLine)) {
      return firstLine.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
    }

    if (firstLine.length <= 80 || /[:：]$/.test(firstLine)) {
      return firstLine.replace(/[：:]$/, '').trim();
    }
  }

  return `Section ${index + 1}`;
}

function buildMindmapSections(text: string) {
  const paragraphs = splitMindmapParagraphs(text);
  if (paragraphs.length === 0) {
    return [] satisfies MindmapSection[];
  }

  const sections: MindmapSection[] = [];

  for (const [index, paragraph] of paragraphs.entries()) {
    const title = getMindmapSectionTitle(paragraph, index);
    const leadLine = paragraph
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);
    const lead = truncateMindmapText(leadLine ?? paragraph, 120);
    const previous = sections.at(-1);

    if (!previous || previous.paragraphs.length >= 2) {
      sections.push({
        title,
        lead,
        paragraphs: [paragraph],
      });
      continue;
    }

    previous.paragraphs.push(paragraph);
  }

  return sections;
}

function scoreMindmapParagraph(paragraph: string) {
  const normalized = paragraph.trim();
  if (!normalized) {
    return 0;
  }

  const length = normalized.length;
  const sentenceCount = (normalized.match(/[.!?。！？]/g) ?? []).length;
  const bulletCount = (
    normalized.match(/(?:^|\n)(?:[-*+]\s+|\d+[.)]\s+)/g) ?? []
  ).length;
  const headingCount = (normalized.match(/(?:^|\n)#{1,6}\s+/g) ?? []).length;
  const colonCount = (normalized.match(/[：:]/g) ?? []).length;
  const keywordCount = (
    normalized.match(
      /\b(?:because|therefore|risk|owner|metric|timeline|rollback|monitoring|launch|failure|impact|strategy|support|quality|validation|decision|checkpoint|dependency|trade-off|goal)\b/gi
    ) ?? []
  ).length;
  const digitCount = (normalized.match(/\d/g) ?? []).length;

  const lengthScore =
    length >= 140 && length <= 420 ? 3 : length >= 90 && length <= 520 ? 2 : 1;

  return (
    lengthScore +
    Math.min(sentenceCount, 4) * 0.9 +
    Math.min(bulletCount, 3) * 0.8 +
    Math.min(headingCount, 2) * 0.8 +
    Math.min(colonCount, 2) * 0.35 +
    Math.min(keywordCount, 6) * 0.45 +
    Math.min(digitCount, 6) * 0.15
  );
}

function buildQualityBiasedMindmapPrompt(
  text: string,
  maxChars: number
): QualityBiasedMindmapPrompt {
  const sections = buildMindmapSections(text);
  if (sections.length === 0) {
    return {
      skeleton: 'Source overview\n- Main topic\n- Supporting details',
      evidence: [truncateMindmapText(text, Math.max(400, maxChars - 300))],
      coverageCues: [],
    };
  }

  const skeletonSections = sections.slice(0, MINDMAP_COMPRESSED_SECTION_LIMIT);
  const skeleton = skeletonSections
    .map(
      section =>
        `- ${truncateMindmapText(section.title, 72)}\n  - ${truncateMindmapText(section.lead, 120)}`
    )
    .join('\n');

  for (const option of QUALITY_BIASED_MINDMAP_PROMPT_OPTIONS) {
    const evidence: string[] = [];
    const selectedParagraphs = new Set<string>();
    let evidenceChars = 0;

    for (const section of sections.slice(0, option.maxSections)) {
      const winner = [...section.paragraphs]
        .sort(
          (left, right) =>
            scoreMindmapParagraph(right) - scoreMindmapParagraph(left)
        )
        .find(Boolean);

      if (!winner) {
        continue;
      }

      const snippet = truncateMindmapText(winner, 520);
      if (!snippet) {
        continue;
      }

      const block = `Evidence ${evidence.length + 1} | ${truncateMindmapText(section.title, 64)}\n${snippet}`;
      const nextLength = evidenceChars + block.length + 2;
      if (
        evidence.length > 0 &&
        (nextLength > option.evidenceBudget ||
          evidence.length >= option.maxEvidenceBlocks)
      ) {
        continue;
      }

      evidence.push(block);
      evidenceChars = nextLength;
      selectedParagraphs.add(winner);
    }

    const remaining = sections
      .flatMap(section =>
        section.paragraphs.map(paragraph => ({
          sectionTitle: section.title,
          paragraph,
          score: scoreMindmapParagraph(paragraph),
        }))
      )
      .filter(entry => !selectedParagraphs.has(entry.paragraph))
      .sort((left, right) => right.score - left.score);

    for (const candidate of remaining) {
      if (evidence.length >= option.maxEvidenceBlocks) {
        break;
      }

      const snippet = truncateMindmapText(candidate.paragraph, 480);
      if (!snippet) {
        continue;
      }

      const block = `Evidence ${evidence.length + 1} | ${truncateMindmapText(candidate.sectionTitle, 64)}\n${snippet}`;
      const nextLength = evidenceChars + block.length + 2;
      if (nextLength > option.evidenceBudget) {
        continue;
      }

      evidence.push(block);
      evidenceChars = nextLength;
      selectedParagraphs.add(candidate.paragraph);
    }

    const coverageCues: string[] = [];
    let coverageChars = 0;
    for (const section of sections) {
      if (coverageCues.length >= option.maxSections) {
        break;
      }

      const hasEvidence = section.paragraphs.some(paragraph =>
        selectedParagraphs.has(paragraph)
      );
      if (hasEvidence) {
        continue;
      }

      const cue = `${truncateMindmapText(section.title, 56)}: ${truncateMindmapText(section.lead, 96)}`;
      const nextLength = coverageChars + cue.length + 1;
      if (coverageCues.length > 0 && nextLength > option.coverageBudget) {
        break;
      }

      coverageCues.push(cue);
      coverageChars = nextLength;
    }

    const rendered = buildQualityBiasedMindmapContent({
      source: text,
      skeleton,
      evidence,
      coverageCues,
    });

    if (rendered.length <= maxChars) {
      return {
        skeleton,
        evidence,
        coverageCues,
      };
    }
  }

  return {
    skeleton,
    evidence: [
      truncateMindmapText(
        text,
        Math.max(400, maxChars - skeleton.length - 240)
      ),
    ],
    coverageCues: [],
  };
}

function buildQualityBiasedMindmapContent(input: {
  source: string;
  skeleton: string;
  evidence: string[];
  coverageCues: string[];
}) {
  const profile = buildMindmapProfile(input.source);

  return [
    'Build the best mind map you can from the compressed source package below.',
    `Profile: ${profile.sizeProfile}.`,
    `Structure: ${profile.structure}.`,
    'Requirements:',
    '- Return only a Markdown nested unordered list.',
    '- Do not include explanations before or after the list.',
    '- Start with one root item only.',
    '- Use the full document skeleton to preserve global coverage.',
    '- Use the evidence passages to add concrete branches, examples, mechanisms, risks, and distinctions.',
    '- Keep every major section from the skeleton represented in the final map unless it is clearly redundant.',
    '- If evidence is sparse for a section, keep that branch concise instead of dropping it.',
    `- Prefer ${profile.firstLevelBranches} strong first-level branches when the source is broad enough.`,
    `- For each major branch, prefer ${profile.childBranches} concrete children before adding deeper levels.`,
    `- Keep the total depth within ${profile.maxDepth} levels.`,
    '- Merge overlaps, sharpen vague labels, and avoid repeated siblings.',
    '',
    'Document skeleton:',
    input.skeleton,
    '',
    'High-value evidence passages:',
    ...input.evidence.flatMap(block => [block, '']),
    ...(input.coverageCues.length > 0
      ? ['Coverage cues for lighter sections:', ...input.coverageCues, '']
      : []),
  ].join('\n');
}

function isMindmapTooShallow(mindmap: string) {
  const lines = mindmap
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);

  const childLines = lines.filter(line => /^\s*[-*+]\s+/.test(line)).length;
  const deeperLines = lines.filter(line => /^\s{2,}[-*+]\s+/.test(line)).length;
  return childLines > 0 && deeperLines < Math.min(4, Math.ceil(childLines / 3));
}

async function completeQualityBiasedMindmap(
  source: string,
  draft: string,
  options: TextToTextOptions,
  status: LocalReadyStatus
) {
  const prompt = buildQualityBiasedMindmapPrompt(source, 3200);
  const request = createLocalRequestController(
    options.signal,
    options.timeout ?? TIMEOUT
  );

  try {
    return await completeLocalMindmap(
      status,
      request,
      await buildChatMessages(options, {
        systemPrompt: MINDMAP_EXPAND_SYSTEM_PROMPT,
        userText: [
          'Extend the draft mind map below with only the most important missing branches.',
          'Requirements:',
          '- Return only additional Markdown nested unordered list lines that can be appended directly after the draft.',
          '- Do not repeat the root item.',
          '- Do not repeat first-level branches that already exist in the draft.',
          '- Focus on the missing or weak major branches suggested by the compressed source package.',
          '- Prefer adding new first-level branches under the existing root, with concise concrete children where helpful.',
          '- Do not rewrite the whole map.',
          '',
          'Draft mind map:',
          draft.trim(),
          '',
          buildQualityBiasedMindmapContent({
            source,
            skeleton: prompt.skeleton,
            evidence: prompt.evidence,
            coverageCues: prompt.coverageCues,
          }),
        ].join('\n'),
        includeHistory: false,
      }),
      {
        ...MINDMAP_MERGE_GENERATION_OPTIONS,
        max_tokens: 1024,
      }
    );
  } finally {
    request.cleanup();
  }
}

async function* streamQualityBiasedLocalMindmap(
  options: TextToTextOptions,
  status: LocalReadyStatus,
  request: LocalRequestController
) {
  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  const prompt = buildQualityBiasedMindmapPrompt(source, 5600);
  const primaryMessages = await buildChatMessages(options, {
    systemPrompt: MINDMAP_SYSTEM_PROMPT,
    userText: buildQualityBiasedMindmapContent({
      source,
      skeleton: prompt.skeleton,
      evidence: prompt.evidence,
      coverageCues: prompt.coverageCues,
    }),
    includeHistory: false,
  });

  try {
    const response = await postLocalChatCompletion({
      status,
      request,
      stream: true,
      generationOptions: MINDMAP_GENERATION_OPTIONS,
      messages: primaryMessages,
    });

    const streamedChunks: string[] = [];
    for await (const chunk of parseOpenAIStream(response, request)) {
      streamedChunks.push(chunk);
      yield chunk;
    }

    const draft = streamedChunks.join('').trim();
    if (!draft || !isMindmapTooShallow(draft)) {
      return;
    }

    let completed = '';
    try {
      completed = await completeQualityBiasedMindmap(
        source,
        draft,
        options,
        status
      );
    } catch {
      completed = '';
    }

    if (completed.trim()) {
      yield `\n${completed.trimEnd()}`;
    }
  } catch (error) {
    if (isLocalContextOverflowError(error)) {
      yield* streamDeepLocalMindmap(options, status, request);
      return;
    }

    throw error;
  }
}

function isLocalContextOverflowError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('exceed_context_size_error') ||
    error.message.includes('exceeds the available context size')
  );
}

async function completeLocalMindmap(
  status: LocalReadyStatus,
  request: LocalRequestController,
  messages: Array<{ role: string; content: unknown }>,
  generationOptions?: Record<string, number>
) {
  const response = await postLocalChatCompletion({
    status,
    request,
    stream: false,
    generationOptions,
    messages,
  });

  return await readLocalChatCompletion(response, {
    preserveLeadingWhitespace: true,
  });
}

function shouldUseDeepMindmapMode(options: TextToTextOptions) {
  if (options.actionId !== 'mindmap.generate') {
    return false;
  }

  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  if (!source) {
    return false;
  }

  const profile = buildMindmapProfile(source);
  if (profile.structure === 'title' && profile.sizeProfile === 'compact') {
    return false;
  }

  return profile.sizeProfile !== 'compact';
}

function buildLocalTaskPrompt(options: TextToTextOptions) {
  const promptName = options.promptName;
  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  const params = (options.params ?? {}) as Record<string, unknown>;

  if (!source) {
    return source;
  }

  if (options.actionId === 'mindmap.generate') {
    return buildMindmapContent(source);
  }

  switch (promptName) {
    case 'Translate to': {
      const language =
        typeof params.language === 'string' ? params.language : '';
      return [
        `Task: Translate the source text into ${language || 'the requested language'}.`,
        'Requirements:',
        '- Preserve the original meaning, tone, and formatting where possible.',
        '- Return only the translated text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    }
    case 'Change tone to': {
      const tone = typeof params.tone === 'string' ? params.tone : '';
      return [
        `Task: Rewrite the source text in a ${tone || 'requested'} tone.`,
        'Requirements:',
        '- Preserve the original meaning and key facts.',
        '- Keep the response fluent and natural.',
        '- Return only the rewritten text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    }
    case 'Improve writing for it':
      return [
        'Task: Improve the writing quality of the source text.',
        'Requirements:',
        '- Make it clearer, smoother, and more polished.',
        '- Preserve the original meaning.',
        '- Return only the improved text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Improve grammar for it':
      return [
        'Task: Fix grammar issues in the source text.',
        'Requirements:',
        '- Preserve the original meaning and wording when possible.',
        '- Return only the corrected text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Fix spelling for it':
      return [
        'Task: Fix spelling issues in the source text.',
        'Requirements:',
        '- Preserve the original meaning and wording when possible.',
        '- Return only the corrected text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Create headings':
      return [
        'Task: Add useful headings to structure the source text.',
        'Requirements:',
        '- Preserve the original content.',
        '- Return only the rewritten text with headings.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Make it longer':
      return [
        'Task: Expand the source text.',
        'Requirements:',
        '- Preserve the original meaning and direction.',
        '- Add relevant detail, examples, or explanation without drifting off topic.',
        '- Return only the expanded text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Make it shorter':
      return [
        'Task: Make the source text shorter.',
        'Requirements:',
        '- Preserve the key meaning and important facts.',
        '- Return only the shortened text.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Summary':
      return [
        'Task: Summarize the source text.',
        'Requirements:',
        '- Keep the most important points only.',
        '- Return only the summary.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Brainstorm ideas about this':
      return [
        'Task: Brainstorm ideas based on the source text.',
        'Requirements:',
        '- Stay grounded in the source topic.',
        '- Return only the brainstormed ideas.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Find action items from it':
      return [
        'Task: Extract concrete action items from the source text.',
        'Requirements:',
        '- Return only the action items.',
        '- Prefer a concise bullet list.',
        '',
        'Source text:',
        source,
      ].join('\n');
    case 'Expand mind map': {
      const mindmap = typeof params.mindmap === 'string' ? params.mindmap : '';
      return [
        'Task: Expand the selected mind map node using the provided mind map context.',
        'Requirements:',
        '- Return only a Markdown nested unordered list.',
        '- The first root item must match the selected node.',
        '- Add concise, relevant child branches under that node.',
        '- Keep the output grounded in the existing mind map context.',
        '',
        'Selected node:',
        source,
        ...(mindmap ? ['', 'Existing mind map context:', mindmap] : []),
      ].join('\n');
    }
    default:
      return source;
  }
}

async function buildUserContent(
  options: TextToTextOptions
): Promise<OpenAIContentPart[]> {
  const content: OpenAIContentPart[] = [];
  const params = (options.params ?? {}) as LocalRequestParams;

  if (
    typeof options.content === 'string' &&
    options.content.trim().length > 0
  ) {
    content.push({
      type: 'text',
      text: buildLocalTaskPrompt(options),
    });
  }

  if (params.docs !== undefined) {
    content.push({
      type: 'text',
      text: `Referenced docs:\n${JSON.stringify(params.docs)}`,
    });
  }

  if (params.files !== undefined) {
    content.push({
      type: 'text',
      text: `Referenced files:\n${JSON.stringify(params.files)}`,
    });
  }

  if (params.selectedMarkdown !== undefined) {
    content.push({
      type: 'text',
      text: `Selected markdown:\n${String(params.selectedMarkdown)}`,
    });
  }

  if (params.selectedSnapshot !== undefined) {
    content.push({
      type: 'text',
      text: `Selected snapshot:\n${JSON.stringify(params.selectedSnapshot)}`,
    });
  }

  if (params.html !== undefined) {
    content.push({
      type: 'text',
      text: `Selected html:\n${String(params.html)}`,
    });
  }

  const stringAttachments = (options.attachments ?? []).filter(
    (attachment): attachment is string => typeof attachment === 'string'
  );

  if (stringAttachments.length) {
    content.push({
      type: 'text',
      text: `Referenced attachments:\n${JSON.stringify(stringAttachments)}`,
    });
  }

  return content;
}

function buildHistoryMessages(options: TextToTextOptions) {
  const sanitizedHistory = (options.historyMessages ?? []).reduce<
    NonNullable<TextToTextOptions['historyMessages']>
  >((result, message) => {
    if (message.content.trim().length === 0) {
      return result;
    }

    const previous = result.at(-1);
    if (previous?.role === message.role) {
      result[result.length - 1] = message;
      return result;
    }

    result.push(message);
    return result;
  }, []);

  if (sanitizedHistory[0]?.role === 'assistant') {
    sanitizedHistory.shift();
  }

  if (sanitizedHistory.at(-1)?.role === 'user') {
    sanitizedHistory.pop();
  }

  return sanitizedHistory.map(message => ({
    role: message.role,
    content: [{ type: 'text', text: message.content }],
  }));
}

function buildSystemPrompt(options: TextToTextOptions) {
  if (options.actionId === 'mindmap.generate') {
    return MINDMAP_SYSTEM_PROMPT;
  }

  return DEFAULT_SYSTEM_PROMPT;
}

function buildGenerationOptions(options: TextToTextOptions) {
  if (options.actionId === 'mindmap.generate') {
    return MINDMAP_GENERATION_OPTIONS;
  }

  return undefined;
}

async function buildChatMessages(
  options: TextToTextOptions,
  overrides?: {
    systemPrompt?: string;
    userText?: string;
    includeHistory?: boolean;
  }
) {
  const messages: Array<{ role: string; content: unknown }> = [
    {
      role: 'system',
      content: overrides?.systemPrompt ?? buildSystemPrompt(options),
    },
  ];

  if (overrides?.includeHistory !== false) {
    messages.push(...buildHistoryMessages(options));
  }
  messages.push({
    role: 'user',
    content: overrides?.userText
      ? [{ type: 'text', text: overrides.userText }]
      : await buildUserContent(options),
  });

  return messages;
}

async function readLocalChatCompletion(
  response: Response,
  options?: {
    preserveLeadingWhitespace?: boolean;
  }
) {
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content ?? '';
  return options?.preserveLeadingWhitespace
    ? content.trimEnd()
    : content.trim();
}

async function postLocalChatCompletion(input: {
  status: LocalReadyStatus;
  request: LocalRequestController;
  messages: Array<{ role: string; content: unknown }>;
  generationOptions?: Record<string, number>;
  stream: boolean;
}) {
  input.request.armTimeout();
  const response = await withAbortSignal(
    fetch(`${input.status.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.status.modelId,
        stream: input.stream,
        messages: input.messages,
        ...input.generationOptions,
      }),
      signal: input.request.signal,
    }),
    input.request.signal
  );
  input.request.clearTimeout();

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      detail
        ? `Local AI request failed with ${response.status}: ${detail}`
        : `Local AI request failed with ${response.status}`
    );
  }

  return response;
}

async function completeLocalMindmapOutline(
  options: TextToTextOptions,
  status: LocalReadyStatus
) {
  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  const outlineRequest = createLocalRequestController(
    options.signal,
    options.timeout ?? TIMEOUT
  );

  try {
    const response = await postLocalChatCompletion({
      status,
      request: outlineRequest,
      stream: false,
      generationOptions: MINDMAP_OUTLINE_GENERATION_OPTIONS,
      messages: await buildChatMessages(options, {
        systemPrompt: MINDMAP_OUTLINE_SYSTEM_PROMPT,
        userText: buildMindmapOutlineContent(source),
        includeHistory: false,
      }),
    });

    return await readLocalChatCompletion(response);
  } finally {
    outlineRequest.cleanup();
  }
}

async function* streamDeepLocalMindmap(
  options: TextToTextOptions,
  status: LocalReadyStatus,
  request: LocalRequestController
) {
  const source =
    typeof options.content === 'string' ? options.content.trim() : '';
  let outline = '';

  try {
    outline = await completeLocalMindmapOutline(options, status);
  } catch {
    outline = '';
  }

  const messages =
    outline.length > 0
      ? await buildChatMessages(options, {
          systemPrompt: MINDMAP_EXPAND_SYSTEM_PROMPT,
          userText: buildMindmapExpandContent(source, outline),
          includeHistory: false,
        })
      : await buildChatMessages(options, {
          includeHistory: false,
        });

  const response = await postLocalChatCompletion({
    status,
    request,
    stream: true,
    generationOptions: MINDMAP_GENERATION_OPTIONS,
    messages,
  });

  yield* parseOpenAIStream(response, request);
}

async function* streamFastLocalMindmap(
  options: TextToTextOptions,
  status: LocalReadyStatus,
  request: LocalRequestController
) {
  let response: Response;

  try {
    response = await postLocalChatCompletion({
      status,
      request,
      stream: true,
      generationOptions: MINDMAP_GENERATION_OPTIONS,
      messages: await buildChatMessages(options, {
        includeHistory: false,
      }),
    });
  } catch (error) {
    if (!isLocalContextOverflowError(error)) {
      throw error;
    }

    if (shouldUseQualityBiasedMindmapMode(options)) {
      yield* streamQualityBiasedLocalMindmap(options, status, request);
      return;
    }

    if (shouldUseDeepMindmapMode(options)) {
      yield* streamDeepLocalMindmap(options, status, request);
      return;
    }

    throw error;
  }

  yield* parseOpenAIStream(response, request);
}

async function* streamSinglePassLocalChat(
  options: TextToTextOptions,
  status: LocalReadyStatus,
  request: LocalRequestController
) {
  const response = await postLocalChatCompletion({
    status,
    request,
    stream: true,
    generationOptions: buildGenerationOptions(options),
    messages: await buildChatMessages(
      options,
      options.actionId === 'mindmap.generate'
        ? { includeHistory: false }
        : undefined
    ),
  });

  yield* parseOpenAIStream(response, request);
}

async function* parseOpenAIStream(
  response: Response,
  request: LocalRequestController
) {
  if (!response.body) {
    throw new Error('Local AI returned an empty body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      request.armTimeout();
      const { done, value } = await withAbortSignal(
        reader.read(),
        request.signal
      );
      request.clearTimeout();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split('\n');
      const residual = lines.pop() ?? '';

      if (done) {
        if (residual.trim()) {
          lines.push(residual);
        }
        buffer = '';
      } else {
        buffer = residual;
      }

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data: ')) {
          continue;
        }

        const payload = line.slice(6);
        if (payload === '[DONE]') {
          return;
        }

        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const chunk = parsed.choices?.[0]?.delta?.content;

        if (chunk) {
          yield chunk;
        }
      }

      if (done) {
        return;
      }
    }
  } finally {
    request.cleanup();
    reader.releaseLock();
  }
}

export async function streamDesktopLocalChat(options: TextToTextOptions) {
  const status = (await apis?.localAI?.ensureReady?.()) as
    | LocalStatus
    | undefined;

  if (!status || status.state !== 'ready' || !status.canRun) {
    throw new Error(describeLocalStatus(status));
  }

  const request = createLocalRequestController(
    options.signal,
    options.timeout ?? TIMEOUT
  );

  try {
    if (options.actionId === 'mindmap.generate') {
      return streamFastLocalMindmap(options, status, request);
    }

    return streamSinglePassLocalChat(options, status, request);
  } catch (error) {
    request.cleanup();
    throw error;
  }
}
