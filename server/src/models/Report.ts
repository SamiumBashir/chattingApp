import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate_content'
  | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export type ReportActionTaken =
  | 'none'
  | 'warning'
  | 'message_deleted'
  | 'user_suspended'
  | 'user_banned';

export interface IReport extends Document {
  _id: Types.ObjectId;
  reporter: Types.ObjectId;
  reportedUser?: Types.ObjectId;
  reportedMessage?: Types.ObjectId;
  reportedConversation?: Types.ObjectId;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  actionTaken: ReportActionTaken;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    reportedMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    reportedConversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
    },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other'],
      required: true,
      default: 'other',
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
      default: 'pending',
      index: true,
    },
    actionTaken: {
      type: String,
      enum: ['none', 'warning', 'message_deleted', 'user_suspended', 'user_banned'],
      default: 'none',
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
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

ReportSchema.index({ status: 1, createdAt: -1 });

export const Report: Model<IReport> =
  mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);

