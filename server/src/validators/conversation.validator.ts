import { z } from 'zod';

export const createPrivateConversationSchema = z.object({
  recipientId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid recipient ID format'),
});

export const createGroupConversationSchema = z.object({
  groupName: z
    .string()
    .trim()
    .min(2, 'Group name must be at least 2 characters')
    .max(100, 'Group name cannot exceed 100 characters'),
  participantIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid participant ID'))
    .min(1, 'Group must have at least one additional member')
    .max(100, 'Group cannot exceed 100 initial members'),
  groupAvatar: z.string().optional().nullable(),
  groupDescription: z.string().trim().max(500).optional(),
});

export const updateGroupSchema = z.object({
  groupName: z.string().trim().min(2).max(100).optional(),
  groupAvatar: z.string().optional().nullable(),
  groupDescription: z.string().trim().max(500).optional(),
});

export const addMembersSchema = z.object({
  userIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'))
    .min(1, 'At least one user must be specified'),
});

export const listConversationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(30),
});

export type CreatePrivateConversationInput = z.infer<typeof createPrivateConversationSchema>;
export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type ListConversationsInput = z.infer<typeof listConversationsSchema>;

