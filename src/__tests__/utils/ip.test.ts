import type { Request } from 'express';

import { getIPAddress } from '@/utils/ip';

describe('getIPAddress', () => {
  const createMockRequest = (
    headers: Record<string, string | undefined>
  ): Request => {
    return {
      headers,
      get: (name: string): string | undefined => {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;
  };

  it('returns IP from cf-connecting-ip header (Cloudflare)', () => {
    const req = createMockRequest({ 'cf-connecting-ip': '192.168.1.1' });
    expect(getIPAddress(req)).toBe('192.168.1.1');
  });

  it('returns IP from x-real-ip header (Nginx)', () => {
    const req = createMockRequest({ 'x-real-ip': '10.0.0.1' });
    expect(getIPAddress(req)).toBe('10.0.0.1');
  });

  it('returns first valid IP from x-forwarded-for header with multiple IPs', () => {
    const req = createMockRequest({
      'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
    });
    expect(getIPAddress(req)).toBe('203.0.113.195');
  });

  it('returns first IP from comma-separated header value', () => {
    const req = createMockRequest({
      'x-forwarded-for': '172.16.0.1, 192.168.0.1',
    });
    expect(getIPAddress(req)).toBe('172.16.0.1');
  });

  it('returns unknown when no valid headers are present', () => {
    const req = createMockRequest({});
    expect(getIPAddress(req)).toBe('unknown');
  });

  it('returns unknown when headers contain invalid IPs', () => {
    const req = createMockRequest({
      'x-forwarded-for': 'invalid-ip, also-invalid',
    });
    expect(getIPAddress(req)).toBe('unknown');
  });

  it('skips empty header values', () => {
    const req = createMockRequest({
      'cf-connecting-ip': '',
      'x-real-ip': '10.10.10.10',
    });
    expect(getIPAddress(req)).toBe('10.10.10.10');
  });

  it('handles IPv6 addresses', () => {
    const req = createMockRequest({
      'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    });
    expect(getIPAddress(req)).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });

  it('prioritizes headers in correct order', () => {
    const req = createMockRequest({
      'x-forwarded-for': '10.0.0.2',
      'cf-connecting-ip': '10.0.0.1',
      'x-real-ip': '10.0.0.3',
    });
    expect(getIPAddress(req)).toBe('10.0.0.1');
  });
});
