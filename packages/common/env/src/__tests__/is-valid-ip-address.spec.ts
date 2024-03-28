import { describe, expect, test } from 'vitest';

import { isValidIPAddress } from '../is-valid-ip-address';

describe('isValidIpAddress', () => {
  test('should return true for valid IP address', () => {
    ['115.42.150.37', '192.168.0.1', '110.234.52.124', 'localhost'].forEach(
      ip => {
        expect(isValidIPAddress(ip)).toBe(true);
      }
    );
  });

  test('should return false for invalid IP address', () => {
    [
      '210.110',
      '255',
      'y.y.y.y',
      '255.0.0.y',
      '666.10.10.20',
      '4444.11.11.11',
      '33.3333.33.3',
    ].forEach(ip => {
      expect(isValidIPAddress(ip)).toBe(false);
    });
  });
});
