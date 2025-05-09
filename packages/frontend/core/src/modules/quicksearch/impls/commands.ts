import {
  type AffineCommand,
  AffineCommandRegistry,
  type CommandCategory,
  PreconditionStrategy,
} from '@affine/core/commands';
import type { DocMode } from '@blocksuite/affine/model';
import { Entity, LiveData } from '@toeverything/infra';
import Fuse from 'fuse.js';

import type { GlobalContextService } from '../../global-context';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';
import { highlighter } from '../utils/highlighter';

const categories = {
  'affine:recent': {
    id: 'command:affine:recent',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.recent' },
    score: 10,
  },
  'affine:navigation': {
    id: 'command:affine:navigation',
    label: {
      i18nKey: 'com.affine.cmdk.affine.category.affine.navigation',
    },
    score: 10,
  },
  'affine:creation': {
    id: 'command:affine:creation',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.creation' },
    score: 10,
  },
  'affine:general': {
    id: 'command:affine:general',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.general' },
    score: 10,
  },
  'affine:layout': {
    id: 'command:affine:layout',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.layout' },
    score: 10,
  },
  'affine:pages': {
    id: 'command:affine:pages',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.pages' },
    score: 10,
  },
  'affine:edgeless': {
    id: 'command:affine:edgeless',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.edgeless' },
    score: 10,
  },
  'affine:collections': {
    id: 'command:affine:collections',
    label: {
      i18nKey: 'com.affine.cmdk.affine.category.affine.collections',
    },
    score: 10,
  },
  'affine:settings': {
    id: 'command:affine:settings',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.settings' },
    score: 10,
  },
  'affine:updates': {
    id: 'command:affine:updates',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.updates' },
    score: 10,
  },
  'affine:help': {
    id: 'command:affine:help',
    label: { i18nKey: 'com.affine.cmdk.affine.category.affine.help' },
    score: 10,
  },
  'editor:edgeless': {
    id: 'command:editor:edgeless',
    label: { i18nKey: 'com.affine.cmdk.affine.category.editor.edgeless' },
    score: 10,
  },
  'editor:insert-object': {
    id: 'command:editor:insert-object',
    label: { i18nKey: 'com.affine.cmdk.affine.category.editor.insert-object' },
    score: 10,
  },
  'editor:page': {
    id: 'command:editor:page',
    label: { i18nKey: 'com.affine.cmdk.affine.category.editor.page' },
    score: 10,
  },
  'affine:results': {
    id: 'command:affine:results',
    label: { i18nKey: 'com.affine.cmdk.affine.category.results' },
    score: 10,
  },
} satisfies Required<{
  [key in CommandCategory]: QuickSearchGroup & { id: `command:${key}` };
}>;

function filterCommandByContext(
  command: AffineCommand,
  context: {
    docMode: DocMode | undefined;
  }
) {
  if (command.preconditionStrategy === PreconditionStrategy.Always) {
    return true;
  }
  if (command.preconditionStrategy === PreconditionStrategy.InEdgeless) {
    return context.docMode === 'edgeless';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaper) {
    return context.docMode === 'page';
  }
  if (command.preconditionStrategy === PreconditionStrategy.InPaperOrEdgeless) {
    return !!context.docMode;
  }
  if (command.preconditionStrategy === PreconditionStrategy.Never) {
    return false;
  }
  if (typeof command.preconditionStrategy === 'function') {
    return command.preconditionStrategy();
  }
  return true;
}

function getAllCommand(context: { docMode: DocMode | undefined }) {
  const commands = AffineCommandRegistry.getAll();
  return commands.filter(command => {
    return filterCommandByContext(command, context);
  });
}

export class CommandsQuickSearchSession
  extends Entity
  implements QuickSearchSession<'commands', AffineCommand>
{
  constructor(private readonly contextService: GlobalContextService) {
    super();
  }

  query$ = new LiveData('');

  items$ = LiveData.computed(get => {
    const query = get(this.query$);
    const docMode =
      get(this.contextService.globalContext.docMode.$) ?? undefined;
    const commands = getAllCommand({ docMode });

    const fuse = new Fuse(commands, {
      keys: [{ name: 'label.title', weight: 2 }, 'label.subTitle'],
      includeMatches: true,
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.0,
    });

    const result = query
      ? fuse.search(query)
      : commands.map(item => ({ item, matches: [], score: 0 }));

    return result.map<QuickSearchItem<'commands', AffineCommand>>(
      ({ item, matches, score = 1 }) => {
        const normalizedRange = ([start, end]: [number, number]) =>
          [
            start,
            end + 1 /* in fuse, the `end` is different from the `substring` */,
          ] as [number, number];
        const titleMatches = matches
          ?.filter(match => match.key === 'label.title')
          .flatMap(match => match.indices.map(normalizedRange));
        const subTitleMatches = matches
          ?.filter(match => match.key === 'label.subTitle')
          .flatMap(match => match.indices.map(normalizedRange));

        return {
          id: 'command:' + item.id,
          source: 'commands',
          label: {
            title:
              highlighter(
                item.label.title,
                '<b>',
                '</b>',
                titleMatches ?? []
              ) ?? item.label.title,
            subTitle: item.label.subTitle
              ? (highlighter(
                  item.label.subTitle,
                  '<b>',
                  '</b>',
                  subTitleMatches ?? []
                ) ?? item.label.subTitle)
              : undefined,
          },
          group: categories[item.category],
          score:
            1 -
            score /* in fuse, the smaller the score, the better the match, so we need to reverse it */,
          icon: item.icon,
          keyBinding: item.keyBinding?.binding,
          payload: item,
        };
      }
    );
  });

  query(query: string) {
    this.query$.next(query);
  }
}
