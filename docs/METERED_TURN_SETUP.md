# Metered TURN Server Integration Guide

This guide explains how to configure and verify **Metered.ca TURN & STUN servers** in Connectly to enable reliable cross-network audio and video calling across restrictive NATs, firewalls, and mobile carrier networks (Wi-Fi to Mobile Data, 4G/5G, symmetric NAT).

---

## 1. Overview & Architecture

WebRTC uses **ICE (Interactive Connectivity Establishment)** to establish real-time audio/video media connections:
1. **STUN (Session Traversal Utilities for NAT):** Discovers each client's public IP and port mapping. Works for direct P2P connections on standard networks.
2. **TURN (Traversal Using Relays around NAT):** When direct P2P is blocked (e.g. carrier-grade NAT, symmetric corporate firewalls, mobile 4G/5G networks), media is encrypted end-to-end and relayed through a TURN server.

### Security Architecture in Connectly
```
┌─────────────────────────────────┐
│     Client (Browser / PWA)      │
└───────────────▲─────────────────┘
                │ 1. GET /api/v1/calls/ice-servers (Bearer JWT)
                │ 2. Returns iceServers array (Never exposes API Keys)
┌───────────────▼─────────────────┐
│         Backend Server          │
│   (Validates JWT & Reads Env)   │
└───────────────▲─────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
Option A: JSON Array   Option B: Metered REST API
(METERED_ICE_SERVERS)  (METERED_DOMAIN & METERED_API_KEY)
```

- **Frontend Security:** TURN credentials, passwords, and Metered API keys are **never** bundled into the client build or exposed via `NEXT_PUBLIC_*` variables.
- **Backend Delivery:** The client requests ICE servers via the authenticated endpoint `GET /api/v1/calls/ice-servers`.
- **Signaling Separation:** Signaling continues over Connectly's existing Socket.IO gateway; WebRTC handles the media transmission.

---

## 2. Choosing Your Metered Setup Option

Metered provides two ways to configure credentials in Connectly:

### Option A: Metered ICE Servers Array JSON (Recommended & Simplest)
Directly paste the **ICE Servers Array** JSON obtained from your Metered Dashboard.

