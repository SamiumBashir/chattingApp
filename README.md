# Connectly — Modern Real-Time Messaging Platform

Connectly is a production-minded, real-time messaging application inspired by WhatsApp, Messenger, and modern SaaS platforms. Built with Next.js (App Router), Express.js, MongoDB (Mongoose), and Socket.IO.

---

## Architecture Overview

```
connectly/
├── client/                     # Next.js App Router Frontend
│   ├── src/
│   │   ├── app/                # Route handlers and pages
│   │   ├── components/         # UI components (shadcn/ui style, layout, shared)
│   │   ├── features/           # Feature modules (auth, chat, groups, etc.)
│   │   ├── hooks/              # Custom React hooks (socket, presence, queries)
│   │   ├── lib/                # Utilities and API client (axios / fetch wrapper)
│   │   ├── services/           # Typed API service calls
│   │   ├── store/              # Zustand state stores
│   │   ├── types/              # TypeScript interface definitions
│   │   └── utils/              # Formatting and helper functions
│   └── package.json
├── server/                     # Express.js TypeScript Backend
│   ├── src/
│   │   ├── config/             # Environment, DB, and Cloudinary configuration
│   │   ├── modules/            # Modular feature slices (auth, users, conversations, messages...)
│   │   ├── sockets/            # Socket.IO gateway, authentication, and event handlers
│   │   ├── middlewares/        # Auth, role check, validation, rate limiting, error handling
│   │   ├── models/             # Mongoose database models & indexes
│   │   ├── services/           # Shared business logic services
│   │   ├── utils/              # Helpers, logger, API envelope
│   │   ├── validators/         # Zod schemas for request validation
│   │   ├── types/              # Backend TypeScript types
│   │   ├── app.ts              # Express application configuration
│   │   └── server.ts           # HTTP server and Socket.IO gateway entry point
│   └── package.json
├── IMPLEMENTATION_STATUS.md    # Real-time roadmap and implementation tracker
├── .env.example                # Unified environment variable documentation
└── README.md                   # Documentation
```

---

## Tech Stack

### Frontend
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS & Lucide React
- **Design System**: Reusable accessible UI components (shadcn/ui inspiration)
- **Client State**: Zustand
- **Server State**: TanStack Query (React Query)
- **Forms & Validation**: React Hook Form + Zod
- **Real-Time Client**: Socket.IO Client

### Backend
- **Runtime & Framework**: Node.js & Express.js
- **Language**: TypeScript (strict mode)
- **Database**: MongoDB with Mongoose ODM
- **Real-Time Gateway**: Socket.IO
- **Validation**: Zod
- **Authentication**: JWT (Access Token in-memory, Refresh Token in HttpOnly cookie with database session rotation) & bcryptjs
- **Security**: Helmet, CORS allowlist, Express Rate Limit, Mongo Sanitize / strict inputs

---

## Getting Started

### 1. Environment Setup
Copy `.env.example` in both `client/` and `server/`:
```bash
# In client/
cp .env.example .env.local

# In server/
cp .env.example .env
```

### 2. Backend Server Setup
```bash
cd server
npm install
npm run dev
```

### 3. Frontend Client Setup
```bash
cd client
npm install
npm run dev
```

---

## Health Check Endpoint
- `GET http://localhost:5000/api/v1/health`

---

## API Reference (`/api/v1`)

### Authentication & Sessions
- `POST /api/v1/auth/register` - Create account with email & password verification
- `POST /api/v1/auth/login` - Secure login with HttpOnly refresh cookie rotation
- `POST /api/v1/auth/google` - Google OAuth 2.0 authentication & automatic account linking
- `POST /api/v1/auth/logout` - Revoke active device session
- `POST /api/v1/auth/refresh` - Rotate refresh token & issue new access token
- `GET /api/v1/auth/me` - Authenticated user profile
- `POST /api/v1/auth/verify-email` - Verify email token
- `POST /api/v1/auth/forgot-password` - Request password reset email
- `POST /api/v1/auth/reset-password` - Reset password with token
- `GET /api/v1/auth/sessions` - List active sessions across user devices
- `DELETE /api/v1/auth/sessions/:id` - Revoke specific session

### Users
- `GET /api/v1/users/me` - Get current user profile
- `PATCH /api/v1/users/me` - Update profile name, bio, or avatar
- `GET /api/v1/users/search` - Search users by name or username
- `GET /api/v1/users/:userId` - Get public profile
- `POST /api/v1/users/:userId/block` - Block user
- `DELETE /api/v1/users/:userId/block` - Unblock user
- `GET /api/v1/users/blocked` - List blocked users

