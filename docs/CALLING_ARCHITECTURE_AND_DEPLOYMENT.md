# Connectly Calling Architecture & Production Deployment Guide

## 1. Executive Architecture Overview

Connectly's voice and video calling infrastructure is designed for high availability, zero-secret browser exposure, sub-second peer-to-peer latency, and carrier-grade fault recovery comparable to WhatsApp, Telegram, and Messenger.

```
                          +------------------------------------------+
                          |             Browser Client               |
                          |  Next.js 15 App Router / React 19        |
                          |  Zustand Call Store / WebRTC Media       |
                          +--------------------+---------------------+
                                               |
                     +-------------------------+-------------------------+
                     | WebSocket Signaling                               | HTTP / REST (Auth, ICE)
                     v                                                   v
          +----------------------+                            +----------------------+
          |   Socket.IO Gateway  |                            |   Express REST API   |
          |  (Node.js / Express) |                            |   (Authentication)   |
          +----------+-----------+                            +----------+-----------+
                     |                                                   |
                     +--------------------+------------------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
                      v                                       v
             +-----------------+                     +-----------------+
             |   Redis (ioredis)|                    |  MongoDB Atlas  |
             |  Shared Presence|                     |   Call History  |
             |  Distributed Map|                     |   Audit Logs    |
             |  Atomic Locks   |                     |   Quality Stats |
             +-----------------+                     +-----------------+
                      |
                      v
             +-----------------------------------------------+
             |       CoTURN / Managed TURN Relay Servers     |
             |   RFC 5766 REST Ephemeral HMAC-SHA1 Auth      |
             |   UDP, TCP, and TLS (TURNS:443) Transport     |
             +-----------------------------------------------+
```

---

## 2. Calling State Machine

A single authoritative state machine governs call lifecycles across frontend and backend:

| State | Role / Meaning | Trigger Event / Next Transitions |
|---|---|---|
| `idle` | Inactive / resting | Caller initiates (`initiating`) or incoming invite (`incoming`) |
| `initiating` | Caller is dialing | Backend checks conversation membership & presence |
| `ringing` | Dialing tone playing | Recipient devices alerted via `call:incoming` |
| `incoming` | Incoming invite dialog | Recipient chooses Accept (`accepting`) or Decline (`ended`) |
| `accepting` | Recipient accepted | Local audio/video stream acquired |
| `connecting` | WebRTC negotiation | Perfect Negotiation: Offer/Answer & ICE candidate exchange |
| `connected` | Verified media link | **Rule 10:** Enters only when `connectionState === 'connected'` |
| `reconnecting` | Network interruption | **Rule 11:** 15s grace timer; triggers `restartIce()` without dropping |
| `ending` | Teardown initiated | Streams stopped, tracks unmuted, resources released |
| `ended` | Terminated | Call recorded to MongoDB; quality feedback prompt displayed |
| `failed` | Unrecoverable error | User alerted with clear error; auto-resets to `idle` |

---

## 3. Environment Variable Configuration

### Server (`server/.env`)
```bash
# Core Application
NODE_ENV=production
PORT=5000
CLIENT_URL=https://connectly.yourdomain.com

# Database & Cache
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/connectly?retryWrites=true&w=majority
REDIS_URL=redis://default:<password>@redis-server:6379

# JWT Authentication
JWT_ACCESS_SECRET=your_hyper_secure_access_secret_min_32_characters
JWT_REFRESH_SECRET=your_hyper_secure_refresh_secret_min_32_characters
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# WebRTC STUN & TURN Infrastructure (RFC 5766)
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_SERVERS=turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp,turns:turn.yourdomain.com:443?transport=tcp
TURN_SECRET=your_production_coturn_hmac_secret_key
TURN_CREDENTIAL_TTL=86400
```

### Client (`client/.env.local`)
```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://api.yourdomain.com
# IMPORTANT: Never expose permanent TURN credentials or secrets in NEXT_PUBLIC_* variables.
```

---

## 4. Multi-Server & Multi-Device Distributed Architecture

1. **Redis Socket Mapping:** Individual device sockets are mapped to user accounts (`user_sockets:{userId}`) with automatic TTL maintenance.
2. **Simultaneous Ringing:** Incoming calls ring all authenticated devices of the recipient simultaneously.
3. **Cross-Device Dismissal:** Answering on Device 1 broadcasts `call:answered-elsewhere` to dismiss rings on Device 2.
4. **Resilient Disconnect:** A disconnect on one device does not terminate an active call on another device or mark the user offline if other sockets remain.
5. **Horizontal Scaling:** Multiple stateless Socket.IO nodes sync call state and rooms via `@socket.io/redis-adapter` and Redis atomic operations.

---

## 5. Security & Rate-Limiting Guarantees

- **No Client Forgery:** All call signaling payloads (`call:initiate`, `call:accept`, `call:reject`, `call:end`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) derive identity strictly from the verified JWT socket handshake (`socket.data.user`). Client-provided `callerId` is ignored.
- **Conversation Authorization:** Callers and recipients must belong to the active conversation.
- **Anti-Replay Protection:** Once a call session is terminated, late or replayed signaling events are rejected.
- **Signaling Flood Rate Limiting:** Socket gateways limit incoming signaling events to a sliding window of 25 events per 5 seconds per socket to prevent DoS attacks.
- **Quality Feedback Authorization:** `POST /api/v1/calls/:id/rating` verifies caller/recipient participation and enforces numerical bounds (1 to 5).

---

## 6. Adaptive Media & Network Degradation Engine

- **Real-Time WebRTC Telemetry:** Local diagnostic polling extracts RTT, packet loss %, jitter, and bitrates via `RTCPeerConnection.getStats()`.
- **Sender Encoding Parameters:** Uses `RTCRtpSender.setParameters()` to scale resolution (`scaleResolutionDownBy`) and throttle bitrates (`maxBitrate`) natively.
- **Anti-Oscillation (Hysteresis):** Downscaling occurs immediately (1 sample) to clear bufferbloat; resolution upgrades require 3 consecutive stable samples.
- **Audio-Only Fallback:** Severe packet loss ($\ge 20\%$) or latency ($\ge 500\text{ ms}$) for 2 cycles degrades video to prioritize voice clarity. Video automatically restores after 3 stable cycles.
- **Tab Backgrounding:** Dynamically throttles diagnostic polling from 2000ms (foreground) to 5000ms (background) to conserve CPU and battery.

