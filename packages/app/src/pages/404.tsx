import NotfoundPage from '@/components/404';
import { useAppState } from '@/providers/app-state-provider';

export default function Custom404() {
  const { workspaceList } = useAppState();
  console.log('workspaceList: ', workspaceList);

  return <NotfoundPage></NotfoundPage>;
}
