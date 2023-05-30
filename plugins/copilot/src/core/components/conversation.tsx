import { marked } from 'marked';
import { type ReactElement, useMemo } from 'react';

export interface ConversationProps {
  text: string;
}

export const Conversation = (props: ConversationProps): ReactElement => {
  const html = useMemo(() => marked.parse(props.text), [props.text]);
  return (
    <div>
      <div
        dangerouslySetInnerHTML={{
          __html: html,
        }}
      />
    </div>
  );
};