### Conversations
- `GET /api/v1/conversations` - List active conversations with unread counts
- `POST /api/v1/conversations/private` - Create or fetch 1-to-1 conversation
- `POST /api/v1/conversations/group` - Create group conversation
- `GET /api/v1/conversations/:id` - Get conversation details and participants
- `PATCH /api/v1/conversations/:id` - Update group name, description, avatar
- `DELETE /api/v1/conversations/:id` - Delete conversation (owner/admin)
- `POST /api/v1/conversations/:id/members` - Add member to group
- `DELETE /api/v1/conversations/:id/members/:userId` - Remove member from group
- `POST /api/v1/conversations/:id/leave` - Leave group (with owner handover)

### Messages
- `GET /api/v1/conversations/:id/messages` - Cursor-paginated message history
- `POST /api/v1/conversations/:id/messages` - REST fallback message persistence
- `POST /api/v1/messages/:id/read` - Mark message read receipt
- `PATCH /api/v1/messages/:id` - Edit message within edit window
- `DELETE /api/v1/messages/:id` - Soft-delete message (tombstone)
- `POST /api/v1/messages/:id/reactions` - Add emoji reaction
- `DELETE /api/v1/messages/:id/reactions` - Remove emoji reaction
- `GET /api/v1/messages/search` - Search message history across authorized chats

### Uploads & Cloudinary
- `POST /api/v1/uploads/signature` - Get Cloudinary upload signature
- `POST /api/v1/uploads/complete` - Confirm and register upload
- `POST /api/v1/uploads/direct` - Direct multipart/form-data upload fallback
- `DELETE /api/v1/uploads/:publicId` - Delete uploaded asset

### Notifications
- `GET /api/v1/notifications` - Paginated user notification list & unread count
- `PATCH /api/v1/notifications/:id/read` - Mark single notification as read
- `POST /api/v1/notifications/read-all` - Mark all notifications as read

### Administration (`requireRole('admin', 'superadmin')`)
- `GET /api/v1/admin/overview` - KPI counters (total users, conversations, messages, reports)
- `GET /api/v1/admin/users` - Paginated user directory with role & status filters
- `PATCH /api/v1/admin/users/:id/status` - Suspend or ban user (and revoke active sessions)
- `POST /api/v1/admin/reports` - Submit moderation report (available to all users)
- `GET /api/v1/admin/reports` - Moderation queue
- `PATCH /api/v1/admin/reports/:id` - Resolve report with automated action
- `GET /api/v1/admin/audit-logs` - Chronological audit log trail

---

## Real-Time Socket.IO Events

| Namespace | Event | Direction | Description |
|---|---|---|---|
| Handshake | `authenticate` | Client -> Server | JWT access token validation |
| Rooms | `conversation:join` | Client -> Server | Join conversation room with DB auth check |
| Rooms | `conversation:leave` | Client -> Server | Leave conversation room |
| Presence | `presence:subscribe` | Client -> Server | Query online status of user IDs |
| Presence | `presence:online` | Server -> Client | User connected (first active socket) |
| Presence | `presence:offline` | Server -> Client | User disconnected (all active sockets closed) |
| Typing | `typing:start` | Client -> Server | Broadcast typing indicator with 4s auto-clear |
| Typing | `typing:stop` | Client -> Server | Immediately clear typing indicator |
| Typing | `typing:update` | Server -> Client | Broadcast typing state to conversation |
| Messaging | `message:send` | Client -> Server | Idempotent message persistence & broadcast |
| Messaging | `message:new` | Server -> Client | Deliver new message to participants |
| Messaging | `message:delivered` | Client -> Server | Delivery receipt |
| Messaging | `message:read` | Client -> Server | Read receipt |
| Messaging | `message:status` | Server -> Client | Update delivery status tick marks |
| Messaging | `message:edited` | Server -> Client | Real-time message edit broadcast |
| Messaging | `message:deleted` | Server -> Client | Real-time message deletion broadcast |
| Messaging | `message:reaction` | Client -> Server | Toggle emoji reaction |
| Messaging | `message:reaction-updated` | Server -> Client | Updated reaction counts broadcast |
| Notifications | `notification:new` | Server -> Client | Real-time notification alert |

---

## Testing & Quality Assurance

Run backend test suites:
```bash
cd server
npm test
```
*Current test suite: **48 passing tests** across 7 test suites (`health`, `auth`, `conversations`, `messages`, `messageExperience`, `advancedFeatures`, `admin`).*

Run frontend typecheck & production build:
```bash
cd client
npm run typecheck
npm run build
```
*Current frontend build: **11/11 routes prerendered**, 0 type errors.*


