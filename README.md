# HTTP Inspector

HTTP Inspector is a self-hosted debugging console for capturing, inspecting, and viewing requests traffic in real time. It pairs an intuitive client UI with a full HTTP API so teams can test integrations with predictable, isolated endpoints.

## Capabilities
- Create disposable endpoints with session-scoped isolation
- Capture every HTTP method with full headers, bodies, metadata, and binary payloads
- Configure per-endpoint default responses: status codes, headers, and body templates
- Stream live activity through Server-Sent Events for dashboards or automation
- Restore previous sessions with friendly IDs for persistent debugging workflows
- Protect deployments with optional username/password authentication and signed cookies
- Expire sessions, tokens, and stored requests automatically using configurable TTLs
- Export or download raw requests for view/use in other tools.

## Run with Containers

### Docker/Podman `run`
Both Docker and Podman work with the same flags; substitute `podman` for `docker` if you prefer Podman. The example below starts the inspector with a persistent volume for the SQLite database and publishes the UI on port 3001.

```bash
docker run -d \
  --name http_inspector \
  -p 3001:3000 \
  -v http_inspector_data:/config \
  ghcr.io/arabcoders/http_inspector:latest
```

### Compose

```yaml
services:
  http_inspector:
    image: ghcr.io/arabcoders/http_inspector:latest
    container_name: http_inspector
    restart: unless-stopped
    ports:
      - "3001:3000"
    volumes:
      - http_inspector_data:/config
    environment:
      - TRUST_PROXY_CLIENT_IP=false

volumes:
  http_inspector_data:
```

Use the provided `compose.yaml` to launch the service from the repository root.

```bash
docker compose up -d
# podman compose up -d
```

The UI is available at http://localhost:3001 and the container persists until you run `docker compose down` (or `podman compose down`).

> ![NOTE]
> The default container run using the root user for simplicity. For production deployments, consider running as a non-root user by adding `user: "1000:1000"` (or similar) to the Compose service definition or Docker run command. 

## Environment Variables

| Variable                    | Required | Default                   | Description                                                    |
| --------------------------- | -------- | ------------------------- | -------------------------------------------------------------- |
| **STORAGE_PATH**            | No       | **/config** or **./var)** | Path for storing db and request bodies                         |
| **SESSION_TTL_DAYS**        | No       | **30**                    | Session lifetime in days before automatic cleanup              |
| **TOKEN_TTL_DAYS**          | No       | **30**                    | Token lifetime in days before automatic cleanup                |
| **REQUEST_TTL_DAYS**        | No       | **7**                     | Request history lifetime in days                               |
| **CLEANUP_ENABLED**         | No       | **true**                  | Enable automatic cleanup of expired data                       |
| **CLEANUP_ON_STARTUP**      | No       | **true**                  | Run cleanup when server starts (in addition to scheduled runs) |
| **CLEANUP_INTERVAL_HOURS**  | No       | **1**                     | How often to run cleanup (in hours)                            |
| **TRUST_PROXY_CLIENT_IP**   | No       | **false**                 | Honor **X-Forwarded-For** when running behind a trusted proxy  |
| **AUTH_USERNAME**           | No       | **-**                     | Username required for login when authentication is enabled     |
| **AUTH_PASSWORD**           | No       | **-**                     | Password required for login when authentication is enabled     |
| **SESSION_RESTORE_ENABLED** | No       | **true**                  | Enable restoring previous sessions by friendly ID              |
| **RAW_FULL_URL**            | No       | **false**                 | Include full URL in raw request output                         |

### Automatic Migrations

Database schema migrations run automatically on server startup. No manual intervention is required.

### Automatic Cleanup

Expired data is automatically cleaned up based on TTL settings:
- **Sessions:** Deleted after `SESSION_TTL_DAYS` of inactivity
- **Tokens:** Deleted after `TOKEN_TTL_DAYS` since creation
- **Requests:** Deleted after `REQUEST_TTL_DAYS` since creation

Cleanup runs:
- On startup (if `CLEANUP_ON_STARTUP=true`)
- Every `CLEANUP_INTERVAL_HOURS` hours (default: 1 hour)

