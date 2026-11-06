'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Camera,
  Shield,
  User,
  Loader2,
  Check,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  LogOut,
  Ban,
  Mail,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useNotificationStore } from '@/store/notificationStore';
import { userService } from '@/services/user.service';
import { uploadService } from '@/services/upload.service';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function UserSettingsModal() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();
  const { isSettingsOpen, setIsSettingsOpen } = useChatStore();
  const { isDarkMode, toggleTheme } = useTheme();
  const { soundEnabled, toggleSound } = useNotificationStore();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [unblockMessage, setUnblockMessage] = useState<string | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<
    Array<{ id: string; name: string; username: string; avatar?: string }>
  >([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'privacy' | 'account'>('profile');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && isSettingsOpen) {
      setName(user.name || '');
      setBio(user.bio || '');
      setSaveSuccess(false);
      setErrorMessage('');
      loadBlockedUsers();
    }
  }, [user, isSettingsOpen]);

  const loadBlockedUsers = async () => {
    setIsLoadingBlocked(true);
    try {
      const list = await userService.getBlockedUsers();
      setBlockedUsers(list);
    } catch {
      // ignore
    } finally {
      setIsLoadingBlocked(false);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    try {
      await userService.unblockUser(blockedId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId));
      setUnblockMessage('User unblocked successfully');
      setTimeout(() => setUnblockMessage(null), 2500);
    } catch {
      setErrorMessage('Failed to unblock user');
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setErrorMessage('');
    try {
      const attachment = await uploadService.uploadFile(file, 'connectly/avatars');
      const updatedUser = await userService.updateMe({ avatar: attachment.url });
      updateUser(updatedUser);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error?.message || 'Failed to upload avatar image');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSaveSuccess(false);

    try {
      const updatedUser = await userService.updateMe({
        name: name.trim(),
        bio: bio.trim(),
      });
      updateUser(updatedUser);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    setIsSettingsOpen(false);
    await logout();
    router.push('/login');
  };

  if (!isSettingsOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md max-h-[92vh] flex flex-col rounded-2xl border bg-card p-4 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-foreground leading-none">
                Settings & Profile
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Manage your account, privacy & preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-3 rounded-xl bg-muted/80 p-1 mb-4 text-xs font-semibold shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-2 rounded-lg transition-all text-center ${
              activeTab === 'profile'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`py-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
              activeTab === 'privacy'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Blocked</span>
            {blockedUsers.length > 0 && (
              <span className="rounded-full bg-destructive/15 text-destructive px-1.5 py-0.2 text-[10px] font-bold">
                {blockedUsers.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`py-2 rounded-lg transition-all text-center ${
              activeTab === 'account'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Account
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-2 py-1">
                <div className="relative">
                  <Avatar
                    src={user.avatar}
                    name={user.name}
                    size="xl"
                    className="h-20 w-20 ring-4 ring-primary/10 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95 transition-all"
                    title="Change profile picture"
                    aria-label="Upload profile photo"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tap camera to upload new avatar photo
                </p>
              </div>

              {errorMessage && (
                <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                  {errorMessage}
                </p>
              )}

              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <Check className="h-4 w-4" /> Profile updated successfully!
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Full Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  className="h-10 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Username</label>
                <Input
                  value={`@${user.username}`}
                  disabled
                  className="opacity-70 bg-muted/50 h-10 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-foreground block">Bio / About</label>
                  <span className="text-[10px] text-muted-foreground">{bio.length}/160</span>
                </div>
                <Input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell others what you are working on..."
                  maxLength={160}
                  className="h-10 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSettingsOpen(false)}
                  className="h-9 text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSaving} className="h-9 text-xs">
                  Save Changes
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Blocked Users
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Blocked users cannot send you messages or view your status
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {blockedUsers.length} blocked
                </Badge>
              </div>

              {unblockMessage && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" /> {unblockMessage}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {isLoadingBlocked ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : blockedUsers.length > 0 ? (
                  blockedUsers.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/30"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={b.avatar} name={b.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{b.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">@{b.username}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnblock(b.id)}
                        className="text-xs h-7 px-2.5 shrink-0 hover:bg-muted"
                      >
                        Unblock
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed bg-muted/20">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                      <Ban className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">No blocked users</p>
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">
                      To block someone, open their direct chat, tap their profile at the top or the
                      info icon, and select &quot;Block User&quot;.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-4">
              {/* Preferences: Theme & Sound */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Preferences
                </h4>

                {/* Dark mode card */}
                <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Theme Mode</p>
                      <p className="text-[11px] text-muted-foreground">
                        {isDarkMode ? 'Dark mode enabled' : 'Light mode enabled'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleTheme}
                    className="h-8 text-xs gap-1.5"
                  >
                    {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    {isDarkMode ? 'Light' : 'Dark'}
                  </Button>
                </div>

                {/* Message sounds */}
                <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {soundEnabled ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeX className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Notification Sound</p>
                      <p className="text-[11px] text-muted-foreground">
                        {soundEnabled ? 'Play sound for new messages' : 'Sound muted'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSound}
                    className="h-8 text-xs gap-1.5"
                  >
                    {soundEnabled ? 'Mute' : 'Enable'}
                  </Button>
                </div>
              </div>

              {/* Account details */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Account Details
                </h4>

                <div className="p-3 rounded-xl border bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </span>
                    <span className="font-medium text-foreground">{user.email}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Role
                    </span>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                      {user.role || 'Member'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Danger Zone: Log Out */}
              <div className="pt-2 border-t">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full h-10 gap-2 text-xs"
                >
                  <LogOut className="h-4 w-4" /> Sign Out of Connectly
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
