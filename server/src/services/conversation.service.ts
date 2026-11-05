import mongoose from 'mongoose';
import { Conversation, IParticipant } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/apiResponse.js';
import {
  CreateGroupConversationInput,
  UpdateGroupInput,
} from '../validators/conversation.validator.js';

export class ConversationService {
  /**
   * Get or create a 1-to-1 private conversation
   * Enforces duplicate-safe idempotency via privateUserPairKey
   */
  static async getOrCreatePrivate(currentUserId: string, recipientId: string) {
    if (currentUserId === recipientId) {
      throw new AppError('Cannot start a private conversation with yourself', 400, 'INVALID_RECIPIENT');
    }

    const [currentUser, recipient] = await Promise.all([
      User.findById(currentUserId),
      User.findById(recipientId),
    ]);

    if (!recipient || recipient.status === 'banned') {
      throw new AppError('Recipient user not found or unavailable', 404, 'USER_NOT_FOUND');
    }

    if (!currentUser) {
      throw new AppError('Current user not found', 404, 'USER_NOT_FOUND');
    }

    // Check blocking rules
    const isRecipientBlocked = currentUser.blockedUsers?.some(
      (id) => id.toString() === recipientId
    );
    if (isRecipientBlocked) {
      throw new AppError('You have blocked this user. Unblock them to start chatting.', 403, 'USER_BLOCKED');
    }

    const isBlockedByRecipient = recipient.blockedUsers?.some(
      (id) => id.toString() === currentUserId
    );
    if (isBlockedByRecipient) {
      throw new AppError('You cannot message this user.', 403, 'BLOCKED_BY_USER');
    }

    // Compound unique key ensuring at most one private conversation per user pair
    const pairKey = [currentUserId, recipientId].sort().join('_');

    let conversation = await Conversation.findOne({ privateUserPairKey: pairKey })
      .populate('participants.user', 'name username avatar lastSeen')
      .populate('lastMessage.sender', 'name username avatar');

    if (conversation) {
      return conversation.toJSON();
    }

    // Create new private conversation
    conversation = await Conversation.create({
      type: 'private',
      participants: [
        { user: new mongoose.Types.ObjectId(currentUserId), role: 'member', joinedAt: new Date() },
        { user: new mongoose.Types.ObjectId(recipientId), role: 'member', joinedAt: new Date() },
      ],
      privateUserPairKey: pairKey,
      createdBy: new mongoose.Types.ObjectId(currentUserId),
    });

    await conversation.populate('participants.user', 'name username avatar lastSeen');

    return conversation.toJSON();
  }

  /**
   * Create a new group conversation
   */
  static async createGroup(currentUserId: string, input: CreateGroupConversationInput) {
    // Unique list of participant IDs excluding current user
    const uniqueIds = Array.from(new Set(input.participantIds)).filter((id) => id !== currentUserId);

    if (uniqueIds.length === 0) {
      throw new AppError('Group must have at least one other participant', 400, 'MIN_PARTICIPANTS_REQUIRED');
    }

    const validUsers = await User.find({ _id: { $in: uniqueIds }, status: 'active' });
    if (validUsers.length !== uniqueIds.length) {
      throw new AppError('One or more selected participants are invalid or inactive', 400, 'INVALID_PARTICIPANTS');
    }

    const participants: IParticipant[] = [
      {
        user: new mongoose.Types.ObjectId(currentUserId),
        role: 'owner',
        joinedAt: new Date(),
      },
      ...uniqueIds.map((id) => ({
        user: new mongoose.Types.ObjectId(id),
        role: 'member' as const,
        joinedAt: new Date(),
      })),
    ];

    const conversation = await Conversation.create({
      type: 'group',
      groupName: input.groupName,
      groupAvatar: input.groupAvatar ?? null,
      groupDescription: input.groupDescription ?? '',
      participants,
      createdBy: new mongoose.Types.ObjectId(currentUserId),
    });

    await conversation.populate('participants.user', 'name username avatar lastSeen');

    return conversation.toJSON();
  }

