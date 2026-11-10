import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  ttl: number;
  expiresAt: string;
}

const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.services.mozilla.com',
];

export class CallService {
  /**
   * Generates short-lived, authenticated ICE server configurations (STUN and TURN)
   * conforming to RFC 5766 / COTURN ephemeral HMAC-SHA1 credentials.
   *
   * @param userId The authenticated user ID requesting ICE servers
   * @returns IceServersResponse with configured STUN and TURN servers
   */
  public static getIceServers(userId: string): IceServersResponse {
    const iceServers: IceServerConfig[] = [];
    const ttl = env.TURN_CREDENTIAL_TTL || 86400;
    const expiresAtMs = Date.now() + ttl * 1000;
    const expiryTimestamp = Math.floor(expiresAtMs / 1000);

    // 1. STUN Servers (discover public IP & NAT mapping)
    let stunUrls: string[] = DEFAULT_STUN_SERVERS;
    if (env.STUN_SERVERS) {
      const parsedStun = env.STUN_SERVERS.split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      if (parsedStun.length > 0) {
        stunUrls = parsedStun;
      }
    }
    iceServers.push({ urls: stunUrls });

    // 2. TURN Servers (relay media when direct P2P fails due to symmetric NAT/firewall)
    const turnUrls: string[] = [];

    // Helper to format TURN URL with transport protocols
    const addTurnUrls = (rawUrl: string, defaultScheme: 'turn' | 'turns') => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      const base = trimmed.includes('://')
        ? trimmed.replace(/^https?:\/\//, `${defaultScheme}:`)
        : trimmed.startsWith('turn:') || trimmed.startsWith('turns:')
        ? trimmed
        : `${defaultScheme}:${trimmed}`;

      if (base.includes('?transport=')) {
        turnUrls.push(base);
      } else if (defaultScheme === 'turns') {
        // TURNS over TLS defaults to TCP port (typically 5349 or 443)
        turnUrls.push(`${base}?transport=tcp`);
      } else {
        // Standard TURN supports both UDP and TCP
        turnUrls.push(`${base}?transport=udp`);
        turnUrls.push(`${base}?transport=tcp`);
      }
    };

    if (env.TURN_SERVER_URL) {
      env.TURN_SERVER_URL.split(',').forEach((url) => addTurnUrls(url, 'turn'));
    }

    if (env.TURNS_SERVER_URL) {
      env.TURNS_SERVER_URL.split(',').forEach((url) => addTurnUrls(url, 'turns'));
    }

    // 3. Credential generation (ephemeral HMAC-SHA1 or fallback static)
    if (turnUrls.length > 0) {
      if (env.TURN_SECRET) {
        // RFC 5766 REST API format: username is `<timestamp>:<userId>`
        const username = `${expiryTimestamp}:${userId}`;
        const credential = crypto
          .createHmac('sha1', env.TURN_SECRET)
          .update(username)
          .digest('base64');

        iceServers.push({
          urls: turnUrls,
          username,
          credential,
        });
      } else if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
        // Fallback for providers that use static authentication credentials
        iceServers.push({
          urls: turnUrls,
          username: env.TURN_USERNAME,
          credential: env.TURN_CREDENTIAL,
        });
      } else {
        logger.warn(
          'TURN server URL configured without TURN_SECRET or TURN_USERNAME/CREDENTIAL. TURN server skipped.'
        );
      }
    }

    return {
      iceServers,
      ttl,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  /**
   * Helper to verify an ephemeral HMAC-SHA1 TURN credential against a shared secret
   * Useful for auditing, testing, and verifying client-presented credentials.
   */
  public static verifyTurnCredential(
    username: string,
    credential: string,
    secret: string
  ): { valid: boolean; expired: boolean; userId?: string } {
    const parts = username.split(':');
    if (parts.length < 2) {
      return { valid: false, expired: false };
    }

    const expiryTimestamp = parseInt(parts[0], 10);
    const userId = parts.slice(1).join(':');

    if (isNaN(expiryTimestamp)) {
      return { valid: false, expired: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const expired = now > expiryTimestamp;

    const expectedCredential = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');

    const expectedBuffer = Buffer.from(expectedCredential, 'utf8');
    const actualBuffer = Buffer.from(credential, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, expired, userId };
    }

    const valid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    return { valid, expired, userId };
  }
}

