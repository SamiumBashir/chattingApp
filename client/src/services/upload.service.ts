import api from '../lib/api';
import { ApiResponse, Attachment } from '../types';

export interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export const uploadService = {
  /**
   * Request signed upload parameters
   */
  async getSignature(folder = 'connectly/attachments'): Promise<SignatureResponse> {
    const res = await api.post<ApiResponse<SignatureResponse>>('/uploads/signature', { folder });
    return res.data.data!;
  },

  /**
   * Upload file directly to backend (multipart/form-data)
   */
  async uploadFile(file: File, folder = 'connectly/attachments'): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const res = await api.post<ApiResponse<{ attachment: Attachment }>>(
      '/uploads/direct',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    const att = res.data.data!.attachment;
    return {
      ...att,
      secureUrl: att.secureUrl || att.url,
    };
  },

  /**
   * Complete an upload
   */
  async completeUpload(attachment: Partial<Attachment>): Promise<Attachment> {
    const res = await api.post<ApiResponse<{ attachment: Attachment }>>(
      '/uploads/complete',
      attachment
    );
    const att = res.data.data!.attachment;
    return {
      ...att,
      secureUrl: att.secureUrl || att.url,
    };
  },

  /**
   * Delete uploaded asset
   */
  async deleteAsset(publicId: string, resourceType = 'image'): Promise<void> {
    await api.delete(`/uploads/${publicId}`, {
      params: { resourceType },
    });
  },
};

