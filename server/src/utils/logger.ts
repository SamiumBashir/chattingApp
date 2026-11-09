type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEY_PATTERN =
  /^(password|token|refreshtoken|accesstoken|secret|jwt|authorization|cookie|apikey|apisecret|creditcard|pass|cvv)$/i;

/**
 * Recursively sanitize log data, masking sensitive keys and tokens
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 6) return '[NESTED_OBJECT]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Redact Bearer JWT tokens: Bearer xxx.yyy.zzz
    let cleaned = data.replace(
      /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/gi,
      'Bearer [REDACTED_JWT]'
    );
    // Redact standalone JWT tokens
    cleaned = cleaned.replace(
      /\b[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\b/g,
      '[REDACTED_JWT]'
    );
    return cleaned;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeLogData(data.message, depth + 1),
      stack: process.env.NODE_ENV !== 'production' ? data.stack : undefined,
    };
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const cleanObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        cleanObj[key] = '[REDACTED]';
      } else {
        cleanObj[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return cleanObj;
  }

  return String(data);
}

const formatMessage = (level: LogLevel, message: string, meta?: unknown) => {
  const timestamp = new Date().toISOString();
  const cleanMessage = sanitizeLogData(message) as string;
  const cleanMeta = meta !== undefined ? sanitizeLogData(meta) : undefined;
  const metaStr = cleanMeta !== undefined ? ` ${JSON.stringify(cleanMeta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${cleanMessage}${metaStr}`;
};

export const logger = {
  info: (message: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(formatMessage('info', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(formatMessage('warn', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    console.error(formatMessage('error', message, meta));
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(formatMessage('debug', message, meta));
    }
  },
};
