import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type NotificationType =
  | 'message'
  | 'mention'
  | 'reaction'
  | 'group_invite'
  | 'system';

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  actor?: Types.ObjectId;
  type: NotificationType;
  conversation?: Types.ObjectId;
  message?: Types.ObjectId;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    type: {
      type: String,
      enum: ['message', 'mention', 'reaction', 'group_invite', 'system'],
      required: true,
      default: 'system',
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: false,
    },
    message: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for optimal unread query performance
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);

