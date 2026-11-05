import mongoose, { Document, Model, Schema } from 'mongoose';

export type ReceiptStatus = 'sent' | 'delivered' | 'read';

export interface IMessageReceipt extends Document {
  message: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  status: ReceiptStatus;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const messageReceiptSchema = new Schema<IMessageReceipt>(
  {
    message: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
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

// One receipt record per message per user
messageReceiptSchema.index({ message: 1, user: 1 }, { unique: true });

// Index for counting unread receipts in a conversation
messageReceiptSchema.index({ conversation: 1, user: 1, status: 1 });

export const MessageReceipt: Model<IMessageReceipt> =
  mongoose.models.MessageReceipt ||
  mongoose.model<IMessageReceipt>('MessageReceipt', messageReceiptSchema);

