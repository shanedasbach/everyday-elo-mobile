import * as Linking from 'expo-linking';

const APP_SCHEME = 'everyday-elo';
const WEB_HOST = 'everyday-elo.app';

export interface DeepLinkResult {
  type: 'share' | 'unknown';
  code?: string;
}

/**
 * Parse an incoming URL into a deep link result.
 * Handles both custom scheme (everyday-elo://share/[code])
 * and universal links (https://everyday-elo.app/share/[code]).
 */
export function parseDeepLink(url: string): DeepLinkResult {
  try {
    const parsed = Linking.parse(url);

    // Custom scheme: everyday-elo://share/CODE
    if (parsed.scheme === APP_SCHEME) {
      if (parsed.hostname === 'share' && parsed.path) {
        return { type: 'share', code: parsed.path.replace(/^\//, '') };
      }
      // everyday-elo://share/CODE can also parse as path="share/CODE"
      if (parsed.path?.startsWith('share/')) {
        const code = parsed.path.replace('share/', '');
        if (code) return { type: 'share', code };
      }
    }

    // Universal link: https://everyday-elo.app/share/CODE
    if (parsed.hostname === WEB_HOST || parsed.hostname === `www.${WEB_HOST}`) {
      const match = parsed.path?.match(/^\/share\/(.+)/);
      if (match && match[1]) {
        return { type: 'share', code: match[1] };
      }
    }

    // Expo Router may strip scheme/host — check path directly (only when no hostname)
    if (!parsed.hostname && (parsed.path?.startsWith('share/') || parsed.path?.startsWith('/share/'))) {
      const code = parsed.path.replace(/^\/?share\//, '');
      if (code) return { type: 'share', code };
    }

    return { type: 'unknown' };
  } catch {
    return { type: 'unknown' };
  }
}

/**
 * Build the in-app route path for a deep link result.
 * Returns null if the link type is unknown.
 */
export function getRouteForDeepLink(result: DeepLinkResult): string | null {
  if (result.type === 'share' && result.code) {
    return `/share/${result.code}`;
  }
  return null;
}

/**
 * Build a shareable URL for a given share code.
 */
export function buildShareUrl(shareCode: string): string {
  return `https://${WEB_HOST}/share/${shareCode}`;
}

/**
 * Build a custom scheme deep link URL for a share code.
 */
export function buildShareDeepLink(shareCode: string): string {
  return `${APP_SCHEME}://share/${shareCode}`;
}
