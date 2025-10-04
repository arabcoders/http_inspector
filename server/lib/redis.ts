import Redis from 'ioredis'

let redisClient: Redis | null = null

export const getRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient
  }

  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy: times => Math.min(times * 50, 2000),
    lazyConnect: true,
  })

  redisClient.on('error', e => console.error('Redis Client Error:', e))
  redisClient.on('connect', () => console.log('Redis Client Connected'))
  redisClient.connect().catch(e => console.error('Failed to connect to Redis:', e))

  return redisClient
}

// Default TTL values (in seconds)
export const TTL = {
  SESSION: 30 * 24 * 60 * 60, // 30 days
  TOKEN: 30 * 24 * 60 * 60,   // 30 days  
  REQUEST: 7 * 24 * 60 * 60,  //  7 days
  SSE_CONNECTION: 60 * 60,    //  1 hour
} as const

// Key prefixes for different data types
export const KEYS = {
  session: (sessionId: string) => `session:${sessionId}`,
  friendlyIdLookup: (friendlyId: string) => `friendly:${friendlyId}`,  // Friendly ID -> sessionId
  userTokens: (sessionId: string) => `user:${sessionId}:tokens`,
  token: (sessionId: string, tokenId: string) => `token:${sessionId}:${tokenId}`,
  tokenLookup: (tokenId: string) => `token:lookup:${tokenId}`,  // Reverse lookup: token -> session
  tokenRequests: (sessionId: string, tokenId: string) => `token:${sessionId}:${tokenId}:requests`,
  request: (sessionId: string, tokenId: string, requestId: number) => `request:${sessionId}:${tokenId}:${requestId}`,
  requestBody: (sessionId: string, tokenId: string, requestId: number) => `request:${sessionId}:${tokenId}:${requestId}:body`,
  requestCounter: (sessionId: string, tokenId: string) => `counter:${sessionId}:${tokenId}:requests`,
} as const

export const closeRedis = async () => {
  if (!redisClient) {
    return
  }

  await redisClient.quit()
  redisClient = null
  console.log('Redis Client Disconnected')
}
