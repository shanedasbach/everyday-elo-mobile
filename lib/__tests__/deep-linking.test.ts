/**
 * Tests for the deep linking module
 *
 * Use cases covered:
 * 1. Custom scheme URLs (everyday-elo://share/[code])
 * 2. Universal links (https://everyday-elo.app/share/[code])
 * 3. www subdomain universal links
 * 4. Route generation from parsed results
 * 5. Share URL and deep link builders
 * 6. Invalid/malformed URL handling
 */

// Mock expo-linking
jest.mock('expo-linking', () => ({
  parse: jest.fn((url: string) => {
    try {
      // Simulate Expo Linking.parse behavior
      if (url.startsWith('everyday-elo://')) {
        const withoutScheme = url.replace('everyday-elo://', '');
        const [hostAndPath] = withoutScheme.split('?');
        const parts = hostAndPath.split('/');
        const hostname = parts[0];
        const path = parts.slice(1).join('/') || undefined;
        return {
          scheme: 'everyday-elo',
          hostname,
          path: path ? `/${path}` : undefined,
          queryParams: {},
        };
      }

      if (url.startsWith('https://') || url.startsWith('http://')) {
        const urlObj = new URL(url);
        return {
          scheme: urlObj.protocol.replace(':', ''),
          hostname: urlObj.hostname,
          path: urlObj.pathname,
          queryParams: Object.fromEntries(urlObj.searchParams),
        };
      }

      // Plain path
      return {
        scheme: null,
        hostname: null,
        path: url,
        queryParams: {},
      };
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
  }),
}));

import {
  parseDeepLink,
  getRouteForDeepLink,
  buildShareUrl,
  buildShareDeepLink,
  DeepLinkResult,
} from '../deep-linking';

describe('deep-linking', () => {
  // ============================================
  // parseDeepLink — custom scheme
  // ============================================
  describe('parseDeepLink — custom scheme URLs', () => {
    it('parses everyday-elo://share/abc123', () => {
      const result = parseDeepLink('everyday-elo://share/abc123');
      expect(result).toEqual({ type: 'share', code: 'abc123' });
    });

    it('parses share codes with alphanumeric characters', () => {
      const result = parseDeepLink('everyday-elo://share/x7Kp2mQw');
      expect(result).toEqual({ type: 'share', code: 'x7Kp2mQw' });
    });

    it('returns unknown for unrecognized custom scheme paths', () => {
      const result = parseDeepLink('everyday-elo://unknown/path');
      expect(result).toEqual({ type: 'unknown' });
    });

    it('returns unknown for custom scheme with no path', () => {
      const result = parseDeepLink('everyday-elo://share');
      expect(result).toEqual({ type: 'unknown' });
    });
  });

  // ============================================
  // parseDeepLink — universal links
  // ============================================
  describe('parseDeepLink — universal links', () => {
    it('parses https://everyday-elo.app/share/abc123', () => {
      const result = parseDeepLink('https://everyday-elo.app/share/abc123');
      expect(result).toEqual({ type: 'share', code: 'abc123' });
    });

    it('parses www subdomain universal links', () => {
      const result = parseDeepLink('https://www.everyday-elo.app/share/def456');
      expect(result).toEqual({ type: 'share', code: 'def456' });
    });

    it('returns unknown for non-share paths on the domain', () => {
      const result = parseDeepLink('https://everyday-elo.app/profile');
      expect(result).toEqual({ type: 'unknown' });
    });

    it('returns unknown for other domains', () => {
      const result = parseDeepLink('https://example.com/share/abc');
      expect(result).toEqual({ type: 'unknown' });
    });
  });

  // ============================================
  // parseDeepLink — edge cases
  // ============================================
  describe('parseDeepLink — edge cases', () => {
    it('handles empty string', () => {
      const result = parseDeepLink('');
      expect(result).toEqual({ type: 'unknown' });
    });

    it('handles malformed URL gracefully', () => {
      const result = parseDeepLink('not-a-url-at-all://???');
      expect(result).toEqual({ type: 'unknown' });
    });

    it('handles share path without scheme (Expo Router stripped)', () => {
      const result = parseDeepLink('share/mycode');
      expect(result).toEqual({ type: 'share', code: 'mycode' });
    });

    it('returns unknown when Linking.parse throws', () => {
      const Linking = require('expo-linking');
      const originalParse = Linking.parse;
      Linking.parse = () => { throw new Error('parse failed'); };
      const result = parseDeepLink('anything');
      expect(result).toEqual({ type: 'unknown' });
      Linking.parse = originalParse;
    });

    it('handles custom scheme with path-style parsing (share/CODE without hostname)', () => {
      // Simulate Linking.parse returning scheme but no hostname, path as "share/CODE"
      const Linking = require('expo-linking');
      const originalParse = Linking.parse;
      Linking.parse = () => ({
        scheme: 'everyday-elo',
        hostname: null,
        path: 'share/testcode',
        queryParams: {},
      });
      const result = parseDeepLink('everyday-elo://share/testcode');
      expect(result).toEqual({ type: 'share', code: 'testcode' });
      Linking.parse = originalParse;
    });

    it('returns unknown for custom scheme share path with empty code', () => {
      const Linking = require('expo-linking');
      const originalParse = Linking.parse;
      Linking.parse = () => ({
        scheme: 'everyday-elo',
        hostname: null,
        path: 'share/',
        queryParams: {},
      });
      const result = parseDeepLink('everyday-elo://share/');
      expect(result).toEqual({ type: 'unknown' });
      Linking.parse = originalParse;
    });
  });

  // ============================================
  // getRouteForDeepLink
  // ============================================
  describe('getRouteForDeepLink', () => {
    it('returns /share/[code] route for share type', () => {
      const result: DeepLinkResult = { type: 'share', code: 'abc123' };
      expect(getRouteForDeepLink(result)).toBe('/share/abc123');
    });

    it('returns null for unknown type', () => {
      const result: DeepLinkResult = { type: 'unknown' };
      expect(getRouteForDeepLink(result)).toBeNull();
    });

    it('returns null for share type without code', () => {
      const result: DeepLinkResult = { type: 'share' };
      expect(getRouteForDeepLink(result)).toBeNull();
    });
  });

  // ============================================
  // URL builders
  // ============================================
  describe('buildShareUrl', () => {
    it('builds a web share URL', () => {
      expect(buildShareUrl('abc123')).toBe('https://everyday-elo.app/share/abc123');
    });
  });

  describe('buildShareDeepLink', () => {
    it('builds a custom scheme deep link', () => {
      expect(buildShareDeepLink('abc123')).toBe('everyday-elo://share/abc123');
    });
  });
});
