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

export type CommentMentionProps = {
  user: UserProps;
  doc: DocProps;
};

export function CommentMention(props: CommentMentionProps) {
  const { user, doc } = props;
  return (
    <Template>
      <Title>You are mentioned in a comment</Title>
      <Content>
        <P>
          <User {...user} /> mentioned you in a comment on <Doc {...doc} />.
        </P>
        <Button href={doc.url}>View Comment</Button>
      </Content>
    </Template>
  );
}

CommentMention.PreviewProps = {
  user: TEST_USER,
  doc: TEST_DOC,
};
