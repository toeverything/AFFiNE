import { TEST_DOC, TEST_USER } from '../common';
import {
  Button,
  Content,
  Doc,
  type DocProps,
  P,
  Template,
  Title,
  User,
  type UserProps,
} from '../components';

export type CommentProps = {
  user: UserProps;
  doc: DocProps;
};

export function Comment(props: CommentProps) {
  const { user, doc } = props;
  return (
    <Template>
      <Title>You have a new comment</Title>
      <Content>
        <P>
          <User {...user} /> commented on <Doc {...doc} />.
        </P>
        <Button href={doc.url}>View Comment</Button>
      </Content>
    </Template>
  );
}

Comment.PreviewProps = {
  user: TEST_USER,
  doc: TEST_DOC,
};