  /**
   * List conversations for current user with pagination
   */
  static async listConversations(currentUserId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    const query = {
      'participants.user': new mongoose.Types.ObjectId(currentUserId),
      isArchived: false,
    };

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants.user', 'name username avatar lastSeen')
        .populate('lastMessage.sender', 'name username avatar'),
      Conversation.countDocuments(query),
    ]);

    return {
      conversations: conversations.map((c) => c.toJSON()),
      meta: {
        page,
        limit,
        total,
        hasMore: skip + conversations.length < total,
      },
    };
  }

  /**
   * Get single conversation details with membership authorization check
   */
  static async getConversation(conversationId: string, currentUserId: string) {
    const conversation = await Conversation.findById(conversationId)
      .populate('participants.user', 'name username avatar lastSeen')
      .populate('lastMessage.sender', 'name username avatar');

    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (!conversation.hasParticipant(currentUserId)) {
      throw new AppError('You are not a participant in this conversation', 403, 'FORBIDDEN');
    }

    return conversation.toJSON();
  }

  /**
   * Update group details (owner or admin only)
   */
  static async updateGroup(conversationId: string, currentUserId: string, input: UpdateGroupInput) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (conversation.type !== 'group') {
      throw new AppError('Only group conversations can be modified', 400, 'NOT_A_GROUP');
    }

    const role = conversation.getParticipantRole(currentUserId);
    if (role !== 'owner' && role !== 'admin') {
      throw new AppError('Only group owners or admins can update group information', 403, 'FORBIDDEN');
    }

    if (input.groupName !== undefined) conversation.groupName = input.groupName;
    if (input.groupAvatar !== undefined) conversation.groupAvatar = input.groupAvatar;
    if (input.groupDescription !== undefined) conversation.groupDescription = input.groupDescription;

    await conversation.save();
    await conversation.populate('participants.user', 'name username avatar lastSeen');

    return conversation.toJSON();
  }

  /**
   * Delete conversation (owner only for groups, participant for private)
   */
  static async deleteConversation(conversationId: string, currentUserId: string) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (conversation.type === 'group') {
      const role = conversation.getParticipantRole(currentUserId);
      if (role !== 'owner') {
        throw new AppError('Only the group owner can delete this group conversation', 403, 'FORBIDDEN');
      }
    } else {
      if (!conversation.hasParticipant(currentUserId)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
    }

    await Conversation.findByIdAndDelete(conversationId);
    return { deleted: true };
  }

  /**
   * Add members to group
   */
  static async addMembers(conversationId: string, currentUserId: string, userIds: string[]) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new AppError('Group conversation not found', 404, 'GROUP_NOT_FOUND');
    }

    const callerRole = conversation.getParticipantRole(currentUserId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      throw new AppError('Only group owners or admins can add members', 403, 'FORBIDDEN');
    }

    const newIds = userIds.filter((id) => !conversation.hasParticipant(id));
    if (newIds.length === 0) {
      return conversation.toJSON();
    }

    const validUsers = await User.find({ _id: { $in: newIds }, status: 'active' });
    validUsers.forEach((u) => {
      conversation.participants.push({
        user: u._id,
        role: 'member',
        joinedAt: new Date(),
      });
    });

    await conversation.save();
    await conversation.populate('participants.user', 'name username avatar lastSeen');

    return conversation.toJSON();
  }

  /**
   * Remove member from group
   */
  static async removeMember(conversationId: string, currentUserId: string, targetUserId: string) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new AppError('Group conversation not found', 404, 'GROUP_NOT_FOUND');
    }

    const callerRole = conversation.getParticipantRole(currentUserId);
    const targetRole = conversation.getParticipantRole(targetUserId);

    if (!targetRole) {
      throw new AppError('User is not a member of this group', 404, 'MEMBER_NOT_FOUND');
    }

    if (targetRole === 'owner') {
      throw new AppError('The group owner cannot be removed', 400, 'CANNOT_REMOVE_OWNER');
    }

    // Owner can remove anyone; Admin can only remove regular members
    if (callerRole !== 'owner' && (callerRole !== 'admin' || targetRole !== 'member')) {
      throw new AppError('Insufficient permissions to remove this member', 403, 'FORBIDDEN');
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.user.toString() !== targetUserId
    );

    await conversation.save();
    await conversation.populate('participants.user', 'name username avatar lastSeen');

    return conversation.toJSON();
  }

  /**
   * Leave group conversation
   */
  static async leaveGroup(conversationId: string, currentUserId: string) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new AppError('Group conversation not found', 404, 'GROUP_NOT_FOUND');
    }

    if (!conversation.hasParticipant(currentUserId)) {
      throw new AppError('You are not a member of this group', 400, 'NOT_A_MEMBER');
    }

    const callerRole = conversation.getParticipantRole(currentUserId);
    conversation.participants = conversation.participants.filter(
      (p) => p.user.toString() !== currentUserId
    );

    // If owner left and members remain, promote next admin or first member to owner
    if (callerRole === 'owner' && conversation.participants.length > 0) {
      const nextAdmin = conversation.participants.find((p) => p.role === 'admin');
      if (nextAdmin) {
        nextAdmin.role = 'owner';
      } else {
        conversation.participants[0].role = 'owner';
      }
    }

    // If no members remain, delete the conversation
    if (conversation.participants.length === 0) {
      await Conversation.findByIdAndDelete(conversationId);
      return { left: true, groupDeleted: true };
    }

    await conversation.save();
    return { left: true };
  }
}
