import { useParams } from 'react-router-dom';

type DetailPageParam = {
  workspaceId: string;
  pageId: string;
};

export const Component = () => {
  const param = useParams<DetailPageParam>();
  console.log('param', param);
  return <div></div>;
};
