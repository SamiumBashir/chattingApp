import { z } from 'zod';

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned', 'deactivated']),
  reason: z.string().max(500).optional(),
});

export const updateReportSchema = z.object({
  status: z.enum(['reviewed', 'resolved', 'dismissed']),
  actionTaken: z
    .enum(['none', 'warning', 'message_deleted', 'user_suspended', 'user_banned'])
    .optional()
    .default('none'),
  notes: z.string().max(1000).optional(),
});

export const createReportSchema = z.object({
  reportedUserId: z.string().optional(),
  reportedMessageId: z.string().optional(),
  reportedConversationId: z.string().optional(),
  reason: z.enum(['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other']),
  description: z.string().min(5, 'Description must be at least 5 characters').max(1000),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;

