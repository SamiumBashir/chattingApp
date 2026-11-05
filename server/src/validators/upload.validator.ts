import { z } from 'zod';

export const signatureRequestSchema = z.object({
  folder: z.string().optional().default('connectly/attachments'),
  resourceType: z.enum(['image', 'raw', 'video', 'auto']).optional().default('auto'),
});

export const uploadCompleteSchema = z.object({
  url: z.string().url('Valid attachment URL is required'),
  publicId: z.string().min(1, 'Public ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.string().min(1, 'File type is required'),
  fileSize: z.number().max(26214400, 'File size must not exceed 25MB'), // 25MB max
});

