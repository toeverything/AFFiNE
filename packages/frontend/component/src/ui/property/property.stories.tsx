import { FrameIcon } from '@blocksuite/icons/rc';

import { useDraggable, useDropTarget } from '../dnd';
import { MenuItem } from '../menu';
import {
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
  PropertyRoot,
  PropertyValue,
} from './property';

export default {
  title: 'UI/Property',
};

export const SingleProperty = () => {
  return (
    <>
      <PropertyRoot>
        <PropertyName name="Name" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot>
        <PropertyName name="Long nameeeeeeeeeeeeeeeee" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>

      <PropertyRoot>
        <PropertyName
          name="With Menu"
          icon={<FrameIcon />}
          menuItems={<MenuItem>Menu</MenuItem>}
        />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>

      <PropertyRoot>
        <PropertyName name="Readonly" icon={<FrameIcon />} />
        <PropertyValue readonly>Readonly Value</PropertyValue>
      </PropertyRoot>
    </>
  );
};

export const DNDProperty = () => {
  const { dragRef: dragRef1 } = useDraggable(
    () => ({
      data: { text: 'hello' },
    }),
    []
  );
  const { dragRef: dragRef2 } = useDraggable(
    () => ({
      data: { text: 'hello' },
    }),
    []
  );
  const { dropTargetRef, closestEdge } = useDropTarget(
    () => ({
      closestEdge: {
        allowedEdges: ['top', 'bottom'],
      },
    }),
    []
  );
  return (
    <>
      <PropertyRoot ref={dragRef1}>
        <PropertyName name="Draggable" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot ref={dragRef2}>
        <PropertyName
          name="Draggable Menu"
          icon={<FrameIcon />}
          menuItems={<MenuItem>Menu</MenuItem>}
        />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot ref={dropTargetRef} dropIndicatorEdge={closestEdge}>
        <PropertyName name="DropTarget" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
    </>
  );
};

export const HideEmptyProperty = () => {
  return (
    <>
      <PropertyRoot hideEmpty>
        <PropertyName name="Should not be hidden" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot hideEmpty>
        <PropertyName name="Should be hidden" icon={<FrameIcon />} />
        <PropertyValue isEmpty>Value</PropertyValue>
      </PropertyRoot>
    </>
  );
};

export const BasicPropertyCollapsibleContent = () => {
  return (
    <PropertyCollapsibleContent collapsible>
      <PropertyRoot>
        <PropertyName name="Always show" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot hideEmpty>
        <PropertyName name="Hide with empty" icon={<FrameIcon />} />
        <PropertyValue isEmpty>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot hide>
        <PropertyName name="Hide" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
    </PropertyCollapsibleContent>
  );
};

export const BasicPropertyCollapsibleSection = () => {
  return (
    <PropertyCollapsibleSection
      icon={<FrameIcon />}
      title="Collapsible Section"
    >
      <BasicPropertyCollapsibleContent />
    </PropertyCollapsibleSection>
  );
};

export const PropertyCollapsibleCustomButton = () => {
  return (
    <PropertyCollapsibleContent
      collapsible
      collapseButtonText={({ hide, isCollapsed }) =>
        `${isCollapsed ? 'Show' : 'Hide'} ${hide} properties`
      }
    >
      <PropertyRoot>
        <PropertyName name="Always show" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot hideEmpty>
        <PropertyName name="Hide with empty" icon={<FrameIcon />} />
        <PropertyValue isEmpty>Value</PropertyValue>
      </PropertyRoot>
      <PropertyRoot hide>
        <PropertyName name="Hide" icon={<FrameIcon />} />
        <PropertyValue>Value</PropertyValue>
      </PropertyRoot>
    </PropertyCollapsibleContent>
  );
};
