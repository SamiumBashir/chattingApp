import mongoose, { Document, Model, Schema } from 'mongoose';

export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface IAttachment {
  url: string;
  secureUrl: string;
  publicId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface IReaction {
  user: mongoose.Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  clientMessageId: string;
  content: string;
  type: MessageType;
  attachments: IAttachment[];
  replyTo?: mongoose.Types.ObjectId | null;
  reactions: IReaction[];
  isEdited: boolean;
  editedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
  {
    url: { type: String, required: true },
    secureUrl: {
      type: String,
      default: function () {
        return (this as any).url;
      },
    },
    publicId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false }
);

const reactionSchema = new Schema<IReaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientMessageId: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: [5000, 'Message content cannot exceed 5000 characters'],
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
      index: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
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
        return ret;
      },
    },
  }
);

// Critical idempotency index: prevents duplicate messages when clients retry network emissions
messageSchema.index({ conversation: 1, clientMessageId: 1 }, { unique: true });

// Cursor pagination index: fast retrieval by conversation ordered chronologically
messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);

