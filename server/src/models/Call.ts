import mongoose, { Document, Model, Schema } from 'mongoose';

export type CallStatus =
  | 'missed'
  | 'declined'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'busy';

export type CallType = 'audio' | 'video';

export interface IQualityMetrics {
  averageRtt?: number;
  packetLoss?: number;
  resolution?: string;
}

export interface ICallRating {
  rating: number; // 1-5
  feedback?: string;
  tags?: string[];
  ratedBy: mongoose.Types.ObjectId;
  ratedAt: Date;
}

export interface ICall extends Document {
  callId: string;
  conversation: mongoose.Types.ObjectId;
  caller: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  callType: CallType;
  status: CallStatus;
  startedAt: Date;
  connectedAt?: Date | null;
  endedAt?: Date | null;
  duration: number; // in seconds
  endReason?: string;
  qualityMetrics?: IQualityMetrics;
  rating?: ICallRating | null;
  createdAt: Date;
  updatedAt: Date;
}

const qualityMetricsSchema = new Schema<IQualityMetrics>(
  {
    averageRtt: { type: Number },
    packetLoss: { type: Number },
    resolution: { type: String },
  },
  { _id: false }
);

const ratingSchema = new Schema<ICallRating>(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    feedback: { type: String, trim: true, maxlength: 1000 },
    tags: [{ type: String, trim: true }],
    ratedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ratedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const callSchema = new Schema<ICall>(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    caller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    callType: {
      type: String,
      enum: ['audio', 'video'],
      required: true,
    },
    status: {
      type: String,
      enum: ['missed', 'declined', 'completed', 'failed', 'cancelled', 'busy'],
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: () => new Date(),
    },
    connectedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    endReason: {
      type: String,
      default: 'user_ended',
    },
    qualityMetrics: {
      type: qualityMetricsSchema,
      default: null,
    },
    rating: {
      type: ratingSchema,
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

// Compound indexes for user call history and conversation retrieval
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ recipient: 1, createdAt: -1 });
callSchema.index({ conversation: 1, createdAt: -1 });
callSchema.index({ caller: 1, recipient: 1, createdAt: -1 });

export const Call: Model<ICall> =
  mongoose.models.Call || mongoose.model<ICall>('Call', callSchema);

