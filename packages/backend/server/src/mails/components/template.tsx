import {
  Body,
  Button as EmailButton,
  Container,
  Head,
  Html,
  Img,
  Link,
  Row,
  Section,
  Text as EmailText,
} from '@react-email/components';
import type { PropsWithChildren } from 'react';

import { BasicTextStyle } from './common';
import { Footer } from './footer';

export function Title(props: PropsWithChildren) {
  return (
    <EmailText
      style={{
        ...BasicTextStyle,
        fontSize: '20px',
        fontWeight: '600',
        lineHeight: '28px',
      }}
    >
      {props.children}
    </EmailText>
  );
}

export function P(props: PropsWithChildren) {
  return <EmailText style={BasicTextStyle}>{props.children}</EmailText>;
}

export function Text(props: PropsWithChildren) {
  return <span style={BasicTextStyle}>{props.children}</span>;
}

export function SecondaryText(props: PropsWithChildren) {
  return (
    <span
      style={{
        ...BasicTextStyle,
        color: '#7A7A7A',
        fontSize: '14px',
        lineHeight: '22px',
      }}
    >
      {props.children}
    </span>
  );
}

export function Bold(props: PropsWithChildren) {
  return <span style={{ fontWeight: 600 }}>{props.children}</span>;
}

export const Avatar = (props: {
  img: string;
  width?: string;
  height?: string;
}) => {
  return (
    <img
      src={props.img}
      alt="avatar"
      style={{
        width: props.width || '20px',
        height: props.height || '20px',
        borderRadius: '12px',
        objectFit: 'cover',
        verticalAlign: 'middle',
      }}
    />
  );
};

export const OnelineCodeBlock = (props: PropsWithChildren) => {
  return (
    <pre
      style={{
        ...BasicTextStyle,
        whiteSpace: 'nowrap',
        border: '1px solid rgba(0,0,0,.1)',
        padding: '8px 10px',
        borderRadius: '4px',
        backgroundColor: '#F5F5F5',
      }}
    >
      {props.children}
    </pre>
  );
};

export const Name = (props: PropsWithChildren) => {
  return <Bold>{props.children}</Bold>;
};

export const AvatarWithName = (props: {
  img?: string;
  name: string;
  width?: string;
  height?: string;
}) => {
  return (
    <>
      {props.img && (
        <Avatar img={props.img} width={props.width} height={props.height} />
      )}
      <Name>{props.name}</Name>
    </>
  );
};

export function Content(props: PropsWithChildren) {
  return typeof props.children === 'string' ? (
    <EmailText>{props.children}</EmailText>
  ) : (
    props.children
  );
}

export function Button(
  props: PropsWithChildren<{ type?: 'primary' | 'secondary'; href: string }>
) {
  const style = {
    ...BasicTextStyle,
    backgroundColor: props.type === 'secondary' ? '#FFFFFF' : '#1E96EB',
    color: props.type === 'secondary' ? '#141414' : '#FFFFFF',
    textDecoration: 'none',
    fontWeight: '600',
    padding: '8px 18px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,.1)',
    marginRight: '4px',
  };

  return (
    <EmailButton style={style} href={props.href}>
      {props.children}
    </EmailButton>
  );
}

function fetchTitle(
  children: React.ReactElement<PropsWithChildren>[]
): React.ReactElement {
  const title = children.find(child => child.type === Title);

  if (!title || !title.props.children) {
    throw new Error('<Title /> is required for an email.');
  }

  return title;
}

function fetchContent(
  children: React.ReactElement<PropsWithChildren>[]
): React.ReactElement | React.ReactElement[] {
  const content = children.find(child => child.type === Content);

  if (!content || !content.props.children) {
    throw new Error('<Content /> is required for an email.');
  }

  if (Array.isArray(content.props.children)) {
    return content.props.children.map((child, i) => {
      /* oxlint-disable-next-line eslint-plugin-react/no-array-index-key */
      return <Row key={i}>{child}</Row>;
    });
  }

  return content;
}

function assertChildrenIsArray(
  children: React.ReactNode
): asserts children is React.ReactElement<PropsWithChildren>[] {
  if (!Array.isArray(children) || !children.every(child => 'type' in child)) {
    throw new Error(
      'Children of `Template` element must be an array of [<Title />, <Content />, ...]'
    );
  }
}

export function Template(props: PropsWithChildren) {
  assertChildrenIsArray(props.children);

  const content = (
    <>
      <Section>{fetchTitle(props.children)}</Section>
      <Section>{fetchContent(props.children)}</Section>
    </>
  );

  if (globalThis.env?.testing) {
    return content;
  }

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f7fb', overflow: 'hidden' }}>
        <Container
          style={{
            backgroundColor: '#fff',
            maxWidth: '450px',
            margin: '32px auto 0',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0px 0px 20px 0px rgba(66, 65, 73, 0.04)',
            padding: '24px',
          }}
        >
          <Section>
            <Link href="https://affine.pro">
              <Img
                src="https://cdn.affine.pro/mail/2023-8-9/affine-logo.png"
                alt="AFFiNE logo"
                height="32px"
              />
            </Link>
          </Section>
          {content}
        </Container>
        <Footer />
      </Body>
    </Html>
  );
}