Disable automatic cleanup by setting `CLEANUP_ENABLED=false`.

### Manual Cleanup

Run cleanup manually:

```bash
# Local development
pnpm db:cleanup

# In container
docker exec http_inspector node /app/server/lib/cleanup.ts
```

### Database Management

```bash
# Generate a new migration (after schema changes)
pnpm db:generate

# Run migrations manually
pnpm db:migrate

# Open Drizzle Studio to inspect the database
pnpm db:studio
```

### Backup & Restore

SQLite makes backup simple - just copy the database file:

```bash
# Backup
docker cp http_inspector:/config/inspector.sqlite ./backup-$(date +%Y%m%d).sqlite

# Restore
docker cp ./backup-20250106.sqlite http_inspector:/config/inspector.sqlite
docker restart http_inspector
```

## API Reference

Unless noted, endpoints require an authenticated session when authentication is enabled. Dates in examples use ISO 8601 format.

### Sessions

#### GET /api/session
Returns the active session.

```json
{
  "id": "random-string",
  "friendlyId": "famous-amethyst-panda",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "lastAccessedAt": "2025-01-15T10:30:00.000Z"
}
```

#### POST /api/session/restore
Restore a prior session by friendly or technical ID.

```json
{
  "sessionId": "famous-amethyst-panda"
}
```

**Response:** `{ "ok": true }`

### Tokens

#### GET /api/token
List tokens for the current session.

```json
[
  {
    "id": "abc123",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "requestCount": 5,
    "defaultStatusCode": 200,
    "defaultHeaders": {},
    "defaultBody": ""
  }
]
```

#### POST /api/token
Create a token; optional `customId` makes the endpoint URL predictable.

```json
{
  "customId": "optional-custom-id"
}
```

**Response:**
```json
{
  "id": "abc123",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "defaultStatusCode": 200
}
```

#### GET /api/token/{tokenId}
Retrieve token configuration.

```json
{
  "id": "abc123",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "defaultStatusCode": 200,
  "defaultHeaders": {
    "Content-Type": "application/json"
  },
  "defaultBody": "{\"status\": \"ok\"}"
}
```

#### PATCH /api/token/{tokenId}
Update default response attributes.

```json
{
  "defaultStatusCode": 204,
  "defaultHeaders": {
    "X-Request-Signature": "abc123"
  },
  "defaultBody": "{\"processed\": true}"
}
```

**Response:** `{ "ok": true }`

#### DELETE /api/token/{tokenId}
Delete a token and its stored requests.

**Response:** `{ "ok": true }`

### Requests

#### GET /api/token/{tokenId}/requests
List requests captured for a token.

```json
[
  {
    "id": 1,
    "method": "POST",
    "path": "/api/payload/abc123",
    "query": "?status=success",
    "headers": {
      "content-type": "application/json",
      "user-agent": "curl/7.79.1"
    },
    "ip": "192.168.1.100",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "bodySize": 45,
    "isBinary": false
  }
]
```

#### GET /api/token/{tokenId}/requests/{requestId}
Fetch metadata for a specific request.

```json
{
  "id": 1,
  "method": "POST",
  "path": "/api/payload/abc123",
  "query": "?status=success",
  "headers": {
    "content-type": "application/json"
  },
  "ip": "192.168.1.100",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "bodySize": 45,
  "isBinary": false
}
```

#### GET /api/token/{tokenId}/requests/{requestId}/body
Return decoded request body with metadata when the payload is text-based.

```json
{
  "body": "{\"event\": \"test\"}",
  "headers": {
    "content-type": "application/json"
  },
  "isBinary": false
}
```

#### GET /api/token/{tokenId}/requests/{requestId}/raw
Return the raw HTTP request payload as a string. Binary content returns `400 Bad Request` with a JSON error payload.

#### GET /api/token/{tokenId}/requests/{requestId}/body/download
Download the original request body. Responses stream the binary payload with a `Content-Disposition` header.

