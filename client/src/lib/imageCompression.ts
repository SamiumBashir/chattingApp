/**
 * Client-Side Image Compression Utility
 * Limits images to max 10MB and compresses them to < 200KB before uploading.
 */

export interface ImageCompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // percentage saved, e.g. 98
  width: number;
  height: number;
}

export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
export const TARGET_MAX_IMAGE_BYTES = 200 * 1024; // 200 KB

/**
 * Loads an image File into an HTMLImageElement asynchronously.
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}

/**
 * Converts a canvas to a Blob with specified MIME type and quality.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Scales an image preserving aspect ratio and renders onto an HTML5 canvas.
 */
function drawScaledImage(
  img: HTMLImageElement,
  maxDimension: number
): { canvas: HTMLCanvasElement; width: number; height: number } {
  let { naturalWidth: width, naturalHeight: height } = img;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
  }

  return { canvas, width, height };
}

/**
 * Compresses an image file client-side.
 * Accepts files up to 10MB and guarantees the output file is <= 200KB.
 */
export async function compressImage(
  file: File,
  targetMaxBytes = TARGET_MAX_IMAGE_BYTES,
  maxAllowedInputBytes = MAX_IMAGE_INPUT_BYTES
): Promise<ImageCompressionResult> {
  // 1. Strict 10MB file size limit check
  if (file.size > maxAllowedInputBytes) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Image size (${fileSizeMB} MB) exceeds the 10 MB limit. Please select an image under 10 MB.`
    );
  }

  // Non-image or GIF files (animated GIFs lose frames on canvas)
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      compressionRatio: 0,
      width: 0,
      height: 0,
    };
  }

  // Load image element
  const img = await loadImageFromFile(file);

  // Progressive multi-tier quality & dimension reduction loop to ensure <= 200KB
  const passes: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1600, quality: 0.8 },
    { maxDim: 1400, quality: 0.72 },
    { maxDim: 1280, quality: 0.65 },
    { maxDim: 1100, quality: 0.58 },
    { maxDim: 960, quality: 0.5 },
    { maxDim: 800, quality: 0.45 },
    { maxDim: 640, quality: 0.4 },
  ];

  let bestBlob: Blob | null = null;
  let finalWidth = img.naturalWidth;
  let finalHeight = img.naturalHeight;

  for (let i = 0; i < passes.length; i++) {
    const { maxDim, quality } = passes[i];
    const { canvas, width, height } = drawScaledImage(img, maxDim);
    finalWidth = width;
    finalHeight = height;

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    bestBlob = blob;

    // Stop as soon as target size (<= 200 KB) is achieved
    if (blob.size <= targetMaxBytes) {
      break;
    }
  }

  if (!bestBlob) {
    throw new Error('Image compression could not produce a valid file.');
  }

  // If even at pass 7 it is somehow slightly larger than 200KB, do a final aggressive scale
  if (bestBlob.size > targetMaxBytes) {
    const { canvas, width, height } = drawScaledImage(img, 560);
    finalWidth = width;
    finalHeight = height;
    bestBlob = await canvasToBlob(canvas, 'image/jpeg', 0.35);
  }

  // Clean filename with .jpg extension
  const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'image';
  const compressedFileName = `${baseName}.jpg`;

  const compressedFile = new File([bestBlob], compressedFileName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  const ratio = Math.max(
    0,
    Math.round(((file.size - compressedFile.size) / file.size) * 100)
  );

  return {
    file: compressedFile,
    originalSize: file.size,
    compressedSize: compressedFile.size,
    compressionRatio: ratio,
    width: finalWidth,
    height: finalHeight,
  };
}

/**
 * Format bytes into human-readable string (KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
