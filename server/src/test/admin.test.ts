import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { Report } from '../models/Report';
import { AuditLog } from '../models/AuditLog';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { generateAccessToken } from '../utils/token';
import mongoose from 'mongoose';

vi.mock('../models/User');
vi.mock('../models/Session');
vi.mock('../models/Report');
vi.mock('../models/AuditLog');
vi.mock('../models/Conversation');
vi.mock('../models/Message');

describe('Phase 7: Administration & Moderation Endpoints', () => {
  const app = createApp();

  const mockAdminId = new mongoose.Types.ObjectId().toString();
  const mockAdminSessionId = new mongoose.Types.ObjectId().toString();
  const mockAdminUser = {
    _id: new mongoose.Types.ObjectId(mockAdminId),
    id: mockAdminId,
    email: 'admin@connectly.app',
    username: 'admin',
    name: 'Admin User',
    role: 'admin',
    status: 'active',
  };

  const mockAdminSession = {
    _id: new mongoose.Types.ObjectId(mockAdminSessionId),
    id: mockAdminSessionId,
    isValid: () => true,
  };

  const adminToken = generateAccessToken({
    userId: mockAdminId,
    email: mockAdminUser.email,
    username: mockAdminUser.username,
    role: 'admin',
    sessionId: mockAdminSessionId,
  });

  const mockNormalUserId = new mongoose.Types.ObjectId().toString();
  const normalUserToken = generateAccessToken({
    userId: mockNormalUserId,
    email: 'user@connectly.app',
    username: 'regular_user',
    role: 'user',
    sessionId: new mongoose.Types.ObjectId().toString(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('blocks regular user with 403 on admin endpoints', async () => {
      (User.findById as any).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(mockNormalUserId),
        id: mockNormalUserId,
        role: 'user',
        status: 'active',
      });
      (Session.findById as any).mockResolvedValue({ isValid: () => true });

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', `Bearer ${normalUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/admin/overview', () => {
    it('returns KPI counters for authorized admin', async () => {
      (User.findById as any).mockResolvedValue(mockAdminUser);
      (Session.findById as any).mockResolvedValue(mockAdminSession);

      (User.countDocuments as any).mockResolvedValue(100);
      (Conversation.countDocuments as any).mockResolvedValue(50);
      (Message.countDocuments as any).mockResolvedValue(1200);
      (Report.countDocuments as any).mockResolvedValue(4);

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.total).toBe(100);
      expect(res.body.data.conversations.total).toBe(50);
      expect(res.body.data.messages.total).toBe(1200);
      expect(res.body.data.moderation.pendingReports).toBe(4);
    });
  });

  describe('GET /api/v1/admin/users & PATCH status', () => {
    it('lists users with pagination', async () => {
      (User.findById as any).mockResolvedValue(mockAdminUser);
      (Session.findById as any).mockResolvedValue(mockAdminSession);

      const mockUsersList = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Bob Ross',
          username: 'bob',
          email: 'bob@example.com',
          role: 'user',
          status: 'active',
          toJSON() {
            return { id: this._id.toString(), name: this.name, username: this.username };
          },
        },
      ];

      (User.find as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockUsersList),
      });
      (User.countDocuments as any).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toHaveLength(1);
    });

    it('updates user status and revokes sessions on ban', async () => {
      (User.findById as any).mockImplementation((id: string) => {
        if (id === mockAdminId) return Promise.resolve(mockAdminUser);
        return Promise.resolve({
          _id: new mongoose.Types.ObjectId(id),
          id,
          name: 'Target User',
          role: 'user',
          status: 'active',
          save: vi.fn().mockResolvedValue(true),
          toJSON() {
            return { id, name: this.name, status: 'banned' };
          },
        });
      });
      (Session.findById as any).mockResolvedValue(mockAdminSession);
      (Session.updateMany as any).mockResolvedValue({ modifiedCount: 2 });
      (AuditLog.create as any).mockResolvedValue({ id: 'audit1' });

      const targetId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .patch(`/api/v1/admin/users/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'banned', reason: 'Repeated spam' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.status).toBe('banned');
      expect(Session.updateMany).toHaveBeenCalled();
      expect(AuditLog.create).toHaveBeenCalled();
    });

    it('rejects attempt to change own status with 400', async () => {
      (User.findById as any).mockResolvedValue(mockAdminUser);
      (Session.findById as any).mockResolvedValue(mockAdminSession);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${mockAdminId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'suspended' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Moderation Reports & Audit Logs', () => {
    it('creates report on POST /api/v1/admin/reports', async () => {
      (User.findById as any).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(mockNormalUserId),
        id: mockNormalUserId,
        role: 'user',
        status: 'active',
      });
      (Session.findById as any).mockResolvedValue({ isValid: () => true });

      (Report.create as any).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        reason: 'harassment',
        description: 'User sent offensive messages',
        status: 'pending',
        toJSON() {
          return { id: this._id.toString(), reason: this.reason, status: this.status };
        },
      });

      const res = await request(app)
        .post('/api/v1/admin/reports')
        .set('Authorization', `Bearer ${normalUserToken}`)
        .send({
          reason: 'harassment',
          description: 'User sent offensive messages repeatedly',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.reason).toBe('harassment');
    });

    it('fetches audit logs on GET /api/v1/admin/audit-logs', async () => {
      (User.findById as any).mockResolvedValue(mockAdminUser);
      (Session.findById as any).mockResolvedValue(mockAdminSession);

      const mockLogs = [
        {
          _id: new mongoose.Types.ObjectId(),
          action: 'user_status_changed',
          actor: mockAdminId,
          targetResource: 'user',
          toJSON() {
            return { id: this._id.toString(), action: this.action };
          },
        },
      ];

      (AuditLog.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockLogs),
      });
      (AuditLog.countDocuments as any).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toHaveLength(1);
    });
  });
});

