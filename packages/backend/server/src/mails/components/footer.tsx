import { Container, Img, Link, Row, Section } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BasicTextStyle } from './common';

const TextStyles: CSSProperties = {
  ...BasicTextStyle,
  color: '#8e8d91',
  marginTop: '8px',
};

export const Footer = () => {
  return (
    <Container
      style={{
        backgroundColor: '#fafafa',
        maxWidth: '450px',
        marginTop: '0',
        marginBottom: '32px',
        borderRadius: '0 0 16px 16px',
        boxShadow: '0px 0px 20px 0px rgba(66, 65, 73, 0.04)',
        padding: '24px',
      }}
    >
      <Section align="center" width="auto" style={{ margin: '1px auto' }}>
        <Row>
          {['Github', 'Twitter', 'Discord', 'Youtube', 'Reddit'].map(
            platform => (
              <td key={platform} style={{ padding: '0 10px' }}>
                <Link href={`https://affine.pro/${platform.toLowerCase()}`}>
                  <Img
                    src={`https://cdn.affine.pro/mail/2023-8-9/${platform}.png`}
                    alt={`affine ${platform.toLowerCase()} link`}
                    height="16px"
                  />
                </Link>
              </td>
            )
          )}
        </Row>
      </Section>
      <Section align="center" width="auto">
        <Row style={TextStyles}>
          <td>One hyper-fused platform for wildly creative minds</td>
        </Row>
      </Section>
      <Section align="center" width="auto">
        <Row style={TextStyles}>
          <td>Copyright</td>
          <td>
            <Img
              src="https://cdn.affine.pro/mail/2023-8-9/copyright.png"
              alt="copyright"
              height="14px"
              style={{ verticalAlign: 'middle', margin: '0 4px' }}
            />
          </td>
          <td>2023-{new Date().getUTCFullYear()} ToEverything</td>
        </Row>
      </Section>
    </Container>
  );
};
