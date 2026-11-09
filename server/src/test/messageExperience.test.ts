import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { generateAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { MessageReceipt } from '../models/MessageReceipt.js';
import { MessageService } from '../services/message.service.js';

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

    it('rejects editing when content is empty with 400 VALIDATION_ERROR or EMPTY_MESSAGE', async () => {
      const mockMsg = {
        id: msgId,
        sender: userA._id,
        content: 'Original',
        isDeleted: false,
        createdAt: new Date(),
      };
      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .patch(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(['VALIDATION_ERROR', 'EMPTY_MESSAGE']).toContain(res.body.error.code);

      // Verify service layer also rejects directly
      await expect(MessageService.editMessage(msgId, userA.id, '   ')).rejects.toMatchObject({
        code: 'EMPTY_MESSAGE',
      });
    });

    it('rejects editing when edit window (24 hours) has expired', async () => {
      const mockMsg = {
        id: msgId,
        sender: userA._id,
        content: 'Old original',
        isDeleted: false,
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };
      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .patch(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Late edit' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EDIT_WINDOW_EXPIRED');
    });

    it('rejects editing if message is already deleted', async () => {
      const mockMsg = {
        id: msgId,
        sender: userA._id,
        content: 'Deleted msg',
        isDeleted: true,
        createdAt: new Date(),
      };
      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .patch(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Revive edit' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MESSAGE_DELETED');
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
      vi.spyOn(Conversation, 'findById').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(convId),
        lastMessage: { messageId: new mongoose.Types.ObjectId(msgId), content: 'Secret message' },
        save: vi.fn().mockResolvedValue(true),
        getParticipantRole: () => 'member',
      } as any);

      const res = await request(app)
        .delete(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isDeleted).toBe(true);
      expect(mockMsg.content).toBe('This message was deleted');
    });

    it('allows group admin to delete another user message in group', async () => {
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        sender: userB._id, // Bob sent it
        content: 'Spam message',
        isDeleted: false,
        reactions: [],
        attachments: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);
      vi.spyOn(Conversation, 'findById').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(convId),
        lastMessage: null,
        save: vi.fn().mockResolvedValue(true),
        getParticipantRole: (uid: string) => (uid === userA.id ? 'admin' : 'member'),
      } as any);

      const res = await request(app)
        .delete(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isDeleted).toBe(true);
    });

    it('rejects non-admin non-sender from deleting another user message with 403', async () => {
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        sender: userB._id,
        content: 'Bob message',
        isDeleted: false,
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);
      vi.spyOn(Conversation, 'findById').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(convId),
        getParticipantRole: () => 'member', // Alice is only member, not owner/admin
      } as any);

      const res = await request(app)
        .delete(`/api/v1/messages/${msgId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
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

    it('rejects emoji reaction with invalid length or empty with 400 VALIDATION_ERROR or INVALID_EMOJI', async () => {
      const res = await request(app)
        .post(`/api/v1/messages/${msgId}/reactions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ emoji: 'this_is_way_too_long_for_an_emoji_string' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(['VALIDATION_ERROR', 'INVALID_EMOJI']).toContain(res.body.error.code);

      // Verify service layer also rejects directly
      await expect(
        MessageService.addReaction(msgId, userA.id, 'this_is_way_too_long_for_an_emoji_string')
      ).rejects.toMatchObject({
        code: 'INVALID_EMOJI',
      });
    });

    it('rejects adding reaction to a deleted message with 400 MESSAGE_DELETED', async () => {
      vi.spyOn(Conversation, 'findById').mockResolvedValue(getMockConv() as any);
      const mockMsg = {
        id: msgId,
        _id: new mongoose.Types.ObjectId(msgId),
        conversation: new mongoose.Types.ObjectId(convId),
        reactions: [] as any[],
        isDeleted: true,
      };

      vi.spyOn(Message, 'findById').mockResolvedValue(mockMsg as any);

      const res = await request(app)
        .post(`/api/v1/messages/${msgId}/reactions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MESSAGE_DELETED');
    });
  });

  describe('Message Service Hardening & State Integrity', () => {
    it('rejects cross-conversation reply with CROSS_CONVERSATION_REPLY_FORBIDDEN', async () => {
      const convA = {
        id: convId,
        _id: new mongoose.Types.ObjectId(convId),
        hasParticipant: () => true,
        participants: [{ user: userA._id }, { user: userB._id }],
      };
      vi.spyOn(Conversation, 'findById').mockResolvedValue(convA as any);
      vi.spyOn(Message, 'findOne').mockResolvedValue(null);

      // Reply target belongs to a completely different conversation!
      const foreignConvId = new mongoose.Types.ObjectId();
      const foreignMsg = {
        _id: new mongoose.Types.ObjectId(),
        conversation: foreignConvId,
      };
      vi.spyOn(Message, 'findById').mockResolvedValue(foreignMsg as any);

      await expect(
        MessageService.sendMessage(userA.id, {
          conversationId: convId,
          content: 'Replying across conversations',
          replyTo: foreignMsg._id.toString(),
          clientMessageId: 'reply-cross-1',
        })
      ).rejects.toMatchObject({
        code: 'CROSS_CONVERSATION_REPLY_FORBIDDEN',
        statusCode: 400,
      });
    });

    it('handles concurrent duplicate key error (code 11000) and returns existing message as duplicate', async () => {
      const convA = {
        id: convId,
        _id: new mongoose.Types.ObjectId(convId),
        hasParticipant: () => true,
        participants: [{ user: userA._id }, { user: userB._id }],
      };
      vi.spyOn(Conversation, 'findById').mockResolvedValue(convA as any);
      // First findOne returns null (simulating concurrent race)
      vi.spyOn(Message, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: msgId,
          _id: new mongoose.Types.ObjectId(msgId),
          conversation: new mongoose.Types.ObjectId(convId),
          clientMessageId: 'concurrent-race-1',
          content: 'Original concurrent insert',
          populate: vi.fn().mockResolvedValue(true),
          toJSON: () => ({
            id: msgId,
            content: 'Original concurrent insert',
            clientMessageId: 'concurrent-race-1',
          }),
        } as any);

      // Message.create throws duplicate key error 11000
      const dupError: any = new Error('E11000 duplicate key error');
      dupError.code = 11000;
      vi.spyOn(Message, 'create').mockRejectedValue(dupError);

      const result = await MessageService.sendMessage(userA.id, {
        conversationId: convId,
        content: 'Original concurrent insert',
        clientMessageId: 'concurrent-race-1',
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.message.content).toBe('Original concurrent insert');
    });

    it('markDelivered only transitions status from sent to delivered', async () => {
      const findOneAndUpdateSpy = vi.spyOn(MessageReceipt, 'findOneAndUpdate').mockResolvedValue({
        message: msgId,
        user: userA.id,
        status: 'delivered',
      } as any);

      await MessageService.markDelivered(msgId, userA.id);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { message: msgId, user: userA.id, status: 'sent' },
        expect.objectContaining({ status: 'delivered' }),
        { new: true }
      );
    });

    it('markRead transitions status to read and updates participant lastReadMessage', async () => {
      const findOneAndUpdateSpy = vi.spyOn(MessageReceipt, 'findOneAndUpdate').mockResolvedValue({
        message: msgId,
        user: userA.id,
        conversation: convId,
        status: 'read',
      } as any);
      const updateOneSpy = vi.spyOn(Conversation, 'updateOne').mockResolvedValue({} as any);

      await MessageService.markRead(msgId, userA.id);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { message: msgId, user: userA.id, status: { $ne: 'read' } },
        expect.objectContaining({ status: 'read' }),
        { new: true }
      );
      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: convId, 'participants.user': userA.id },
        { $set: { 'participants.$.lastReadMessage': msgId } }
      );
    });
  });
});

