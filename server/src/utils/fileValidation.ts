import path from 'path';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
] as const;

export const ALLOWED_DOC_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
] as const;

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_AUDIO_MIME_TYPES,
  ...ALLOWED_DOC_MIME_TYPES,
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

export const ALLOWED_AUDIO_EXTENSIONS = [
  '.webm',
  '.mp4',
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
] as const;

export const ALLOWED_DOC_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
  '.json',
] as const;

export const ALLOWED_EXTENSIONS = [
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_AUDIO_EXTENSIONS,
  ...ALLOWED_DOC_EXTENSIONS,
] as const;

export const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.php',
  '.phtml',
  '.php3',
  '.php4',
  '.php5',
  '.phps',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.msi',
  '.scr',
  '.dll',
  '.com',
  '.hta',
  '.svg', // Disallow SVG to prevent embedded JavaScript XSS vectors
  '.html',
  '.htm',
  '.xhtml',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.lnk',
  '.inf',
  '.reg',
] as const;

export const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/x-csh',
  'application/x-php',
  'text/javascript',
  'application/javascript',
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/x-httpd-php',
  'application/x-python-code',
  'application/x-msdos-program',
] as const;

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Sanitize filename to prevent directory traversal and null byte injections
 */
export function sanitizeFileName(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    return `file_${Date.now()}`;
  }

  // Strip null bytes and control characters
  let cleanName = originalName.replace(/[\x00-\x1F\x7F]/g, '');

  // Strip directory paths (both forward and backward slashes)
  cleanName = cleanName.replace(/^[a-zA-Z]:[/\\]/, ''); // Strip drive letters
  cleanName = path.basename(cleanName);

  // Replace hazardous characters with an underscore
  cleanName = cleanName.replace(/[<>:"/\\|?*;&$#\r\n\t]/g, '_');

  // Strip leading dots to prevent hidden files or traversal (. or ..)
  cleanName = cleanName.replace(/^\.+/, '');

  if (!cleanName || cleanName.trim() === '') {
    cleanName = `attachment_${Date.now()}`;
  }

  // Limit filename length to 200 chars while preserving extension
  const ext = path.extname(cleanName);
  const base = path.basename(cleanName, ext);
  if (base.length > 180) {
    cleanName = `${base.slice(0, 180)}${ext}`;
  }

  return cleanName;
}

/**
 * Validate file name, mime type and size against allowlist and blocklist
 */
export function validateUploadedFile(
  fileName: string,
  mimeType: string,
  fileSize?: number
): { valid: boolean; error?: string; code?: string } {
  const cleanName = sanitizeFileName(fileName);
  const ext = path.extname(cleanName).toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase().trim();

  // 1. Check blocked executable extensions
  if (BLOCKED_EXTENSIONS.some((blocked) => ext === blocked || cleanName.toLowerCase().endsWith(blocked))) {
    return {
      valid: false,
      error: `File extension '${ext}' is not permitted for security reasons`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 2. Check blocked dangerous MIME types
  if (BLOCKED_MIME_TYPES.some((blocked) => lowerMime.includes(blocked))) {
    return {
      valid: false,
      error: `MIME type '${mimeType}' is not permitted for security reasons`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 3. Verify against allowed extensions
  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext as any);
  if (!isAllowedExt) {
    return {
      valid: false,
      error: `Unsupported file type '${ext || 'unknown'}'. Please upload images, audio, or standard documents.`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 4. Verify against allowed MIME types
  const isAllowedMime =
    ALLOWED_MIME_TYPES.includes(lowerMime as any) ||
    lowerMime === 'application/octet-stream' && isAllowedExt; // allow octet-stream only if extension is safe doc

  if (!isAllowedMime) {
    return {
      valid: false,
      error: `Unsupported MIME type '${mimeType}'`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 5. Cross-check extension and MIME category to prevent spoofing
  const isImageExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext as any);
  const isImageMime = ALLOWED_IMAGE_MIME_TYPES.includes(lowerMime as any);
  if (isImageExt && !isImageMime && lowerMime !== 'application/octet-stream') {
    return {
      valid: false,
      error: `File extension '${ext}' does not match image MIME type '${mimeType}'`,
      code: 'MIME_EXTENSION_MISMATCH',
    };
  }

  const isAudioExt = ALLOWED_AUDIO_EXTENSIONS.includes(ext as any);
  const isAudioMime = ALLOWED_AUDIO_MIME_TYPES.includes(lowerMime as any);
  if (isAudioExt && !isAudioMime && lowerMime !== 'application/octet-stream') {
    return {
      valid: false,
      error: `File extension '${ext}' does not match audio MIME type '${mimeType}'`,
      code: 'MIME_EXTENSION_MISMATCH',
    };
  }

  // 6. Size validations if provided
  if (typeof fileSize === 'number') {
    if (fileSize <= 0) {
      return {
        valid: false,
        error: 'File cannot be empty',
        code: 'EMPTY_FILE',
      };
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds the 25MB maximum limit`,
        code: 'FILE_TOO_LARGE',
      };
    }

    if (isImageExt && fileSize > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image size exceeds the 10MB limit`,
        code: 'IMAGE_TOO_LARGE',
      };
    }
  }

  return { valid: true };
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate URL to prevent javascript: or unsafe protocol injections
 */
export function isValidAssetUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // In test/development, allow data: or localhost URLs
  if (process.env.NODE_ENV !== 'production') {
    if (trimmed.startsWith('data:') || trimmed.startsWith('http://localhost')) {
      return true;
    }
  }

  // Must be HTTPS in production
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}
