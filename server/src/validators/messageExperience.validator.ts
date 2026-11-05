import { z } from 'zod';

export const editMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content cannot be empty')
    .max(5000, 'Content cannot exceed 5000 characters'),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(10, 'Emoji cannot exceed 10 characters'),
});

export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ReactionInput = z.infer<typeof reactionSchema>;

