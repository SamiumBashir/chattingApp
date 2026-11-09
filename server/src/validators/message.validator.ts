import { z } from 'zod';
import { validateUploadedFile, isValidAssetUrl } from '../utils/fileValidation.js';

const attachmentSchema = z
  .object({
    url: z.string().min(1, 'Attachment URL is required').refine(isValidAssetUrl, {
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
    fileSize: z.number().nonnegative().max(26214400, 'File size must not exceed 25MB'),
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

export const sendMessageSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'),
  clientMessageId: z.string().min(1, 'clientMessageId is required').max(100),
  content: z.string().max(5000, 'Content cannot exceed 5000 characters').default(''),
  type: z.enum(['text', 'image', 'file', 'system']).default('text'),
  attachments: z.array(attachmentSchema).default([]),
  replyTo: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid replyTo ID').optional().nullable(),
});

export const getMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;

