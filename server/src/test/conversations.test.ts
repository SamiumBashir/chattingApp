import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Conversation } from '../models/Conversation.js';

describe('Phase 3 — Users & Conversations System', () => {
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
    save: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      id: '507f1f77bcf86cd799439011',
      name: 'Alice Cooper',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
      status: 'active',
      blockedUsers: [],
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
    save: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      id: '507f1f77bcf86cd799439022',
      name: 'Bob Marley',
      username: 'bob',
      email: 'bob@example.com',
      role: 'user',
      status: 'active',
      blockedUsers: [],
    }),
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

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Session, 'findById').mockResolvedValue(sessionA as any);
  });

  describe('User Discovery & Profile Operations', () => {
    it('GET /api/v1/users/me returns authenticated user details', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(userA as any);

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('alice');
    });

    it('PATCH /api/v1/users/me updates name and bio', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(userA as any);

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Alice C.', bio: 'Full-stack developer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/users/:userId/block blocks target user', async () => {
      vi.spyOn(User, 'findById')
        .mockResolvedValueOnce(userA as any) // auth middleware
        .mockResolvedValueOnce(userB as any); // target user check

      vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const res = await request(app)
        .post(`/api/v1/users/${userB.id}/block`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blocked).toBe(true);
    });
  });

  describe('Conversations Operations', () => {
    const mockPrivateConv = {
      id: '607f1f77bcf86cd799439033',
      _id: new mongoose.Types.ObjectId('607f1f77bcf86cd799439033'),
      type: 'private',
      participants: [
        { user: userA, role: 'member' },
        { user: userB, role: 'member' },
      ],
      hasParticipant: (id: string) => id === userA.id || id === userB.id,
      getParticipantRole: () => 'member',
      populate: vi.fn().mockReturnThis(),
      toJSON: () => ({
        id: '607f1f77bcf86cd799439033',
        type: 'private',
        participants: [
          { user: userA.toJSON(), role: 'member' },
          { user: userB.toJSON(), role: 'member' },
        ],
      }),
    };

    it('POST /api/v1/conversations/private creates or returns existing conversation', async () => {
      vi.spyOn(User, 'findById')
        .mockResolvedValueOnce(userA as any) // auth middleware
        .mockResolvedValueOnce(userA as any) // currentUser
        .mockResolvedValueOnce(userB as any); // recipient

      vi.spyOn(Conversation, 'findOne').mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockPrivateConv),
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/conversations/private')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ recipientId: userB.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation.type).toBe('private');
    });

    it('POST /api/v1/conversations/private rejects attempt to chat with blocked user', async () => {
      const userABlockingB = {
        ...userA,
        blockedUsers: [userB._id],
      };

      vi.spyOn(User, 'findById')
        .mockResolvedValueOnce(userA as any) // auth middleware
        .mockResolvedValueOnce(userABlockingB as any) // currentUser
        .mockResolvedValueOnce(userB as any); // recipient

      const res = await request(app)
        .post('/api/v1/conversations/private')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ recipientId: userB.id });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_BLOCKED');
    });

    it('POST /api/v1/conversations/group creates group with owner role for creator', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(userA as any);
      vi.spyOn(User, 'find').mockResolvedValue([userB] as any);

      const mockGroupConv = {
        id: '607f1f77bcf86cd799439044',
        _id: new mongoose.Types.ObjectId('607f1f77bcf86cd799439044'),
        type: 'group',
        groupName: 'Tech Leads',
        participants: [
          { user: userA, role: 'owner' },
          { user: userB, role: 'member' },
        ],
        populate: vi.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: '607f1f77bcf86cd799439044',
          type: 'group',
          groupName: 'Tech Leads',
          participants: [
            { user: userA.toJSON(), role: 'owner' },
            { user: userB.toJSON(), role: 'member' },
          ],
        }),
      };

      vi.spyOn(Conversation, 'create').mockResolvedValue(mockGroupConv as any);

      const res = await request(app)
        .post('/api/v1/conversations/group')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          groupName: 'Tech Leads',
          participantIds: [userB.id],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation.groupName).toBe('Tech Leads');
      expect(res.body.data.conversation.participants[0].role).toBe('owner');
    });

    it('GET /api/v1/conversations/:id blocks access for non-members with 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(userA as any);

      const outsiderConv = {
        id: '607f1f77bcf86cd799439055',
        hasParticipant: vi.fn().mockReturnValue(false),
      };

      vi.spyOn(Conversation, 'findById').mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(outsiderConv),
        }),
      } as any);

      const res = await request(app)
        .get(`/api/v1/conversations/${outsiderConv.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

