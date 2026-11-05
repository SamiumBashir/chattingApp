import mongoose, { Document, Model, Schema } from 'mongoose';

export type ParticipantRole = 'owner' | 'admin' | 'member';

export interface IParticipant {
  user: mongoose.Types.ObjectId;
  role: ParticipantRole;
  joinedAt: Date;
  lastReadMessage?: mongoose.Types.ObjectId | null;
}

export interface ILastMessageCached {
  messageId?: mongoose.Types.ObjectId;
  content: string;
  sender: mongoose.Types.ObjectId;
  type: 'text' | 'image' | 'file' | 'system';
  createdAt: Date;
}

export interface IConversation extends Document {
  type: 'private' | 'group';
  participants: IParticipant[];
  privateUserPairKey?: string | null;
  groupName?: string;
  groupAvatar?: string | null;
  groupDescription?: string;
  createdBy: mongoose.Types.ObjectId;
  lastMessage?: ILastMessageCached | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  hasParticipant(userId: string | mongoose.Types.ObjectId): boolean;
  getParticipantRole(userId: string | mongoose.Types.ObjectId): ParticipantRole | null;
}

const participantSchema = new Schema<IParticipant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: () => new Date(),
    },
    lastReadMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  { _id: false }
);

const lastMessageSchema = new Schema<ILastMessageCached>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    content: {
      type: String,
      default: '',
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['private', 'group'],
      required: true,
      index: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: [
        (val: IParticipant[]) => val.length >= 2,
        'A conversation must have at least 2 participants',
      ],
    },
    // Unique compound key for private chats to prevent duplicate conversations
    privateUserPairKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    groupName: {
      type: String,
      trim: true,
      maxlength: [100, 'Group name cannot exceed 100 characters'],
    },
    groupAvatar: {
      type: String,
      default: null,
    },
    groupDescription: {
      type: String,
      maxlength: [500, 'Group description cannot exceed 500 characters'],
      default: '',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = (ret._id as mongoose.Types.ObjectId)?.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.privateUserPairKey;
        return ret;
      },
    },
  }
);

// Compound index for querying recent conversations for a user efficiently
conversationSchema.index({ 'participants.user': 1, updatedAt: -1 });

// Instance method to check participant membership
conversationSchema.methods.hasParticipant = function (
  userId: string | mongoose.Types.ObjectId
): boolean {
  const targetId = userId.toString();
  return this.participants.some(
    (p: IParticipant) => p.user && p.user.toString() === targetId
  );
};

// Instance method to get participant role
conversationSchema.methods.getParticipantRole = function (
  userId: string | mongoose.Types.ObjectId
): ParticipantRole | null {
  const targetId = userId.toString();
  const participant = this.participants.find(
    (p: IParticipant) => p.user && p.user.toString() === targetId
  );
  return participant ? participant.role : null;
};

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', conversationSchema);

