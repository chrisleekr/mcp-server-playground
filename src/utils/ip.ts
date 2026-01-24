import { type Request } from 'express';
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
 * Process a header value and return the first valid IP
 */
const processHeaderValue = (headerValue: string): string | null => {
  if (headerValue.length > 0) {
    return parseIPList(headerValue);
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
    const headerValue = req.get(header);
    if (headerValue !== undefined && headerValue !== '') {
      const ip = processHeaderValue(headerValue);
      if (ip !== null) return ip;
    }
  }

  // Final fallback
  return 'unknown';
};
