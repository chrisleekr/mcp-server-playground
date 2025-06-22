import { Request } from 'express';
import { isIP } from 'net';

/**
 * Parse comma-separated IPs and return the first valid one
 */
const parseIPList = (ipString: string): string | null => {
  if (!ipString || ipString.trim() === '') {
    return null;
  }

  const ips = ipString.split(',').map(ip => ip.trim());

  for (const ip of ips) {
    if (isIP(ip)) {
      return ip;
    }
  }

  return null;
};

/**
 * Process a header value (string or array) and return the first valid IP
 */
const processHeaderValue = (headerValue: string | string[]): string | null => {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return parseIPList(headerValue);
  }

  if (Array.isArray(headerValue) && headerValue.length > 0) {
    for (const value of headerValue) {
      if (typeof value === 'string' && value.length > 0) {
        const ip = parseIPList(value);
        if (ip !== null) return ip;
      }
    }
  }

  return null;
};

export const getIPAddress = (req: Request): string => {
  // Headers to check in order of priority
  const headerPriority = [
    'cf-connecting-ip', // Cloudflare
    'x-real-ip', // Nginx
    'x-forwarded-for', // Standard proxy header
    'x-client-ip', // Apache
    'x-forwarded', // RFC 7239
    'forwarded-for', // RFC 7239
    'forwarded', // RFC 7239
    'x-cluster-client-ip', // Cluster environments
    'x-original-forwarded-for', // Some CDNs
    'true-client-ip', // Akamai, CloudFlare
  ];

  for (const header of headerPriority) {
    const headerValue = req.headers[header];
    if (headerValue !== undefined && headerValue !== '') {
      const ip = processHeaderValue(headerValue);
      if (ip !== null) return ip;
    }
  }

  // Final fallback
  return 'unknown';
};
