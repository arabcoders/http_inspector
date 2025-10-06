import { cleanupExpiredData } from '../lib/cleanup'

/**
 * Nitro plugin that schedules periodic database cleanup
 * 
 * Configuration:
 * - CLEANUP_INTERVAL_HOURS: How often to run cleanup (default: 1 hour)
 * - CLEANUP_ENABLED: Set to 'false' to disable scheduled cleanup (default: true)
 * - CLEANUP_ON_STARTUP: Set to 'false' to skip cleanup on startup (default: true)
 * 
 * Note: This plugin runs after migrations by using a delay
 */
export default defineNitroPlugin(async () => {
  const cleanupEnabled = process.env.CLEANUP_ENABLED !== 'false'
  const cleanupOnStartup = process.env.CLEANUP_ON_STARTUP !== 'false'
  const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '1', 10)
  
  if (!cleanupEnabled) {
    console.log('[Cleanup] Scheduled cleanup is disabled')
    return
  }
  
  const intervalMs = intervalHours * 60 * 60 * 1000
  
  console.log(`[Cleanup] Scheduled cleanup enabled - running every ${intervalHours} hour(s)`)
  
  // Run cleanup immediately on startup if enabled
  if (cleanupOnStartup) {
    // Delay slightly to ensure migrations are fully complete
    setTimeout(() => {
      console.log('[Cleanup] Running initial cleanup...')
      cleanupExpiredData()
        .then((result) => {
          console.log('[Cleanup] Initial cleanup completed:', result)
        })
        .catch((error) => {
          console.error('[Cleanup] Initial cleanup failed:', error)
        })
    }, 1000) // 1 second delay
  }
  
  // Schedule periodic cleanup
  const timer = setInterval(() => {
    console.log('[Cleanup] Running scheduled cleanup...')
    cleanupExpiredData()
      .then((result) => {
        console.log('[Cleanup] Scheduled cleanup completed:', result)
      })
      .catch((error) => {
        console.error('[Cleanup] Scheduled cleanup failed:', error)
      })
  }, intervalMs)
  
  // Cleanup the interval when the server shuts down
  if (typeof process !== 'undefined' && process.on) {
    process.on('exit', () => {
      clearInterval(timer)
    })
  }
})
