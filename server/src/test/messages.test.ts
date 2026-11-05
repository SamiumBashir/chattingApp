import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { MessageReceipt } from '../models/MessageReceipt.js';

describe('Phase 4 — Real-Time Messaging & Idempotency', () => {
  const app = createApp();

  const userA = {
    id: '507f1f77bcf86cd799439011',
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Alice Cooper',
    username: 'alice',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    blockedUsers: [] as mongoose.Types.ObjectId[],
    toJSON: () => ({
      id: '507f1f77bcf86cd799439011',
      name: 'Alice Cooper',
      username: 'alice',
    }),
  };

  const userB = {
    id: '507f1f77bcf86cd799439022',
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439022'),
    name: 'Bob Marley',
    username: 'bob',
    email: 'bob@example.com',
    role: 'user',
    status: 'active',
    blockedUsers: [] as mongoose.Types.ObjectId[],
  };

  const sessionA = {
    id: '507f1f77bcf86cd799439099',
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
    user: userA._id,
    isValid: () => true,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  const tokenA = generateAccessToken({
    userId: userA.id,
    email: userA.email,
    username: userA.username,
    role: 'user',
    sessionId: sessionA.id,
  });

  const convId = '607f1f77bcf86cd799439033';
  const mockConversation = {
    id: convId,
    _id: new mongoose.Types.ObjectId(convId),
    type: 'private',
    participants: [
      { user: userA._id, role: 'member' },
      { user: userB._id, role: 'member' },
    ],
    hasParticipant: (id: string) => id === userA.id || id === userB.id,
    save: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, 'findById').mockResolvedValue(userA as any);
    vi.spyOn(Session, 'findById').mockResolvedValue(sessionA as any);
  });

  describe('REST Message History & Persistence', () => {
    it('rejects sending a message if user is not in conversation', async () => {
      const outsiderConv = {
        ...mockConversation,
        hasParticipant: vi.fn().mockReturnValue(false),
      };
      vi.spyOn(Conversation, 'findById').mockResolvedValue(outsiderConv as any);

      const res = await request(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'client-uuid-1',
          content: 'Hello World',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects message with empty content and no attachments', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'client-uuid-2',
          content: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMPTY_MESSAGE');
    });

    it('persists message and returns 201 on valid send', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);

      const mockMessage = {
        id: '707f1f77bcf86cd799439001',
        _id: new mongoose.Types.ObjectId('707f1f77bcf86cd799439001'),
        content: 'Hi Bob!',
        clientMessageId: 'client-uuid-3',
        sender: userA._id,
        conversation: mockConversation._id,
        createdAt: new Date(),
        populate: vi.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: '707f1f77bcf86cd799439001',
          content: 'Hi Bob!',
          clientMessageId: 'client-uuid-3',
          sender: userA.toJSON(),
        }),
      };

      vi.spyOn(Message, 'create').mockResolvedValue(mockMessage as any);
      vi.spyOn(MessageReceipt, 'insertMany').mockResolvedValue([] as any);

      const res = await request(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'client-uuid-3',
          content: 'Hi Bob!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.content).toBe('Hi Bob!');
    });

    it('returns existing message without duplicating when identical clientMessageId is re-sent', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);

      const existingMessage = {
        id: '707f1f77bcf86cd799439001',
        content: 'Idempotent message',
        clientMessageId: 'client-uuid-dup',
        populate: vi.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: '707f1f77bcf86cd799439001',
          content: 'Idempotent message',
          clientMessageId: 'client-uuid-dup',
        }),
      };

      vi.spyOn(Message, 'findOne').mockResolvedValue(existingMessage as any);

      const createSpy = vi.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'client-uuid-dup',
          content: 'Idempotent message',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.clientMessageId).toBe('client-uuid-dup');
      expect(createSpy).not.toHaveBeenCalled(); // Verified no duplicate insertion!
    });

    it('GET /api/v1/conversations/:id/messages returns paginated message history', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(mockConversation as any);

      const mockHistory = [
        {
          id: 'msg-1',
          content: 'First message',
          createdAt: new Date('2026-11-01T10:00:00Z'),
          toJSON: () => ({ id: 'msg-1', content: 'First message' }),
        },
        {
          id: 'msg-2',
          content: 'Second message',
          createdAt: new Date('2026-11-01T10:05:00Z'),
          toJSON: () => ({ id: 'msg-2', content: 'Second message' }),
        },
      ];

      vi.spyOn(Message, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockResolvedValue(mockHistory),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get(`/api/v1/conversations/${convId}/messages?limit=10`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messages).toHaveLength(2);
      expect(res.body.meta).toBeDefined();
    });
  });
});
