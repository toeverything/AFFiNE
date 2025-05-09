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

export type MentionProps = {
  user: UserProps;
  doc: DocProps;
};

export function Mention(props: MentionProps) {
  const { user, doc } = props;
  return (
    <Template>
      <Title>You are mentioned!</Title>
      <Content>
        <P>
          <User {...user} /> mentioned you in <Doc {...doc} />.
        </P>
        <Button href={doc.url}>Open Doc</Button>
      </Content>
    </Template>
  );
}

Mention.PreviewProps = {
  user: TEST_USER,
  doc: TEST_DOC,
};
