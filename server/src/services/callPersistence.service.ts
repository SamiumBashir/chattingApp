import mongoose from 'mongoose';
import { Call, ICall, CallStatus, CallType, IQualityMetrics } from '../models/Call.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { ActiveCallSession } from './callState.service.js';
import { logger } from '../utils/logger.js';
import { getSocketGateway } from '../sockets/socketGateway.js';

export class CallPersistenceService {
  /**
   * Formats call duration into friendly text (e.g. "45s", "2m 15s", "1h 5m")
   */
  public static formatDuration(seconds: number): string {
    if (seconds <= 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
      return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
    }
    return `${secs}s`;
  }

  /**
   * Formats call summary text for conversation timeline message
   */
  public static formatCallMessageContent(
    callType: CallType,
    status: CallStatus,
    duration: number
  ): string {
    const typeLabel = callType === 'video' ? 'video' : 'voice';
    switch (status) {
      case 'missed':
        return `Missed ${typeLabel} call`;
      case 'declined':
        return `Declined ${typeLabel} call`;
      case 'busy':
        return `Busy · ${typeLabel} call`;
      case 'cancelled':
        return `Cancelled ${typeLabel} call`;
      case 'failed':
        return `Failed ${typeLabel} call`;
      case 'completed':
      default:
        return `${callType === 'video' ? 'Video' : 'Voice'} call · ${this.formatDuration(duration)}`;
    }
  }

  /**
   * Records call termination in MongoDB and creates a conversation message
   */
  public static async recordCallTermination(
    session: ActiveCallSession,
    reason = 'ended',
    qualityMetrics?: IQualityMetrics
  ): Promise<ICall | null> {
    try {
      if (!session || !session.callId) return null;

      // 1. Determine status
      let status: CallStatus;
      if (session.connectedAt) {
        if (
          reason.includes('failed') ||
          reason === 'network_loss' ||
          reason === 'timeout'
        ) {
          status = 'failed';
        } else {
          status = 'completed';
        }
      } else {
        if (reason === 'timeout' || reason === 'no_answer') {
          status = 'missed';
        } else if (reason === 'declined' || reason === 'rejected') {
          status = 'declined';
        } else if (reason === 'busy') {
          status = 'busy';
        } else if (reason === 'cancelled') {
          status = 'cancelled';
        } else if (reason.includes('error') || reason === 'hardware_error') {
          status = 'failed';
        } else {
          status = 'cancelled';
        }
      }

      // 2. Compute duration in seconds
      let duration = 0;
      if (session.connectedAt) {
        const startMs = new Date(session.connectedAt).getTime();
        const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
        duration = Math.max(0, Math.round((endMs - startMs) / 1000));
      }

      const startedDate = new Date(session.startedAt || Date.now());
      const connectedDate = session.connectedAt ? new Date(session.connectedAt) : null;
      const endedDate = session.endedAt ? new Date(session.endedAt) : new Date();

      // 3. Upsert Call document in MongoDB
      const callDoc = await Call.findOneAndUpdate(
        { callId: session.callId },
        {
          callId: session.callId,
          conversation: session.conversationId,
          caller: session.callerId,
          recipient: session.recipientId,
          callType: session.callType,
          status,
          startedAt: startedDate,
          connectedAt: connectedDate,
          endedAt: endedDate,
          duration,
          endReason: reason,
          qualityMetrics: qualityMetrics || null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // 4. Inject conversation timeline message
      try {
        const clientMessageId = `call_msg_${session.callId}`;
        const content = this.formatCallMessageContent(session.callType, status, duration);

        const existingMsg = await Message.findOne({
          conversation: session.conversationId,
          clientMessageId,
        });

        if (!existingMsg) {
          const callMessage = await Message.create({
            conversation: session.conversationId,
            sender: session.callerId,
            clientMessageId,
            type: 'system',
            content,
          });

          // Update conversation's lastMessage
          await Conversation.findByIdAndUpdate(session.conversationId, {
            lastMessage: {
              messageId: callMessage._id,
              content,
              sender: session.callerId,
              type: 'system',
              createdAt: callMessage.createdAt,
            },
          });

          // Broadcast real-time message event to conversation room
          try {
            const io = getSocketGateway();
            if (io) {
              io.to(`conversation:${session.conversationId}`).emit('message:received', {
                message: callMessage.toJSON(),
              });
            }
          } catch {
            // Socket IO not initialized in some test harnesses
          }
        }
      } catch (msgErr: any) {
        logger.warn(`Could not inject call timeline message (${msgErr.message})`);
      }

      return callDoc;
    } catch (err: any) {
      logger.error(`Error in recordCallTermination: ${err.message}`, { stack: err.stack });
      return null;
    }
  }

  /**
   * Retrieves paginated call history for a user
   */
  public static async getUserCallHistory(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      callType?: CallType;
      status?: CallStatus;
    } = {}
  ): Promise<{
    calls: ICall[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const query: any = {
      $or: [{ caller: userObjectId }, { recipient: userObjectId }],
    };

    if (options.callType) {
      query.callType = options.callType;
    }
    if (options.status) {
      query.status = options.status;
    }

    const [calls, total] = await Promise.all([
      Call.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('caller', 'name username avatar')
        .populate('recipient', 'name username avatar')
        .exec(),
      Call.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      calls,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Retrieves paginated call logs for a specific conversation
   */
  public static async getConversationCallHistory(
    conversationId: string,
    options: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    calls: ICall[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const convObjectId = new mongoose.Types.ObjectId(conversationId);
    const query = { conversation: convObjectId };

    const [calls, total] = await Promise.all([
      Call.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('caller', 'name username avatar')
        .populate('recipient', 'name username avatar')
        .exec(),
      Call.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      calls,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Retrieves a single call record by callId or MongoDB _id
   */
  public static async getCallById(callIdentifier: string): Promise<ICall | null> {
    if (mongoose.Types.ObjectId.isValid(callIdentifier)) {
      const byMongoId = await Call.findById(callIdentifier)
        .populate('caller', 'name username avatar')
        .populate('recipient', 'name username avatar')
        .populate('conversation', 'type groupName')
        .exec();
      if (byMongoId) return byMongoId;
    }

    return Call.findOne({ callId: callIdentifier })
      .populate('caller', 'name username avatar')
      .populate('recipient', 'name username avatar')
      .populate('conversation', 'type groupName')
      .exec();
  }

  /**
   * Submits quality rating and feedback for a call
   */
  public static async submitRating(
    callIdentifier: string,
    ratingData: {
      rating: number;
      feedback?: string;
      tags?: string[];
      ratedBy: string;
    }
  ): Promise<ICall | null> {
    let query: any = { callId: callIdentifier };
    if (mongoose.Types.ObjectId.isValid(callIdentifier)) {
      query = { $or: [{ _id: callIdentifier }, { callId: callIdentifier }] };
    }

    const updated = await Call.findOneAndUpdate(
      query,
      {
        $set: {
          rating: {
            rating: ratingData.rating,
            feedback: ratingData.feedback,
            tags: ratingData.tags || [],
            ratedBy: new mongoose.Types.ObjectId(ratingData.ratedBy),
            ratedAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate('caller', 'name username avatar')
      .populate('recipient', 'name username avatar')
      .populate('conversation', 'type groupName')
      .exec();

    return updated;
  }
}
