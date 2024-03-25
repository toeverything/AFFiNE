import type { CommandCategory } from '@toeverything/infra';
import { commandScore } from 'cmdk';
import { groupBy } from 'lodash-es';

import type { CMDKCommand } from './types';
import { highlightTextFragments } from './use-highlight';

export function filterSortAndGroupCommands(
  commands: CMDKCommand[],
  query: string
): [CommandCategory, CMDKCommand[]][] {
  const scoredCommands = commands
    .map(command => {
      // attach value = id to each command
      return {
        ...command,
        value: command.id.toLowerCase(), // required by cmdk library
        score: getCommandScore(command, query),
      };
    })
    .filter(c => c.score > 0);

  const sorted = scoredCommands.sort((a, b) => {
    return b.score - a.score;
  });

  if (query) {
    const onlyCreation = sorted.every(
      command => command.category === 'affine:creation'
    );
    if (onlyCreation) {
      return [['affine:creation', sorted]];
    } else {
      return [['affine:results', sorted]];
    }
  } else {
    const groups = groupBy(sorted, command => command.category);
    return Object.entries(groups) as [CommandCategory, CMDKCommand[]][];
  }
}

const highlightScore = (text: string, search: string) => {
  if (text.trim().length === 0) {
    return 0;
  }
  const fragments = highlightTextFragments(text, search);
  const highlightedFragment = fragments.filter(fragment => fragment.highlight);
  // check the longest highlighted fragment
  const longestFragment = Math.max(
    0,
    ...highlightedFragment.map(fragment => fragment.text.length)
  );
  return longestFragment / search.length;
};

const getCategoryWeight = (command: CommandCategory) => {
  switch (command) {
    case 'affine:recent':
      return 1;
    case 'affine:pages':
    case 'affine:edgeless':
    case 'affine:collections':
      return 0.8;
    case 'affine:creation':
      return 0.2;
    default:
      return 0.5;
  }
};

const subTitleWeight = 0.8;

export const getCommandScore = (command: CMDKCommand, search: string) => {
  if (search.trim() === '') {
    return 1;
  }
  const title =
    (typeof command?.label === 'string'
      ? command.label
      : command?.label.title) || '';
  const subTitle =
    (typeof command?.label === 'string' ? '' : command?.label.subTitle) || '';

  const catWeight = getCategoryWeight(command.category);

  const zeroComScore = Math.max(
    commandScore(title, search),
    commandScore(subTitle, search) * subTitleWeight
  );

  // if both title and subtitle has matched, we will use the higher score
  const hlScore = Math.max(
    highlightScore(title, search),
    highlightScore(subTitle, search) * subTitleWeight
  );

  const score = Math.max(
    zeroComScore * hlScore * catWeight,
    command.alwaysShow ? 0.1 : 0
  );
  return score;
};
