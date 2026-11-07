import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  bio: z.string().trim().max(250, 'Bio cannot exceed 250 characters').optional(),
  avatar: z.string().trim().optional().nullable(),
});

export const searchUsersSchema = z.object({
  q: z.string().trim().min(1, 'Search query cannot be empty'),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const confirmPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required to confirm this action'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SearchUsersInput = z.infer<typeof searchUsersSchema>;
export type ConfirmPasswordInput = z.infer<typeof confirmPasswordSchema>;

