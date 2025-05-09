import { useDraggable } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import type { AffineDNDData, AffineDNDEntity } from '@affine/core/types/dnd';
import { inferOpenMode as inferOpenAt } from '@affine/core/utils';
import { useLiveData, useServices } from '@toeverything/infra';
import { type To } from 'history';
import { forwardRef, type MouseEvent } from 'react';

import { resolveRouteLinkMeta } from '../../navigation/utils';
import { WorkbenchService } from '../services/workbench';

export type WorkbenchLinkProps = React.PropsWithChildren<
  {
    to: To;
    onClick?: (e: MouseEvent) => void;
    replaceHistory?: boolean;
  } & React.HTMLProps<HTMLAnchorElement>
>;

function resolveToEntity(
  to: To,
  basename: string
): AffineDNDEntity | undefined {
  const link =
    basename +
    (typeof to === 'string' ? to : `${to.pathname}${to.search}${to.hash}`);
  const info = resolveRouteLinkMeta(link);

  if (info?.moduleName === 'doc') {
    return {
      type: 'doc',
      id: info.docId,
    };
  } else if (info?.moduleName === 'collection') {
    return {
      type: 'collection',
      id: info.subModuleName,
    };
  } else if (info?.moduleName === 'tag') {
    return {
      type: 'tag',
      id: info.subModuleName,
    };
  }

  return undefined;
}

export const WorkbenchLink = forwardRef<HTMLAnchorElement, WorkbenchLinkProps>(
  function WorkbenchLink(
    { to, onClick, draggable = true, replaceHistory, ...other },
    ref
  ) {
    const { workbenchService } = useServices({
      WorkbenchService,
    });
    const workbench = workbenchService.workbench;
    const basename = useLiveData(workbench.basename$);
    const stringTo =
      typeof to === 'string' ? to : `${to.pathname}${to.search}${to.hash}`;
    const link = basename + stringTo;
    const handleClick = useAsyncCallback(
      async (event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        const at = inferOpenAt(event);
        workbench.open(to, { at, replaceHistory, show: false });
        event.preventDefault();
        event.stopPropagation();
      },
      [onClick, replaceHistory, to, workbench]
    );

    const { dragRef } = useDraggable<AffineDNDData>(() => {
      return {
        data: {
          entity: resolveToEntity(to, basename),
          from: {
            at: 'workbench:link',
            to: stringTo,
          },
        },
        canDrag:
          typeof draggable === 'boolean' ? draggable : draggable === 'true',
      };
    }, [to, basename, stringTo, draggable]);

    return (
      <a
        {...other}
        ref={node => {
          dragRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        href={link}
        onClick={handleClick}
        onAuxClick={handleClick}
      />
    );
  }
);
