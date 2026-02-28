import { useCallback } from 'react';
import { NavLink } from 'react-router-dom';

import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../utils';

export const NormalSubItem = ({
  module,
  title,
  changeModule,
}: {
  module: string;
  title: string;
  changeModule?: (module: string) => void;
}) => {
  const handleClick = useCallback(() => {
    changeModule?.(module);
  }, [changeModule, module]);
  return (
    <div className="w-full flex">
      <NavLink
        to={`/admin/settings/${module}`}
        onClick={handleClick}
        className={({ isActive }) => {
          return cn(
            buttonVariants({
              variant: 'ghost',
              className: `ml-8 px-2 w-full justify-start ${isActive ? 'bg-zinc-100' : ''}`,
            })
          );
        }}
      >
        {title}
      </NavLink>
    </div>
  );
};
