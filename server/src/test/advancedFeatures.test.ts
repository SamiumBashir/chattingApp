import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { Notification } from '../models/Notification';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { generateAccessToken } from '../utils/token';
import mongoose from 'mongoose';

vi.mock('../models/User');
vi.mock('../models/Session');
vi.mock('../models/Notification');
vi.mock('../models/Message');
vi.mock('../models/Conversation');

describe('Phase 6: Advanced Features (Uploads, Notifications, Message Search)', () => {
  const app = createApp();

  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockSessionId = new mongoose.Types.ObjectId().toString();

  const mockUser = {
    _id: new mongoose.Types.ObjectId(mockUserId),
    id: mockUserId,
    email: 'alice@example.com',
    username: 'alice',
    name: 'Alice Cooper',
    role: 'user',
    status: 'active',
  };

  const mockSession = {
    _id: new mongoose.Types.ObjectId(mockSessionId),
    id: mockSessionId,
    isValid: () => true,
  };

  const token = generateAccessToken({
    userId: mockUserId,
    email: mockUser.email,
    username: mockUser.username,
    role: 'user',
    sessionId: mockSessionId,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (User.findById as any).mockResolvedValue(mockUser);
    (Session.findById as any).mockResolvedValue(mockSession);
  });

  describe('Uploads Endpoints', () => {
    it('POST /api/v1/uploads/signature generates signed parameters', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/signature')
        .set('Authorization', `Bearer ${token}`)
        .send({ folder: 'connectly/chat' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.timestamp).toBeDefined();
      expect(res.body.data.apiKey).toBeDefined();
      expect(res.body.data.folder).toBe('connectly/chat');
    });

    it('POST /api/v1/uploads/complete confirms and formats attachment metadata', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          publicId: 'demo/sample',
          fileName: 'sample.jpg',
          fileType: 'image/jpeg',
          fileSize: 10240,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachment.publicId).toBe('demo/sample');
      expect(res.body.data.attachment.fileName).toBe('sample.jpg');
    });

    it('POST /api/v1/uploads/direct uploads file buffer directly', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/direct')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('mock file content'), 'test.txt');

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachment.fileName).toBe('test.txt');
    });
  });

  describe('Notifications Endpoints', () => {
    it('GET /api/v1/notifications lists paginated notifications and unread count', async () => {
      const mockNotifications = [
        {
          _id: new mongoose.Types.ObjectId(),
          recipient: mockUserId,
          title: 'New message',
          body: 'Hello Alice!',
          isRead: false,
          toJSON() {
            return { id: this._id.toString(), title: this.title, isRead: false };
          },
        },
      ];

      (Notification.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockNotifications),
      });
      (Notification.countDocuments as any).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toHaveLength(1);
      expect(res.body.data.unreadCount).toBe(1);
    });

    it('PATCH /api/v1/notifications/:id/read marks notification as read', async () => {
      const mockNotifId = new mongoose.Types.ObjectId().toString();
      const mockUpdated = {
        _id: new mongoose.Types.ObjectId(mockNotifId),
        id: mockNotifId,
        isRead: true,
      };

      (Notification.findOneAndUpdate as any).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockUpdated),
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${mockNotifId}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notification.isRead).toBe(true);
    });

    it('POST /api/v1/notifications/read-all marks all notifications as read', async () => {
      (Notification.updateMany as any).mockResolvedValue({ modifiedCount: 3 });

      const res = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.modifiedCount).toBe(3);
    });
  });

  describe('Message Search', () => {
    it('GET /api/v1/messages/search returns matching messages within user conversations', async () => {
      const mockConvId = new mongoose.Types.ObjectId();
      (Conversation.find as any).mockResolvedValue([{ _id: mockConvId }]);

      const mockFoundMessages = [
        {
          _id: new mongoose.Types.ObjectId(),
          content: 'Important meeting at 3pm',
          conversation: mockConvId,
          toJSON() {
            return { id: this._id.toString(), content: this.content };
          },
        },
      ];

      (Message.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockFoundMessages),
      });
      (Message.countDocuments as any).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/messages/search?q=meeting')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messages).toHaveLength(1);
      expect(res.body.data.messages[0].content).toContain('meeting');
    });
  });
});

