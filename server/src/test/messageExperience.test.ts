import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';

describe('Phase 5 — Messaging Experience (Edit, Delete, Reactions)', () => {
  const app = createApp();

  const userA = {
    id: '507f1f77bcf86cd799439011',
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Alice Cooper',
    username: 'alice',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
  };

  const userB = {
    id: '507f1f77bcf86cd799439022',
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439022'),
    name: 'Bob Marley',
    username: 'bob',
    email: 'bob@example.com',
    role: 'user',
    status: 'active',
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

  const msgId = '707f1f77bcf86cd799439001';
  const convId = '607f1f77bcf86cd799439033';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(User, 'findById').mockResolvedValue(userA as any);
    vi.spyOn(Session, 'findById').mockResolvedValue(sessionA as any);
  });

  describe('Message Edit & Deletion', () => {
    it('allows sender to edit their message', async () => {
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        sender: userA._id,
        content: 'Original content',
        isEdited: false,
        isDeleted: false,
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: msgId,
          content: 'Updated content',
          isEdited: true,
        }),
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .patch(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.content).toBe('Updated content');
      expect(res.body.data.message.isEdited).toBe(true);
    });

    it('rejects editing another user message with 403', async () => {
      const otherUserMsg = {
        id: msgId,
        sender: userB._id, // User B is the sender
        content: 'Bob original',
        isDeleted: false,
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(otherUserMsg as any);

      const res = await request(app)
        .patch(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Tampered content' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('soft deletes message and replaces content with tombstone', async () => {
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        sender: userA._id,
        content: 'Secret message',
        isDeleted: false,
        reactions: [],
        attachments: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .delete(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isDeleted).toBe(true);
      expect(mockMsg.content).toBe('This message was deleted');
    });
  });

  describe('Emoji Reactions', () => {
    const getMockConv = () => ({
      _id: new mongoose.Types.ObjectId(convId),
      hasParticipant: () => true,
      getParticipantRole: () => 'member',
    });

    it('adds reaction to message on POST /api/v1/messages/:id/reactions', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(getMockConv() as any);
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        reactions: [] as any[],
        isDeleted: false,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .post(`/api/v1/messages/${msgId}/reactions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reactions).toHaveLength(1);
      expect(res.body.data.reactions[0].emoji).toBe('👍');
    });

    it('removes reaction on DELETE /api/v1/messages/:id/reactions', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(getMockConv() as any);
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        reactions: [{ user: userA._id, emoji: '❤️' }],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .delete(`/api/v1/messages/${msgId}/reactions`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reactions).toHaveLength(0);
    });
  });
});