#### DELETE /api/token/{tokenId}/requests/{requestId}
Delete a single stored request. **Response:** `{ "ok": true }`

#### DELETE /api/token/{tokenId}/requests
Delete all stored requests for a token. **Response:** `{ "ok": true }`

#### POST /api/token/{tokenId}/ingest
Manually ingest a raw HTTP request into the system.

**Request Body:**
```json
{
  "raw": "POST /api/webhook HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\n\r\n{\"event\":\"test\"}",
  "clientIp": "192.168.1.100",
  "remoteIp": "203.0.113.1"
}
```

- `raw` (required): The raw HTTP request in standard HTTP/1.1 format. Supports both path-only URLs (`/api/test`) and full URLs (`http://example.com/api/test`)
- `clientIp` (optional): Override the client IP address
- `remoteIp` (optional): Override the remote IP address

**Response:**
```json
{
  "ok": true,
  "request": {
    "id": 42,
    "method": "POST",
    "url": "/api/webhook",
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Example:**
```bash
# Ingest a previously exported raw request with path-only URL
curl -X POST http://localhost:3000/api/token/your-token-id/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "raw": "POST /api/data HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\n\r\n{\"name\":\"test\"}",
    "clientIp": "10.0.0.5"
  }'

# Ingest a request with full URL
curl -X POST http://localhost:3000/api/token/your-token-id/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "raw": "GET https://api.example.com/webhook?token=abc123 HTTP/1.1\r\nHost: api.example.com\r\nAuthorization: Bearer token\r\n\r\n"
  }'
```

### HTTP Capture Endpoint

#### ANY /api/payload/{tokenId}
Public endpoint used by third-party services to deliver requests. Accepts every HTTP method and captures:
- Method and URL (including query string)
- All headers
- Request body (text or binary)
- Sender IP address
- Timestamp

The response mirrors the token’s default configuration or returns `200 OK` when unset.

**Examples:**

```bash
# JSON payload
curl -X POST http://localhost:3000/api/payload/your-token-id \
  -H "Content-Type: application/json" \
  -d '{"event": "user.created", "id": "123"}'

# Custom headers
curl -X POST http://localhost:3000/api/payload/your-token-id \
  -H "Content-Type: application/json" \
  -H "X-Request-Signature: abc123" \
  -H "X-Event-Type: user.created" \
  -d '{"user_id": 123, "email": "user@example.com"}'

# Binary upload
curl -X POST http://localhost:3000/api/payload/your-token-id \
  -H "Content-Type: image/png" \
  --data-binary @image.png

# GET with query parameters
curl "http://localhost:3000/api/payload/your-token-id?status=success&id=123"
```

### Real-Time Streams

#### GET /api/events
Subscribe to session-wide Server-Sent Events. Example client:

```javascript
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

Events include:
- `token:created`
- `token:updated`
- `token:deleted`
- `request:new`

Event payload example:

```json
{
  "type": "request:new",
  "token": "abc123",
  "request": {
    "id": 1,
    "method": "POST",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

#### GET /api/token/{tokenId}/events
Stream events for a single token. Delivers the same event types as `/api/events`, filtered by token ID.

### Authentication

#### POST /api/auth/login
Authenticate a user when auth is enabled. Sets the `auth_token` HTTP-only cookie.

```json
{
  "username": "admin",
  "password": "secret"
}
```

**Response:** `{ "ok": true, "message": "Login successful" }`

#### POST /api/auth/logout
Clear the authentication cookie. **Response:** `{ "ok": true, "message": "Logout successful" }`

#### GET /api/auth/status
Report authentication status.

```json
{
  "authenticated": true,
  "required": true
}
```

### Standard Responses

Common status codes:
- `200 OK` — Successful request
- `201 Created` — Resource created
- `400 Bad Request` — Invalid request parameters or body
- `401 Unauthorized` — Authentication required or failed
- `404 Not Found` — Resource not found
- `405 Method Not Allowed` — Unsupported HTTP method
- `500 Internal Server Error` — Unhandled error

Error responses follow this shape:

```json
{
  "statusCode": 404,
  "message": "Token not found"
}
```
