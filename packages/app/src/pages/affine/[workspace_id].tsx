// for dynamic route get workspace id maybe path will change
import { useRouter } from 'next/router';

const Post = () => {
  const router = useRouter();
  const { workspace_id } = router.query;

  return (
    <p
      style={{
        height: 'calc(100vh)',
        color: 'gray',
      }}
    >
      workspace_id: {workspace_id},
    </p>
  );
};

export default Post;
