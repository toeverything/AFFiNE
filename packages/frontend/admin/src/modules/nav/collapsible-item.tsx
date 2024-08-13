import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@affine/admin/components/ui/accordion';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { useNav } from './context';

export const CollapsibleItem = ({
  items,
  title,
  changeModule,
}: {
  title: string;
  items: string[];
  changeModule?: (module: string) => void;
}) => {
  const { activeSubTab, setActiveSubTab } = useNav();
  const handleClick = useCallback(
    (id: string) => {
      const targetElement = document.getElementById(id);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
      changeModule?.(title);
      setActiveSubTab(id);
    },
    [changeModule, setActiveSubTab, title]
  );

  return (
    <Accordion type="multiple" className="w-full ">
      <AccordionItem value="item-1" className="border-b-0">
        <Link to={`/admin/settings#${title}`}>
          <AccordionTrigger
            onClick={() => handleClick(title)}
            className={`py-2 px-3 rounded ${activeSubTab === title ? 'bg-zinc-100' : ''}`}
          >
            {title}
          </AccordionTrigger>
        </Link>
        <AccordionContent className=" flex flex-col gap-2">
          {items.map((item, index) => (
            <Link
              key={index}
              to={`/admin/settings#${item}`}
              className="px-3 overflow-hidden"
            >
              <AccordionContent
                onClick={() => handleClick(item)}
                className={`py-1 px-2 rounded text-ellipsis whitespace-nowrap overflow-hidden ${activeSubTab === item ? 'bg-zinc-100' : ''}`}
              >
                {item}
              </AccordionContent>
            </Link>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
