import { memo, useCallback, useMemo, useState } from 'react';

import { RadioGroup } from '../radio';
import { ResizePanel } from '../resize-panel/resize-panel';
import { Masonry } from './masonry';

export default {
  title: 'UI/Masonry',
};

const Card = ({
  children,
  listView,
}: {
  children: React.ReactNode;
  listView?: boolean;
}) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: listView ? 0 : 10,
        border: listView
          ? '0px solid rgba(100, 100, 100, 0.2)'
          : '1px solid rgba(100, 100, 100, 0.2)',
        boxShadow: listView ? 'none' : '0 1px 10px rgba(0, 0, 0, 0.1)',
        padding: listView ? '0px 20px' : 10,
        backgroundColor: listView ? 'transparent' : 'white',
        display: 'flex',
        flexDirection: listView ? 'row' : 'column',
        gap: 8,
        alignItems: listView ? 'center' : 'flex-start',
      }}
    >
      {children}
      {listView && (
        <div
          style={{
            position: 'absolute',
            top: `calc(100% + 5px)`,
            left: 0,
            borderBottom: `0.5px solid rgba(100, 100, 100, 0.2)`,
            width: '100%',
          }}
        />
      )}
    </div>
  );
};

const basicCards = Array.from({ length: 10000 }, (_, i) => {
  return {
    id: 'card-' + i,
    height: Math.round(100 + Math.random() * 100),
    children: (
      <Card>
        <h1>Hello</h1>
        <p>World</p>
        {i}
      </Card>
    ),
  };
});

export const BasicVirtualScroll = () => {
  return (
    <ResizePanel width={800} height={600}>
      <Masonry
        gapX={10}
        gapY={10}
        style={{ width: '100%', height: '100%' }}
        paddingX={12}
        paddingY={12}
        virtualScroll
        items={basicCards}
      />
    </ResizePanel>
  );
};

const transitionCards = Array.from({ length: 10000 }, (_, i) => {
  return {
    id: 'card-' + i,
    height: Math.round(100 + Math.random() * 100),
    children: <Card>{i}</Card>,
    style: { transition: 'transform 0.2s ease' },
  };
});

export const CustomTransition = () => {
  return (
    <ResizePanel width={800} height={600}>
      <Masonry
        gapX={10}
        gapY={10}
        style={{ width: '100%', height: '100%' }}
        paddingX={12}
        paddingY={12}
        virtualScroll
        items={transitionCards}
        locateMode="transform3d"
      />
    </ResizePanel>
  );
};

const groups = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
  return {
    id: letter,
    height: 20,
    children: <h1>Group header: {letter}</h1>,
    items: Array.from({ length: 100 }, (_, i) => {
      return {
        id: i,
        height: Math.round(100 + Math.random() * 100),
        children: (
          <Card>
            <div>Group: {letter}</div>
            <div>Item: {i}</div>
          </Card>
        ),
      };
    }),
  };
});

export const GroupVirtualScroll = () => {
  return (
    <ResizePanel width={800} height={600}>
      <Masonry
        gapX={10}
        gapY={10}
        style={{ width: '100%', height: '100%' }}
        paddingX={12}
        paddingY={12}
        virtualScroll
        groupsGap={10}
        groupHeaderGapWithItems={10}
        items={groups}
        locateMode="transform3d"
      />
    </ResizePanel>
  );
};

const GroupHeader = memo(function GroupHeader({
  groupId,
  collapsed,
  itemCount,
}: {
  groupId: string;
  collapsed?: boolean;
  itemCount: number;
}) {
  return (
    <header
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <h1>
        Group header: {groupId} - {itemCount} items{' '}
        <span
          style={{
            display: 'inline-block',
            transform: `rotate(${collapsed ? 0 : 90}deg)`,
            transition: 'transform 0.2s ease',
          }}
        >
          &gt;
        </span>
      </h1>
    </header>
  );
});

const GroupItem = ({
  groupId,
  itemId,
  view,
}: {
  groupId: string;
  itemId: string;
  view: 'Masonry' | 'Grid' | 'List';
}) => {
  return (
    <Card listView={view === 'List'}>
      <div>Group: {groupId}</div>
      <div>Item: {itemId}</div>
    </Card>
  );
};

const viewGroups = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
  return {
    id: letter,
    height: 40,
    Component: GroupHeader,
    style: { transition: 'all 0.4s cubic-bezier(.4,.22,0,.98)' },
    items: Array.from(
      { length: Math.round(50 + Math.random() * 50) },
      (_, i) => {
        return {
          id: `${i}`,
          height: {
            List: 32,
            Masonry: Math.round(100 + Math.random() * 100),
            Grid: 100,
          },
          style: { transition: 'all 0.4s cubic-bezier(.4,.22,0,.98)' },
        };
      }
    ),
  } as const;
});

export const MultiViewTransition = () => {
  const [view, setView] = useState<'Masonry' | 'Grid' | 'List'>('List');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const groups = useMemo(() => {
    return viewGroups.map(({ items, ...g }) => ({
      ...g,
      items: items.map(({ height, ...item }) => ({
        ...item,
        height: height[view],
        children: <GroupItem groupId={g.id} itemId={item.id} view={view} />,
      })),
    }));
  }, [view]);

  const onGroupCollapse = useCallback((groupId: string, collapsed: boolean) => {
    setCollapsedGroups(prev => {
      return collapsed ? [...prev, groupId] : prev.filter(id => id !== groupId);
    });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <RadioGroup
        items={['Masonry', 'Grid', 'List']}
        value={view}
        onChange={setView}
        width={300}
      />
      <ResizePanel
        width={800}
        height={600}
        offsetModifier={useCallback(([x, y]: number[]) => [x * 2, y], [])}
      >
        <Masonry
          gapX={10}
          gapY={10}
          style={{ width: '100%', height: '100%' }}
          paddingX={12}
          paddingY={0}
          virtualScroll
          groupsGap={10}
          groupHeaderGapWithItems={10}
          items={groups}
          locateMode="transform3d"
          columns={view === 'List' ? 1 : undefined}
          collapsedGroups={collapsedGroups}
          onGroupCollapse={onGroupCollapse}
        />
      </ResizePanel>
    </div>
  );
};

const availableRatios = [0.8, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8];
const ratioItems = Array.from({ length: 10000 }, (_, i) => {
  const ratio =
    availableRatios[Math.floor(Math.random() * availableRatios.length)];
  return {
    id: i.toString(),
    ratio,
    children: (
      <Card>
        {i} <br /> ratio: {ratio}
      </Card>
    ),
  };
});
export const HeightByRatio = () => {
  return (
    <ResizePanel width={800} height={600}>
      <Masonry
        gapX={10}
        gapY={10}
        style={{ width: '100%', height: '100%' }}
        paddingX={12}
        paddingY={12}
        items={ratioItems}
        virtualScroll
        itemWidthMin={120}
      />
    </ResizePanel>
  );
};
