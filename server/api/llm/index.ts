import { defineEventHandler } from 'h3'

/**
 * LLM API Overview
 * 
 * GET /api/llm
 * 
 * Provides documentation and overview of the LLM API endpoints.
 * This API is designed for programmatic access by LLMs and automation tools.
 */
export default defineEventHandler(() => {
  return {
    name: 'HTTP Inspector LLM API',
    version: '1.0.0',
    description: 'API endpoints designed for programmatic access by LLMs and automation tools',
    endpoints: [
      {
        method: 'POST',
        path: '/api/llm/token',
        description: 'Create a new payload token',
        response: {
          id: 'UUID of the token',
          friendlyId: 'Short 8-character ID',
          sessionId: 'Static LLM session ID',
          createdAt: 'ISO timestamp',
          payloadUrl: 'URL to send HTTP requests to',
          responseEnabled: 'Boolean',
          responseStatus: 'HTTP status code for responses',
          responseHeaders: 'JSON string or null',
          responseBody: 'String or null',
        },
      },
      {
        method: 'GET',
        path: '/api/llm/token/:token',
        description: 'Get token details and all captured requests',
        parameters: {
          token: 'Token ID (UUID) or friendlyId (8-char)',
          secret: 'Required query param when accessing user tokens (e.g., ?secret=UUID)',
        },
        response: {
          token: {
            id: 'Token UUID',
            friendlyId: 'Short ID',
            createdAt: 'ISO timestamp',
            payloadUrl: 'URL for webhook ingestion',
          },
          requests: [
            {
              id: 'Request UUID',
              method: 'HTTP method',
              url: 'Full URL',
              headers: 'Headers object',
              contentType: 'Content-Type header',
              contentLength: 'Body size in bytes',
              isBinary: 'Boolean',
              body: 'Request body as string or null',
              clientIp: 'Client IP address',
              remoteIp: 'Remote IP address',
              createdAt: 'ISO timestamp',
            },
          ],
          total: 'Total number of requests',
        },
        notes: 'LLM tokens: no secret needed. User tokens: require ?secret=UUID for read-only access',
      },
      {
        method: 'GET',
        path: '/api/llm/token/:token/latest',
        description: 'Get the most recent request for a token',
        parameters: {
          token: 'Token ID (UUID) or friendlyId (8-char)',
          secret: 'Required query param when accessing user tokens (e.g., ?secret=UUID)',
        },
        response: {
          id: 'Request UUID',
          method: 'HTTP method',
          url: 'Full URL',
          headers: 'Headers object',
          contentType: 'Content-Type header',
          contentLength: 'Body size in bytes',
          isBinary: 'Boolean',
          body: 'Request body as string or null',
          clientIp: 'Client IP address',
          remoteIp: 'Remote IP address',
          createdAt: 'ISO timestamp',
        },
        notes: 'Returns 404 if no requests exist for the token. LLM tokens: no secret needed. User tokens: require ?secret=UUID',
      },
      {
        method: 'PATCH',
        path: '/api/llm/token/:token',
        description: 'Update token response settings',
        parameters: {
          token: 'Token ID (UUID) or friendlyId (8-char)',
        },
        body: {
          responseEnabled: 'Boolean - enable/disable custom responses',
          responseStatus: 'Number - HTTP status code (default: 200)',
          responseHeaders: 'String - JSON string of headers or null',
          responseBody: 'String - response body content or null',
        },
        response: {
          ok: true,
        },
        notes: 'Configure what the webhook endpoint returns when it receives requests',
      },
      {
        method: 'DELETE',
        path: '/api/llm/token/:token',
        description: 'Delete a token and all its associated requests',
        parameters: {
          token: 'Token ID (UUID) or friendlyId (8-char)',
        },
        response: {
          ok: true,
        },
      },
    ],
    notes: [
      'All tokens created via this API are associated with a static LLM session',
      'Tokens can be identified by either their full UUID or 8-character friendlyId',
      'LLM tokens: Full access without authentication',
      'User tokens: Read-only access via GET with ?secret=UUID parameter (PATCH/DELETE not allowed)',
      'Request bodies are included in responses for text content, binary data is marked as [Binary data not included]',
      'This API must be enabled via the ENABLE_LLM_ENDPOINT=true environment variable',
    ],
  }
})