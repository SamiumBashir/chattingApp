import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/apiResponse.js';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  ttl: number;
  expiresAt: string;
  isStatic?: boolean;
}

const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.services.mozilla.com',
];

interface MeteredApiCache {
  servers: IceServerConfig[];
  expiresAt: number;
}
let meteredCache: MeteredApiCache | null = null;

export class CallService {
  /**
   * Validates an individual ICE server configuration entry.
   * Ensures URLs are syntactically valid (stun:, turn:, turns:) and that
   * TURN/TURNS entries strictly provide non-empty username and credential.
   */
  public static validateIceServer(server: IceServerConfig): void {
    if (!server || typeof server !== 'object') {
      throw new AppError('Each ICE server entry must be an object', 500, 'INVALID_ICE_CONFIGURATION');
    }

    if (!server.urls || (typeof server.urls !== 'string' && !Array.isArray(server.urls))) {
      throw new AppError('ICE server entry missing valid "urls" field', 500, 'INVALID_ICE_CONFIGURATION');
    }

    const urlList = Array.isArray(server.urls) ? server.urls : [server.urls];
    if (urlList.length === 0) {
      throw new AppError('ICE server "urls" list cannot be empty', 500, 'INVALID_ICE_CONFIGURATION');
    }

    for (const rawUrl of urlList) {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new AppError('ICE server url must be a non-empty string', 500, 'INVALID_ICE_CONFIGURATION');
      }
      const trimmed = rawUrl.trim();
      const isStun = trimmed.startsWith('stun:') || trimmed.startsWith('stuns:');
      const isTurn = trimmed.startsWith('turn:') || trimmed.startsWith('turns:');

      if (!isStun && !isTurn) {
        throw new AppError(
          `Invalid ICE server URL scheme: must start with stun:, turn:, or turns:`,
          500,
          'INVALID_ICE_CONFIGURATION'
        );
      }

      if (isTurn) {
        if (!server.username || typeof server.username !== 'string' || !server.username.trim()) {
          throw new AppError(
            'TURN/TURNS server configuration requires a non-empty username',
            500,
            'INVALID_ICE_CONFIGURATION'
          );
        }
        if (!server.credential || typeof server.credential !== 'string' || !server.credential.trim()) {
          throw new AppError(
            'TURN/TURNS server configuration requires a non-empty credential',
            500,
            'INVALID_ICE_CONFIGURATION'
          );
        }
      }
    }
  }

  /**
   * Parses and validates raw JSON or base64-encoded string representing Metered ICE Servers Array.
   * Preserves all endpoints, protocols (UDP/TCP/TLS), ports, and authentication credentials.
   */
  public static parseMeteredIceServers(rawConfig: string): IceServerConfig[] {
    const trimmed = rawConfig.trim();
    if (!trimmed) {
      throw new AppError('METERED_ICE_SERVERS is empty', 500, 'INVALID_ICE_CONFIGURATION');
    }

    let jsonString = trimmed;
    // Check if base64 encoded
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
        if (decoded.startsWith('[') || decoded.startsWith('{')) {
          jsonString = decoded;
        }
      } catch {
        // Fall back to original string for JSON parse error
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err: any) {
      logger.error('Failed to parse METERED_ICE_SERVERS JSON configuration');
      throw new AppError(
        'Failed to parse METERED_ICE_SERVERS: Invalid JSON format',
        500,
        'INVALID_ICE_CONFIGURATION'
      );
    }

    const rawArray: any[] = Array.isArray(parsed) ? parsed : parsed.iceServers || [parsed];
    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      throw new AppError(
        'METERED_ICE_SERVERS must contain a non-empty array of ICE servers',
        500,
        'INVALID_ICE_CONFIGURATION'
      );
    }

    const validatedServers: IceServerConfig[] = [];
    for (const entry of rawArray) {
      CallService.validateIceServer(entry);
      validatedServers.push({
        urls: entry.urls,
        ...(entry.username ? { username: entry.username } : {}),
        ...(entry.credential ? { credential: entry.credential } : {}),
      });
    }

    return validatedServers;
  }

  /**
   * Fetches dynamic ephemeral TURN credentials from Metered REST API:
   * GET https://[domain].metered.ca/api/v1/turn/credentials?apiKey=[apiKey]
   *
   * Implements secure in-memory caching according to TTL, preventing rate limiting.
   */
  public static async fetchMeteredEphemeralCredentials(
    domain: string,
    apiKey: string,
    cacheTtlSeconds = 3600
  ): Promise<{ iceServers: IceServerConfig[]; ttl: number; expiresAt: string }> {
    const now = Date.now();
    if (meteredCache && now < meteredCache.expiresAt) {
      const remainingSeconds = Math.max(60, Math.floor((meteredCache.expiresAt - now) / 1000));
      return {
        iceServers: meteredCache.servers,
        ttl: remainingSeconds,
        expiresAt: new Date(meteredCache.expiresAt).toISOString(),
      };
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${cleanDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Connectly-Call-Service/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(`Metered API returned HTTP ${response.status} ${response.statusText}`);
        throw new AppError(
          `Metered API authentication or request failed with status ${response.status}`,
          502,
          'ICE_PROVIDER_ERROR'
        );
      }

      const data: any = await response.json();
      const rawServers: any[] = Array.isArray(data) ? data : data.iceServers;
      if (!Array.isArray(rawServers) || rawServers.length === 0) {
        throw new AppError('Metered API returned empty ICE server array', 502, 'ICE_PROVIDER_ERROR');
      }

      const validatedServers: IceServerConfig[] = [];
      for (const entry of rawServers) {
        CallService.validateIceServer(entry);
        validatedServers.push({
          urls: entry.urls,
          ...(entry.username ? { username: entry.username } : {}),
          ...(entry.credential ? { credential: entry.credential } : {}),
        });
      }

      const expiresAtMs = now + cacheTtlSeconds * 1000;
      meteredCache = {
        servers: validatedServers,
        expiresAt: expiresAtMs,
      };

      return {
        iceServers: validatedServers,
        ttl: cacheTtlSeconds,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('Failed to communicate with Metered REST API', { message: err?.message });
      throw new AppError(
        'Unable to contact Metered ICE provider service',
        502,
        'ICE_PROVIDER_ERROR'
      );
    }
  }

  /**
   * Generates standard Metered ICE servers array from static credentials:
   * 1 STUN server + 4 TURN endpoints (UDP port 80, TCP port 80, UDP/TCP port 443, TLS turns: port 443)
   */
  public static generateMeteredStaticServers(
    domain: string,
    username: string,
    credential: string
  ): IceServerConfig[] {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return [
      {
        urls: 'stun:stun.relay.metered.ca:80',
      },
      {
        urls: [
          `turn:${cleanDomain}:80`,
          `turn:${cleanDomain}:80?transport=tcp`,
          `turn:${cleanDomain}:443`,
          `turns:${cleanDomain}:443?transport=tcp`,
        ],
        username,
        credential,
      },
    ];
  }

  /**
   * Clears the in-memory cache for dynamic Metered credentials (useful during testing or key rotation)
   */
  public static clearMeteredCache(): void {
    meteredCache = null;
  }

  /**
   * Generates authenticated ICE server configurations (STUN and TURN)
   * Supporting:
   * 1. Metered Dynamic API (ephemeral credentials via API Key)
   * 2. Metered ICE Servers Array (JSON string copied from dashboard)
   * 3. Metered Static Credentials (Domain, Username, Credential)
   * 4. RFC 5766 CoTURN Ephemeral HMAC-SHA1
   * 5. Fallback Public STUN
   *
   * @param userId The authenticated user ID requesting ICE servers
   * @returns IceServersResponse with configured STUN and TURN servers
   */
  public static async getIceServers(userId: string): Promise<IceServersResponse> {
    // 1. Dynamic Ephemeral Metered REST API credentials
    if (env.METERED_DOMAIN && env.METERED_API_KEY) {
      try {
        const dynamicResult = await CallService.fetchMeteredEphemeralCredentials(
          env.METERED_DOMAIN,
          env.METERED_API_KEY,
          env.METERED_API_CACHE_TTL || 3600
        );
        return {
          iceServers: dynamicResult.iceServers,
          ttl: dynamicResult.ttl,
          expiresAt: dynamicResult.expiresAt,
          isStatic: false,
        };
      } catch (err) {
        // If dynamic fetch fails and fallback exists, continue to fallback; otherwise rethrow
        if (!env.METERED_ICE_SERVERS && !env.TURN_SECRET && !env.TURN_SERVER_URL) {
          throw err;
        }
        logger.warn('Metered dynamic credential fetch failed, falling back to static/CoTURN configuration');
      }
    }

    // 2. Pre-configured Metered ICE Servers JSON Array
    if (env.METERED_ICE_SERVERS) {
      const meteredServers = CallService.parseMeteredIceServers(env.METERED_ICE_SERVERS);
      return {
        iceServers: meteredServers,
        ttl: 0,
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        isStatic: true,
      };
    }

    // 3. Static Metered Domain + Username + Credential
    if (env.METERED_DOMAIN && env.METERED_USERNAME && env.METERED_CREDENTIAL) {
      const staticMetered = CallService.generateMeteredStaticServers(
        env.METERED_DOMAIN,
        env.METERED_USERNAME,
        env.METERED_CREDENTIAL
      );
      return {
        iceServers: staticMetered,
        ttl: 0,
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
        isStatic: true,
      };
    }

    // 4. RFC 5766 CoTURN Ephemeral HMAC-SHA1 or Static CoTURN
    const iceServers: IceServerConfig[] = [];
    const ttl = env.TURN_CREDENTIAL_TTL || 86400;
    const expiresAtMs = Date.now() + ttl * 1000;
    const expiryTimestamp = Math.floor(expiresAtMs / 1000);

    // STUN Servers (discover public IP & NAT mapping)
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

    // CoTURN Servers
    const turnUrls: string[] = [];
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
        turnUrls.push(`${base}?transport=tcp`);
      } else {
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

    let isStatic = true;
    if (turnUrls.length > 0) {
      if (env.TURN_SECRET) {
        isStatic = false;
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
      ttl: isStatic ? 0 : ttl,
      expiresAt: new Date(expiresAtMs).toISOString(),
      isStatic,
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
