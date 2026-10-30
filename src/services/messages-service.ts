// SECURITY FIX — P2-3/P2-4: this service no longer sends userEmail /
// senderEmail / editorEmail / recipientEmail as identity. The server
// derives identity from the locora_session cookie. Caller arguments
// are kept for call-site compatibility but are NOT sent. For a first
// message to an organiser, send organizerId (see MessagesPage) and let
// the server resolve the recipient email from the stored event.
import { apiClient, ApiError } from './api-client';

// Private attendee <-> organizer messages (see api/messages.ts).
//
// Deliberately NO localStorage fallback here, unlike registrations:
// a message that only lives in one browser would look "sent" while the
// other person never receives it. If the API is down or the table is
// missing, sends throw and the UI says so instead of faking success.
// Reads likewise return only what the server has.

export interface MessageAttachment {
  name: string;
  size: number;
  type: string;
  url: string;
  path: string;
}

export interface EventMessage {
  id: string;
  eventId: string;
  eventTitle?: string;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string;
  text?: string;
  attachment?: MessageAttachment | null;
  read?: boolean;
  edited?: boolean;
  editedAt?: string;
  hiddenFor?: string[];
  createdAt: string;
}

export interface MessageThread {
  key: string;
  eventId: string;
  eventTitle: string;
  otherEmail: string;
  otherName: string;
  messages: EventMessage[];
  lastAt: string;
  unread: number;
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'mp4', 'webm', 'mov',
  'pdf',
  'doc', 'docx',
  'xls', 'xlsx', 'xlsm',
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One thread per (event, attendee, organizer): the key is the event
// plus both participants' emails, sorted so either side computes the
// same key for the same conversation.
export function threadKey(eventId: string, a: string, b: string): string {
  const [first, second] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${eventId}|${first}|${second}`;
}

export function groupThreads(messages: EventMessage[], meEmail: string): MessageThread[] {
  const me = meEmail.toLowerCase();
  const byKey = new Map<string, MessageThread>();
  for (const m of messages) {
    const otherEmail = m.senderEmail.toLowerCase() === me ? m.recipientEmail : m.senderEmail;
    const otherName =
      m.senderEmail.toLowerCase() === me
        ? m.senderName || m.recipientEmail
        : m.senderName || m.senderEmail;
    const key = threadKey(m.eventId, m.senderEmail, m.recipientEmail);
    const thread = byKey.get(key) || {
      key,
      eventId: m.eventId,
      eventTitle: m.eventTitle || 'Event',
      otherEmail,
      otherName,
      messages: [],
      lastAt: '',
      unread: 0,
    };
    thread.messages.push(m);
    if ((m.createdAt || '') > (thread.lastAt || '')) thread.lastAt = m.createdAt;
    if (m.recipientEmail.toLowerCase() === me && !m.read) thread.unread += 1;
    byKey.set(key, thread);
  }
  const threads = [...byKey.values()];
  for (const t of threads) {
    t.messages.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  threads.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  return threads;
}

function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() || '').toLowerCase();
}

// Returns an error string, or null when the file may be sent.
export function validateAttachment(file: File): string | null {
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'File must be no bigger than 20MB.';
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'File type not allowed — video, image, PDF, Word or spreadsheet only.';
  }
  return null;
}

export interface SendMessageInput {
  eventId: string;
  senderEmail?: string;
  senderName?: string;
  recipientEmail?: string;
  organizerId?: string;
  text?: string;
  attachment?: { name: string; size: number; type: string; path: string };
}

export const messagesService = {
  async getMessages(_userEmail?: string): Promise<EventMessage[]> {
    const data = await apiClient.request<{ messages: EventMessage[] }>('/messages');
    return Array.isArray(data.messages) ? data.messages : [];
  },

  async getUnreadCount(_userEmail?: string): Promise<number> {
    try {
      const data = await apiClient.request<{ count: number }>('/messages', {
        params: { unreadCount: 1 },
      });
      return typeof data.count === 'number' ? data.count : 0;
    } catch {
      return 0;
    }
  },

  async sendMessage(input: SendMessageInput): Promise<EventMessage> {
    // Identity (sender) is the session, never the input. organizerId,
    // when present, lets the server resolve the recipient from the
    // stored event (P2-4); recipientEmail is only sent as a fallback
    // for existing threads, and the server still validates it.
    const { senderEmail: _s, ...rest } = input as any;
    const data = await apiClient.request<{ message: EventMessage }>('/messages', {
      method: 'POST',
      body: JSON.stringify(rest),
    });
    return data.message;
  },

  // "Delete for me": hides the message for this user only, any time.
  async hideMessage(id: string, _userEmail?: string): Promise<void> {
    await apiClient.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ action: 'hide', id }),
    });
  },

  // "Delete for everyone": permanently removes the row (server only
  // allows the sender). Also removes the Storage object best-effort.
  async deleteForEveryone(id: string, _userEmail?: string): Promise<void> {
    await apiClient.request('/messages', {
      params: { id },
      method: 'DELETE',
    });
  },

  // Edit own text within 1 hour of sending (server enforces both).
  async editMessage(id: string, _editorEmail: string, text: string): Promise<EventMessage> {
    const data = await apiClient.request<{ message: EventMessage }>('/messages', {
      params: { id },
      method: 'PATCH',
      body: JSON.stringify({ text }),
    });
    return data.message;
  },

  async markAsRead(id: string, _recipientEmail?: string): Promise<void> {
    try {
      await apiClient.request('/messages', {
        params: { id },
        method: 'PATCH',
        body: JSON.stringify({}),
      });
    } catch (err) {
      // Read receipts are cosmetic; a failure here must never break chat.
      console.warn('markAsRead failed:', err);
    }
  },

  async requestUploadUrl(input: {
    eventId: string;
    senderEmail?: string;
    recipientEmail?: string;
    organizerId?: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }): Promise<{ uploadUrl: string; publicUrl: string; path: string }> {
    const { senderEmail: _s, ...rest } = input as any;
    return apiClient.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ action: 'upload-url', ...rest }),
    });
  },

  // Direct browser -> Supabase Storage PUT. The file never passes
  // through Vercel (which caps payloads around 4.5MB).
  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      throw new ApiError(`Upload failed (${res.status})`, res.status);
    }
  },
};
