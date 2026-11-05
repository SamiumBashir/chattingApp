import { z } from 'zod';

const attachmentSchema = z.object({
  url: z.string().url(),
  secureUrl: z.string().url(),
  publicId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
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

