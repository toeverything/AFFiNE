import { Button } from '@affine/admin/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
import { useQuery } from '@affine/core/hooks/use-query';
import { FeatureType, getCurrentUserFeaturesQuery } from '@affine/graphql';
import { CircleUser } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function UserDropdown() {
  const {
    data: { currentUser },
  } = useQuery({
    query: getCurrentUserFeaturesQuery,
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser) {
      navigate('/admin/auth');
      return;
    }
    if (!currentUser?.features.includes?.(FeatureType.Admin)) {
      toast.error('You are not an admin, please login the admin account.');
      navigate('/admin/auth');
      return;
    }
  }, [currentUser, navigate]);
  const avatar = currentUser?.avatarUrl ? (
    <img src={currentUser?.avatarUrl} />
  ) : (
    <CircleUser size={24} />
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="rounded-full">
          {avatar}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{currentUser?.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Support</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
