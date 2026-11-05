'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  ShieldAlert,
  FileText,
  Activity,
  CheckCircle,
  AlertTriangle,
  Ban,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  adminService,
  AdminOverview,
  ModerationReport,
  AuditLogItem,
} from '@/services/admin.service';
import { User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'reports' | 'logs'>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);

  // Users Tab State
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Reports Tab State
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState('pending');
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Status Action Modal State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newStatus, setNewStatus] = useState<'active' | 'suspended' | 'banned'>('active');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Initial load
  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'reports') {
      loadReports();
    } else if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, userStatusFilter, reportStatusFilter]);

  const loadOverview = async () => {
    setIsLoadingOverview(true);
    try {
      const data = await adminService.getOverview();
      setOverview(data);
    } catch {
      // ignore
    } finally {
      setIsLoadingOverview(false);
    }
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await adminService.getUsers({
        q: userSearch,
        status: userStatusFilter || undefined,
        limit: 50,
      });
      setUsers(data.users);
    } catch {
      // ignore
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadReports = async () => {
    setIsLoadingReports(true);
    try {
      const data = await adminService.getReports({
        status: reportStatusFilter || undefined,
        limit: 50,
      });
      setReports(data.reports);
    } catch {
      // ignore
    } finally {
      setIsLoadingReports(false);
    }
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await adminService.getAuditLogs({ limit: 50 });
      setLogs(data.logs);
    } catch {
      // ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleUpdateUserStatus = async () => {
    if (!selectedUser) return;
    setIsUpdatingStatus(true);
    try {
      const updated = await adminService.updateUserStatus(
        selectedUser.id,
        newStatus,
        statusReason.trim() || undefined
      );
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelectedUser(null);
      setStatusReason('');
      loadOverview();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update user status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleResolveReport = async (
    reportId: string,
    actionTaken: ModerationReport['actionTaken']
  ) => {
    try {
      await adminService.updateReport(reportId, {
        status: 'resolved',
        actionTaken,
        notes: `Action taken by admin: ${actionTaken}`,
      });
      loadReports();
      loadOverview();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to resolve report');
    }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await adminService.updateReport(reportId, {
        status: 'dismissed',
        actionTaken: 'none',
        notes: 'Dismissed by moderator as no violation was found',
      });
      loadReports();
      loadOverview();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to dismiss report');
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b gap-2 text-sm font-semibold select-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 pb-3 px-3 border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="h-4 w-4" /> Overview
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 pb-3 px-3 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" /> Users Management
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 pb-3 px-3 border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="h-4 w-4" /> Moderation Queue
          {overview?.moderation.pendingReports ? (
            <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.2 text-[10px]">
              {overview.moderation.pendingReports}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 pb-3 px-3 border-b-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-4 w-4" /> Audit Logs
        </button>
      </div>

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {isLoadingOverview ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : overview ? (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-card p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{overview.users.total}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overview.users.active} active &bull; {overview.users.banned} banned
                  </p>
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Conversations</span>
                    <MessageSquare className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {overview.conversations.total}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Direct & group conversations</p>
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Messages Sent</span>
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{overview.messages.total}</div>
                  <p className="text-xs text-muted-foreground mt-1">Real-time persisted messages</p>
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Pending Reports</span>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {overview.moderation.pendingReports}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Requires admin review</p>
                </div>
              </div>

              {/* Status Breakdown Card */}
              <div className="rounded-xl border bg-card p-6 shadow-2xs">
                <h3 className="font-bold text-sm text-foreground mb-4">User Status Distribution</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
                    <p className="text-xs font-medium text-emerald-600">Active Accounts</p>
                    <p className="text-xl font-bold text-emerald-600 mt-1">{overview.users.active}</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-4 border border-amber-500/20">
                    <p className="text-xs font-medium text-amber-600">Suspended</p>
                    <p className="text-xl font-bold text-amber-600 mt-1">
                      {overview.users.suspended}
                    </p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
                    <p className="text-xs font-medium text-destructive">Banned</p>
                    <p className="text-xl font-bold text-destructive mt-1">{overview.users.banned}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 2. USERS MANAGEMENT TAB */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, username, email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border bg-background text-xs text-foreground focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>

              <Button size="sm" variant="outline" onClick={loadUsers} className="gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Joined</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </td>
                    </tr>
                  ) : users.length > 0 ? (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={u.avatar} name={u.name} size="sm" />
                            <div>
                              <p className="font-semibold text-foreground">{u.name}</p>
                              <p className="text-[11px] text-muted-foreground">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                            {u.role}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              u.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : u.status === 'suspended'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedUser(u);
                              setNewStatus(u.status);
                            }}
                            className="text-xs h-7 px-2.5"
                          >
                            Edit Status
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODERATION REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-card p-3 rounded-xl border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Filter by status:</span>
              <select
                value={reportStatusFilter}
                onChange={(e) => setReportStatusFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg border bg-background text-xs text-foreground focus:outline-none"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <Button size="sm" variant="outline" onClick={loadReports} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          <div className="space-y-3">
            {isLoadingReports ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : reports.length > 0 ? (
              reports.map((report) => (
                <div key={report.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase text-destructive border-destructive/30">
                        {report.reason.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Reported by <strong className="text-foreground">{report.reporter?.name || 'User'}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(report.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-foreground leading-relaxed bg-muted/30 p-2.5 rounded-lg">
                    {report.description}
                  </p>

                  {report.reportedMessage && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
                      <span className="font-bold text-primary block text-[10px] mb-1">
                        Reported Message Content:
                      </span>
                      <p className="italic text-foreground">{report.reportedMessage.content}</p>
                    </div>
                  )}

                  {report.reportedUser && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Reported User:</span>
                      <strong className="text-foreground">{report.reportedUser.name}</strong>
                      <span className="text-muted-foreground">(@{report.reportedUser.username})</span>
                      <Badge variant="outline" className="text-[9px]">
                        Status: {report.reportedUser.status}
                      </Badge>
                    </div>
                  )}

                  {report.status === 'pending' ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDismissReport(report.id)}
                        className="text-xs h-8"
                      >
                        Dismiss
                      </Button>
                      {report.reportedMessage && !report.reportedMessage.isDeleted && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolveReport(report.id, 'message_deleted')}
                          className="text-xs h-8 text-amber-600 hover:text-amber-700"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete Message
                        </Button>
                      )}
                      {report.reportedUser && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleResolveReport(report.id, 'user_banned')}
                          className="text-xs h-8 gap-1"
                        >
                          <Ban className="h-3.5 w-3.5" /> Ban User
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs pt-2 border-t text-muted-foreground">
                      <span>Status: <strong className="text-foreground capitalize">{report.status}</strong></span>
                      <span>Action: <strong className="text-foreground capitalize">{report.actionTaken.replace('_', ' ')}</strong></span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground select-none">
                <ShieldAlert className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs font-medium">No reports matching filter criteria</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. AUDIT LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={loadLogs} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-3">Action</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {isLoadingLogs ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </td>
                    </tr>
                  ) : logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          {log.action.replace(/_/g, ' ').toUpperCase()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{log.actor?.name || 'Admin'}</span>
                            <span className="text-[10px] text-muted-foreground">(@{log.actor?.username})</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {log.targetUser ? `@${log.targetUser.username}` : log.targetResource}
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-[11px]">
                          {log.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="p-3 text-muted-foreground">{formatDate(log.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-muted-foreground">
                        No audit logs recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Status Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-bold text-sm text-foreground mb-1">
              Change Account Status
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Updating account status for <strong>{selectedUser.name}</strong> (@{selectedUser.username})
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-lg border bg-background text-xs text-foreground focus:outline-none"
                >
                  <option value="active">Active (Normal Access)</option>
                  <option value="suspended">Suspended (Temporary lockout)</option>
                  <option value="banned">Banned (Permanent lockout & session revoke)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Reason</label>
                <Input
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Administrative reason..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant={newStatus === 'banned' ? 'destructive' : 'default'}
                  isLoading={isUpdatingStatus}
                  onClick={handleUpdateUserStatus}
                >
                  Apply Status
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

