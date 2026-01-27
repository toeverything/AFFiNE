import { useCallback } from 'react';
import { NavLink } from 'react-router-dom';

import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../utils';

export const NormalSubItem = ({
  module,
  title,
  changeModule,
  indent = 'normal',
}: {
  module: string;
  title: string;
  changeModule?: (module: string) => void;
  indent?: 'normal' | 'nested';
}) => {
  const handleClick = useCallback(() => {
    changeModule?.(module);
  }, [changeModule, module]);
  const indentClassName = indent === 'nested' ? 'ml-12' : 'ml-8';
  return (
    <div className="w-full flex">
      <NavLink
        to={`/admin/settings/${module}`}
        onClick={handleClick}
        className={({ isActive }) => {
          return cn(
            buttonVariants({
              variant: 'ghost',
              className: cn(
                indentClassName,
                'px-2 w-full justify-start',
                isActive && 'bg-zinc-100'
              ),
            })
          );
        }}
      >
        {title}
      </NavLink>
    </div>
  );
};
