# Connectly: Production COTURN & STUN/TURN Setup Guide

This guide details how to install, configure, secure, and operate a self-hosted **COTURN** server for Connectly's audio and video WebRTC calling infrastructure.

---

## 1. Overview & Architecture

WebRTC uses **STUN** (Session Traversal Utilities for NAT) to establish direct peer-to-peer (P2P) connections. However, when users are located behind **symmetric NAT**, corporate firewalls, cellular CGNAT, or restrictive networks, direct P2P connections fail.

In those cases, media packets must be relayed through a **TURN** (Traversal Using Relays around NAT) server.

Connectly implements **RFC 5766 / COTURN ephemeral short-lived HMAC-SHA1 credentials**:
1. The client never holds permanent TURN passwords or shared secrets (`NEXT_PUBLIC_*`).
2. When a call starts or arrives, the authenticated client requests ephemeral ICE credentials from `GET /api/v1/calls/ice-servers`.
3. The Connectly backend generates a short-lived token:
   - `username = <unix_timestamp_expiry>:<user_id>`
   - `credential = HMAC-SHA1(username, TURN_SECRET)`
4. The COTURN server validates the HMAC-SHA1 signature using the identical `static-auth-secret`.
5. The token automatically expires after the configured TTL (default 24 hours), preventing relay theft or abuse.

---

## 2. Server Requirements & Firewall Ports

### Server Specification
- **OS**: Ubuntu 22.04 LTS or Debian 12
- **Specs**: 1 vCPU, 1 GB RAM (scales to ~500 concurrent relayed streams)
- **Public IP**: Static public IPv4 address (and optionally IPv6)

### Firewall / Security Group Configuration
Open the following ports on your cloud provider (AWS EC2, DigitalOcean, Hetzner, Linode, etc.):

| Port Range | Protocol | Purpose |
|------------|----------|---------|
| `3478` | UDP | Standard TURN / STUN listener |
| `3478` | TCP | Fallback for UDP-blocked networks |
| `5349` | TCP | Secure TURN over TLS (TURNS) |
| `49152:65535` | UDP | Dynamic media relay port range |

Ubuntu UFW commands:
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
sudo ufw reload
```

---

## 3. Installation

Install COTURN from official repositories:
```bash
sudo apt update
sudo apt install -y coturn
```

Enable the COTURN daemon by editing `/etc/default/coturn`:
```bash
TURNSERVER_ENABLED=1
```

---

## 4. SSL / TLS Certificate (for TURNS on port 5349)

Use Certbot to obtain a free Let's Encrypt certificate for your TURN domain (e.g., `turn.connectly.app`):
```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d turn.connectly.app
```

Ensure COTURN has permission to read the certificates:
```bash
sudo chown -R turnserver:turnserver /etc/letsencrypt/archive/turn.connectly.app
sudo chown -R turnserver:turnserver /etc/letsencrypt/live/turn.connectly.app
```

---

## 5. COTURN Configuration (`/etc/turnserver.conf`)

Generate a secure random secret key:
```bash
openssl rand -hex 32
```

Save this secret as `TURN_SECRET` in your Connectly backend environment.

Edit `/etc/turnserver.conf`:
```conf
# Public IP and listener ports
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

# External Public IP of your server (MANDATORY for cloud NAT)
external-ip=YOUR_SERVER_PUBLIC_IP

# Realm matching your domain
realm=connectly.app
server-name=turn.connectly.app

# Ephemeral HMAC-SHA1 authentication mechanism (RFC 5766)
use-auth-secret
static-auth-secret=YOUR_GENERATED_SECRET_KEY_HERE

# Media relay dynamic port range
min-port=49152
max-port=65535

# TLS Certificates for TURNS
cert=/etc/letsencrypt/live/turn.connectly.app/fullchain.pem
pkey=/etc/letsencrypt/live/turn.connectly.app/privkey.pem

# Security & Anti-Abuse
no-cli
no-loopback-peers
no-multicast-peers
fingerprint
lt-cred-mech
stale-nonce=600

# Logging
log-file=/var/log/turnserver/turn.log
verbose
```

Restart and verify the service:
```bash
sudo systemctl restart coturn
sudo systemctl status coturn
```

---

## 6. Connectly Backend Environment Setup

Add the following variables to your Connectly backend `.env` file:

```env
# WebRTC STUN & TURN Configuration
TURN_SERVER_URL=turn:turn.connectly.app:3478
TURNS_SERVER_URL=turns:turn.connectly.app:5349
TURN_SECRET=YOUR_GENERATED_SECRET_KEY_HERE
TURN_CREDENTIAL_TTL=86400
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun.services.mozilla.com
```

---

## 7. Verification & Testing

### 1. Test Endpoint
Authenticate and send a `GET` request:
```bash
curl -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
     https://api.connectly.app/api/v1/calls/ice-servers
```

Expected response:
```json
{
  "success": true,
  "data": {
    "iceServers": [
      {
        "urls": [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun.services.mozilla.com"
        ]
      },
      {
        "urls": [
          "turn:turn.connectly.app:3478?transport=udp",
          "turn:turn.connectly.app:3478?transport=tcp",
          "turns:turn.connectly.app:5349?transport=tcp"
        ],
        "username": "1731234567:507f1f77bcf86cd799439001",
        "credential": "base64_hmac_sha1_credential"
      }
    ],
    "ttl": 86400,
    "expiresAt": "2026-11-10T23:50:00.000Z"
  }
}
```

### 2. Test in WebRTC Trickle ICE Tool
Open [WebRTC Trickle ICE Test](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/):
1. Enter the `turn:...` URL.
2. Enter the generated `username` and `credential`.
3. Click "Gather candidates".
4. Confirm that candidate type **`relay`** appears with status "Done".

