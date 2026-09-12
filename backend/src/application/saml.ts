import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import * as xpath from 'xpath';

import { errors } from '../domain/errors.js';
import type { SsoProfile } from '../domain/sso.js';

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const SIGNATURE_XPATH = `//*[local-name(.)='Signature' and namespace-uri(.)='${DSIG_NS}']`;

export function encodeSamlRequest(xml: string): string {
  return deflateRawSync(Buffer.from(xml, 'utf8')).toString('base64');
}

export function decodeSamlResponse(raw: string): string {
  const padded = raw.replaceAll(/\s/g, '');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function buildAuthnRequest(input: {
  id: string;
  acsUrl: string;
  entityId: string;
  destination: string;
  issueInstant: string;
}): string {
  return (
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${input.id}" Version="2.0" IssueInstant="${input.issueInstant}" Destination="${escapeXml(input.destination)}" AssertionConsumerServiceURL="${escapeXml(input.acsUrl)}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">` +
    `<saml:Issuer>${escapeXml(input.entityId)}</saml:Issuer>` +
    `</samlp:AuthnRequest>`
  );
}

/**
 * Cryptographically verify the XML-DSig `<Signature>` embedded in a SAML
 * response/assertion against the configured IdP certificate.
 *
 * Clean-room note: this uses the well-known `xml-crypto` library (public
 * W3C XML Signature spec implementation), not any AFFiNE EE code. We only
 * trust bytes that are inside a signature-verified reference
 * (`getSignedReferences()`), never the raw unauthenticated document, to
 * avoid XML signature wrapping attacks.
 */
function verifySignedXml(rawXml: string, certificate: string): string {
  let doc: unknown;
  try {
    doc = new DOMParser().parseFromString(rawXml, 'text/xml');
  } catch {
    throw errors.samlInvalid();
  }
  const signatureNodes = xpath.select(SIGNATURE_XPATH, doc as unknown as Node);
  if (!Array.isArray(signatureNodes) || signatureNodes.length === 0) {
    throw errors.samlInvalid();
  }
  for (const signatureNode of signatureNodes) {
    try {
      const verifier = new SignedXml({ publicCert: certificate });
      verifier.loadSignature(signatureNode as unknown as Node);
      const isValid = verifier.checkSignature(rawXml);
      if (isValid) {
        const signedReferences = verifier.getSignedReferences();
        if (signedReferences.length > 0 && signedReferences[0]) {
          return signedReferences[0];
        }
      }
    } catch {
      // Try the next <Signature> candidate (e.g. Response vs. Assertion).
    }
  }
  throw errors.samlInvalid();
}

export function parseSamlAssertion(
  xml: string,
  certificate?: string
): SsoProfile {
  const hasCertificate = Boolean(certificate && certificate.trim().length > 0);
  // When a certificate is configured, only trust bytes that passed real
  // XML-DSig verification. Without one (dev/test IdP), fall back to parsing
  // the raw assertion, matching the historical "unsigned" self-host mode.
  const source = hasCertificate
    ? verifySignedXml(xml, certificate as string)
    : xml;
  const nameId = firstTag(source, 'NameID');
  const email =
    attributeValue(source, 'email') ??
    attributeValue(
      source,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
    ) ??
    nameId;
  if (!email || !email.includes('@')) {
    throw errors.samlInvalid();
  }
  const name =
    attributeValue(source, 'displayName') ??
    attributeValue(
      source,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
    ) ??
    email.split('@')[0] ??
    'user';
  return {
    provider: 'SAML',
    providerAccountId: nameId ?? email,
    email,
    name,
  };
}

export function inflateSamlRequest(encoded: string): string {
  return inflateRawSync(Buffer.from(encoded, 'base64')).toString('utf8');
}

function firstTag(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[\\w]+:)?${localName}[^>]*>([^<]*)</(?:[\\w]+:)?${localName}>`,
    'i'
  );
  const match = xml.match(re);
  return match?.[1]?.trim() || null;
}

function attributeValue(xml: string, name: string): string | null {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = new RegExp(
    `<(?:[\\w]+:)?Attribute[^>]*Name="${escaped}"[^>]*>\\s*<(?:[\\w]+:)?AttributeValue[^>]*>([^<]*)</`,
    'i'
  );
  const match = xml.match(named);
  return match?.[1]?.trim() || null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
