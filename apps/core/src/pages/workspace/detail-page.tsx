import { useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect } from 'react'

type DetailPageParam = {
  workspaceId: string;
  pageId: string;
};

export const Component = () => {
  const param = useParams<DetailPageParam>();
  console.log('param', param);
  // const navigate = useNavigate()
  // useEffect(() => {
  //   navigate('/')
  // }, [navigate])
  return <div>1</div>;
};