1. Open your **Metered Dashboard**: [https://dashboard.metered.ca](https://dashboard.metered.ca).
2. Go to your App and select **TURN Server**.
3. Under **ICE Servers**, copy the entire JSON array. It will look like this:
   ```json
   [
     {
       "urls": "stun:stun.relay.metered.ca:80"
     },
     {
       "urls": "turn:standard.relay.metered.ca:80",
       "username": "your_username",
       "credential": "your_password"
     },
     {
       "urls": "turn:standard.relay.metered.ca:80?transport=tcp",
       "username": "your_username",
       "credential": "your_password"
     },
     {
       "urls": "turn:standard.relay.metered.ca:443",
       "username": "your_username",
       "credential": "your_password"
     },
     {
       "urls": "turns:standard.relay.metered.ca:443?transport=tcp",
       "username": "your_username",
       "credential": "your_password"
     }
   ]
   ```
4. In your backend `server/.env` file, add:
   ```env
   METERED_ICE_SERVERS=[{"urls":"stun:stun.relay.metered.ca:80"},{"urls":"turn:standard.relay.metered.ca:80","username":"your_username","credential":"your_password"},{"urls":"turn:standard.relay.metered.ca:80?transport=tcp","username":"your_username","credential":"your_password"},{"urls":"turn:standard.relay.metered.ca:443","username":"your_username","credential":"your_password"},{"urls":"turns:standard.relay.metered.ca:443?transport=tcp","username":"your_username","credential":"your_password"}]
   ```
   > **Note:** Base64-encoded strings are also supported if your cloud host strips quotes:
   > `METERED_ICE_SERVERS=<base64_encoded_json_string>`

---

### Option B: Dynamic Ephemeral Credentials via Metered REST API
If you want Connectly to dynamically request temporary credentials from Metered on demand:

1. In your Metered Dashboard, copy your **API Key** and your **App Domain** (e.g., `your-app.metered.ca`).
2. In `server/.env`, set:
   ```env
   METERED_DOMAIN=your-app.metered.ca
   METERED_API_KEY=your_metered_secret_api_key
   METERED_API_CACHE_TTL=3600
   ```
   Connectly will cache the dynamic credentials for 1 hour (`3600` seconds) to prevent hitting Metered API rate limits.

---

### Option C: Static Credentials via Domain, Username, and Password
If you prefer standard environment variables:
```env
METERED_DOMAIN=standard.relay.metered.ca
METERED_USERNAME=your_metered_username
METERED_CREDENTIAL=your_metered_password
```
Connectly will automatically configure the 5 standard Metered endpoints (STUN port 80, TURN UDP 80, TURN TCP 80, TURN UDP/TCP 443, and TURNS TLS 443).

---

## 3. Adding Variables in Production Platforms

### Render.com
1. Go to your **Render Dashboard** -> Select your **Server Web Service**.
2. Navigate to **Environment**.
3. Click **Add Environment Variable**.
4. Key: `METERED_ICE_SERVERS` (or `METERED_DOMAIN` + `METERED_API_KEY`).
5. Value: *[Paste your Metered array JSON or credentials]*.
6. Click **Save Changes** (Render will automatically redeploy).

### Railway.app
1. Go to your project -> Select your backend service.
2. Click **Variables** -> **New Variable**.
3. Add `METERED_ICE_SERVERS`.
4. Click **Deploy**.

### Docker / Docker Compose
In your `docker-compose.yml` or production `.env`:
```yaml
services:
  api:
    environment:
      - METERED_ICE_SERVERS=${METERED_ICE_SERVERS}
```

---

## 4. How to Verify TURN Relay Connectivity

Connectly includes built-in verification tools to ensure calls actually route through TURN relays:

### A. Development Toggle: Force TURN Relay (`iceTransportPolicy: relay`)
To simulate a restrictive NAT where direct P2P is completely blocked:

1. **Option 1 (In-App Toggle):**
   - In any active call, click the **Settings (Sliders)** icon.
   - Under the settings modal, toggle **"Force TURN Relay Testing Mode"**.
   - This sets `iceTransportPolicy: "relay"` on the peer connection.

2. **Option 2 (Environment Variable):**
   - In `client/.env.local`, set:
     ```env
     NEXT_PUBLIC_FORCE_TURN_RELAY=true
     ```
   - Restart the client dev server. Every call will strictly route through TURN relay.

### B. In-Call Real-Time Telemetry & Badge
1. During an active call, click the **Network Quality Badge** (e.g. "Excellent 45ms" in the top bar).
2. The telemetry popup displays:
   - **Route Type:** Shows `TURN Relay (relay)` when relayed, or `P2P Direct (srflx/host)` when direct.
   - **Latency (RTT):** Real-time round-trip latency in milliseconds.
   - **Packet Loss:** Real-time packet loss percentage.
   - **Bitrate:** Real-time uplink and downlink throughput in kbps.
   - **Bytes Sent & Received:** Confirms actual audio/video media transmission.

### C. Console Diagnostics
In development mode (`NODE_ENV=development`), the browser console logs safe telemetry:
```
[WebRTC ICE] Gathered candidate: type=relay, protocol=udp
[WebRTC Telemetry] Route: TURN Relay, LocalType: relay, RemoteType: relay, RTT: 62ms, Loss: 0%, In: 450kbps, Out: 480kbps
```

---

## 5. Credential Rotation & Quota Management

### Rotating Metered Credentials
1. Generate new credentials in your **Metered Dashboard**.
2. Update the environment variable (`METERED_ICE_SERVERS` or `METERED_CREDENTIAL`) in your backend deployment platform.
3. Redeploy or restart the backend server.
4. Clients will automatically receive the updated credentials on their next call.
5. If a TURN authentication error (HTTP 401 or 403) occurs during a live call, the client automatically invalidates its cache and triggers an ICE restart with fresh credentials.

### Monitoring Quota Usage
1. Open [dashboard.metered.ca](https://dashboard.metered.ca).
2. View **Bandwidth Usage** and active sessions in the overview tab.
3. Metered free tier includes 500 MB/month of TURN data relay (unlimited STUN).
4. Direct P2P calls (using STUN) do not consume TURN bandwidth; only calls requiring NAT relay consume bandwidth.

