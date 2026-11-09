import { z } from 'zod';
import { validateUploadedFile, isValidAssetUrl } from '../utils/fileValidation.js';

export const signatureRequestSchema = z.object({
  folder: z
    .enum([
      'connectly/attachments',
      'connectly/avatars',
      'connectly/voice',
      'connectly/direct',
      'connectly/chat',
    ])
    .optional()
    .default('connectly/attachments'),
  resourceType: z.enum(['image', 'raw', 'video', 'auto']).optional().default('auto'),
});

export const uploadCompleteSchema = z
  .object({
    url: z.string().min(1, 'Valid attachment URL is required').refine(isValidAssetUrl, {
      message: 'Attachment URL must be a valid HTTPS URL or trusted resource',
    }),
    secureUrl: z.string().optional().nullable(),
    publicId: z
      .string()
      .min(1, 'Public ID is required')
      .max(255)
      .regex(/^[a-zA-Z0-9/_-]+$/, 'Public ID contains invalid characters'),
    fileName: z.string().min(1, 'File name is required').max(255),
    fileType: z.string().min(1, 'File type is required'),
    fileSize: z.number().positive('File size must be greater than 0').max(26214400, 'File size must not exceed 25MB'),
  })
  .superRefine((data, ctx) => {
    const validation = validateUploadedFile(data.fileName, data.fileType, data.fileSize);
    if (!validation.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || 'Invalid file uploaded',
        path: ['fileType'],
      });
    }
  });

export type SignatureRequestInput = z.infer<typeof signatureRequestSchema>;
export type UploadCompleteInput = z.infer<typeof uploadCompleteSchema>;
