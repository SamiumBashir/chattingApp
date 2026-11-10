import { apiClient } from '../lib/api';
import { ApiResponse } from '../types';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersData {
  iceServers: RTCIceServer[];
  ttl: number;
  expiresAt: string;
}

export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];

let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiryTime = 0;
let pendingFetchPromise: Promise<RTCIceServer[]> | null = null;

export interface CallRecord {
  id: string;
  callId: string;
  conversation: string | { _id: string; type: string; groupName?: string };
  caller: { id?: string; _id?: string; name: string; username: string; avatar?: string };
  recipient: { id?: string; _id?: string; name: string; username: string; avatar?: string };
  callType: 'audio' | 'video';
  status: 'missed' | 'declined' | 'completed' | 'failed' | 'cancelled' | 'busy';
  startedAt: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  duration: number;
  endReason?: string;
  qualityMetrics?: { averageRtt?: number; packetLoss?: number; resolution?: string };
  createdAt: string;
}

export interface CallHistoryResponse {
  calls: CallRecord[];
}

export const callService = {
  /**
   * Fetches fresh STUN/TURN ICE servers with short-lived credentials from backend
   */
  async fetchIceServers(): Promise<RTCIceServer[]> {
    try {
      const res = await apiClient.get<ApiResponse<IceServersData>>('/calls/ice-servers');
      if (res.data?.success && res.data.data?.iceServers?.length) {
        cachedIceServers = res.data.data.iceServers;
        // Expire 60 seconds before actual TTL to guarantee validity during connection negotiation
        const expiryMs = res.data.data.expiresAt
          ? new Date(res.data.data.expiresAt).getTime() - 60000
          : Date.now() + (res.data.data.ttl || 86400) * 1000 - 60000;
        cacheExpiryTime = expiryMs;
        return cachedIceServers;
      }
      return cachedIceServers || DEFAULT_STUN_SERVERS;
    } catch (err) {
      console.warn('Could not fetch ephemeral ICE servers from backend, falling back to STUN:', err);
      return cachedIceServers || DEFAULT_STUN_SERVERS;
    } finally {
      pendingFetchPromise = null;
    }
  },

  /**
   * Retrieves ICE servers, using unexpired cache when valid, or fetching if absent/expired
   */
  async getIceServers(): Promise<RTCIceServer[]> {
    const now = Date.now();
    if (cachedIceServers && now < cacheExpiryTime) {
      return cachedIceServers;
    }

    if (pendingFetchPromise) {
      return pendingFetchPromise;
    }

    pendingFetchPromise = this.fetchIceServers();
    return pendingFetchPromise;
  },

  /**
   * Synchronous getter returning cached ICE servers immediately, falling back to standard STUN
   */
  getCachedIceServers(): RTCIceServer[] {
    if (cachedIceServers && Date.now() < cacheExpiryTime) {
      return cachedIceServers;
    }
    // Asynchronously trigger refresh for next usage
    this.getIceServers().catch(() => {});
    return cachedIceServers || DEFAULT_STUN_SERVERS;
  },

  /**
   * Clears cached ICE servers (e.g., on sign-out)
   */
  clearCache(): void {
    cachedIceServers = null;
    cacheExpiryTime = 0;
    pendingFetchPromise = null;
  },

  /**
   * Fetches paginated call history for authenticated user
   */
  async getCallHistory(params?: {
    page?: number;
    limit?: number;
    callType?: 'audio' | 'video';
    status?: string;
  }): Promise<ApiResponse<CallHistoryResponse>> {
    const res = await apiClient.get<ApiResponse<CallHistoryResponse>>('/calls/history', {
      params,
    });
    return res.data;
  },

  /**
   * Fetches call logs for a specific conversation
   */
  async getConversationCalls(
    conversationId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ApiResponse<CallHistoryResponse>> {
    const res = await apiClient.get<ApiResponse<CallHistoryResponse>>(
      `/conversations/${conversationId}/calls`,
      { params }
    );
    return res.data;
  },

  /**
   * Fetches details for a single call
   */
  async getCallDetails(id: string): Promise<ApiResponse<{ call: CallRecord }>> {
    const res = await apiClient.get<ApiResponse<{ call: CallRecord }>>(`/calls/${id}`);
    return res.data;
  },

  /**
   * Submits quality rating and qualitative feedback for a completed call
   */
  async submitCallRating(
    id: string,
    rating: number,
    feedback?: string,
    tags?: string[]
  ): Promise<ApiResponse<{ call: CallRecord }>> {
    const res = await apiClient.post<ApiResponse<{ call: CallRecord }>>(`/calls/${id}/rating`, {
      rating,
      feedback,
      tags,
    });
    return res.data;
  },
};

