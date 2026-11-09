import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { Notification } from '../models/Notification';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { generateAccessToken } from '../utils/token';
import { validateUploadedFile, sanitizeFileName, escapeRegex } from '../utils/fileValidation';
import { EmailService } from '../services/email.service.js';
import { NotificationService } from '../services/notification.service.js';
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

    it('rejects direct upload with dangerous executable extension (.exe)', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/direct')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('MZ executable binary'), 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects direct upload with SVG file to prevent script injection', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/direct')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), 'vector.svg');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('sanitizes directory traversal sequences in uploaded filename', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/direct')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('safe document content'), '../../passwords.txt');

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachment.fileName).toBe('passwords.txt');
      expect(res.body.data.attachment.fileName).not.toContain('..');
    });

    it('rejects complete upload with javascript: pseudo-protocol URL', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'javascript:alert(document.cookie)',
          publicId: 'test_id',
          fileName: 'doc.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects complete upload with dangerous executable file extension', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'https://res.cloudinary.com/demo/raw/upload/trojan.exe',
          publicId: 'demo/trojan',
          fileName: 'trojan.exe',
          fileType: 'application/x-msdownload',
          fileSize: 10240,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects complete upload when image size exceeds 10MB limit', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'https://res.cloudinary.com/demo/image/upload/huge.jpg',
          publicId: 'demo/huge',
          fileName: 'huge.jpg',
          fileType: 'image/jpeg',
          fileSize: 15 * 1024 * 1024, // 15MB > 10MB limit
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects delete asset when publicId contains injection characters', async () => {
      const res = await request(app)
        .delete('/api/v1/uploads/invalid*regex?id!')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
    });
  });

  describe('File Validation & Security Utilities', () => {
    it('validateUploadedFile rejects dangerous executable extensions', () => {
      expect(validateUploadedFile('script.sh', 'text/x-sh').valid).toBe(false);
      expect(validateUploadedFile('run.bat', 'application/x-bat').valid).toBe(false);
      expect(validateUploadedFile('binary.exe', 'application/x-msdownload').valid).toBe(false);
      expect(validateUploadedFile('vector.svg', 'image/svg+xml').valid).toBe(false);
    });

    it('validateUploadedFile rejects extension-to-MIME mismatch', () => {
      // Disguised .png with audio mime
      const res1 = validateUploadedFile('picture.png', 'audio/mp3');
      expect(res1.valid).toBe(false);
      expect(res1.code).toBe('MIME_EXTENSION_MISMATCH');

      // Disguised .mp3 with image mime
      const res2 = validateUploadedFile('audio.mp3', 'image/jpeg');
      expect(res2.valid).toBe(false);
      expect(res2.code).toBe('MIME_EXTENSION_MISMATCH');
    });

    it('validateUploadedFile enforces 10MB image limit and 25MB file limit', () => {
      // Valid image under 10MB
      expect(validateUploadedFile('photo.jpg', 'image/jpeg', 5 * 1024 * 1024).valid).toBe(true);

      // Image exceeding 10MB
      const imgRes = validateUploadedFile('photo.jpg', 'image/jpeg', 11 * 1024 * 1024);
      expect(imgRes.valid).toBe(false);
      expect(imgRes.code).toBe('IMAGE_TOO_LARGE');

      // Valid PDF document under 25MB
      expect(validateUploadedFile('report.pdf', 'application/pdf', 20 * 1024 * 1024).valid).toBe(true);

      // Document exceeding 25MB
      const docRes = validateUploadedFile('report.pdf', 'application/pdf', 26 * 1024 * 1024);
      expect(docRes.valid).toBe(false);
      expect(docRes.code).toBe('FILE_TOO_LARGE');
    });

    it('sanitizeFileName strips path traversal and control characters', () => {
      expect(sanitizeFileName('../../etc/passwd.txt')).toBe('passwd.txt');
      expect(sanitizeFileName('..\\..\\windows\\system32\\calc.txt')).toBe('calc.txt');
      expect(sanitizeFileName('safe_name.png')).toBe('safe_name.png');
      expect(sanitizeFileName('file\x00with\x1Fnull.txt')).toBe('filewithnull.txt');
      expect(sanitizeFileName('file<name>with:bad*chars.txt')).toBe('file_name_with_bad_chars.txt');
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

  describe('Email & Background Notification Delivery', () => {
    it('EmailService.sendVerificationEmail dispatches verification link', async () => {
      const result = await EmailService.sendVerificationEmail({
        to: 'newuser@example.com',
        name: 'New User',
        token: 'verify-token-12345',
      });
      expect(result.sent).toBe(true);
    });

    it('EmailService.sendPasswordResetEmail dispatches password reset link', async () => {
      const result = await EmailService.sendPasswordResetEmail({
        to: 'existing@example.com',
        name: 'Existing User',
        token: 'reset-token-67890',
      });
      expect(result.sent).toBe(true);
    });

    it('NotificationService.createNotification skips self-notifications', async () => {
      const selfNotif = await NotificationService.createNotification({
        recipientId: mockUserId,
        actorId: mockUserId, // same user!
        type: 'message',
        title: 'Self action',
        body: 'You did something',
      });
      expect(selfNotif).toBeNull();
    });
  });
});

