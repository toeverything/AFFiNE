export const SUPPORTED_BUNDLERS = ['webpack', 'rspack'] as const;

export type Bundler = (typeof SUPPORTED_BUNDLERS)[number];

export const DEFAULT_BUNDLER: Bundler = 'rspack';

function isBundler(value: string): value is Bundler {
  return SUPPORTED_BUNDLERS.includes(value as Bundler);
}

export function normalizeBundler(input: string | undefined | null): Bundler {
  const value = input?.trim().toLowerCase();
  if (!value) {
    return DEFAULT_BUNDLER;
  }
  if (isBundler(value)) {
    return value;
  }

  throw new Error(
    `Unsupported AFFINE_BUNDLER: "${input}". Expected one of: ${SUPPORTED_BUNDLERS.join(', ')}.`
  );
}

export function getBundler(env: NodeJS.ProcessEnv = process.env): Bundler {
  return normalizeBundler(env.AFFINE_BUNDLER);
}
