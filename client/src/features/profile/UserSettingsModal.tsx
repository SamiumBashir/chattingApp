'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Shield, User, Loader2, Check } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { userService } from '@/services/user.service';
import { uploadService } from '@/services/upload.service';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function UserSettingsModal() {
  const { user, updateUser } = useAuthStore();
  const { isSettingsOpen, setIsSettingsOpen } = useChatStore();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; name: string; username: string; avatar?: string }>>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'privacy'>('profile');

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
    try {
      const list = await userService.getBlockedUsers();
      setBlockedUsers(list);
    } catch {
      // ignore
    }
  };

  const handleUnblock = async (blockedId: string) => {
    try {
      await userService.unblockUser(blockedId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId));
    } catch (err: any) {
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

  if (!isSettingsOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="font-bold text-base text-foreground">Settings</h3>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex rounded-lg bg-muted p-1 mb-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              activeTab === 'profile'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Edit Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              activeTab === 'privacy'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Privacy & Blocked
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Avatar
                  src={user.avatar}
                  name={user.name}
                  size="xl"
                  className="ring-2 ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
                  title="Upload profile photo"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
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
              <p className="text-[11px] text-muted-foreground">Click camera to upload avatar</p>
            </div>

            {errorMessage && (
              <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                {errorMessage}
              </p>
            )}

            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 p-2 rounded-md">
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
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Username</label>
              <Input value={`@${user.username}`} disabled className="opacity-70 bg-muted/50" />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Bio / About</label>
              <Input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What are you working on?"
                maxLength={160}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSaving}>
                Save Changes
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Blocked Users
            </h4>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {blockedUsers.length > 0 ? (
                blockedUsers.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar src={b.avatar} name={b.name} size="sm" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">{b.name}</p>
                        <p className="text-[11px] text-muted-foreground">@{b.username}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnblock(b.id)}
                      className="text-xs h-7 px-2"
                    >
                      Unblock
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  You haven't blocked any users.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
