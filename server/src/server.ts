import http from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDb, disconnectDb } from './config/db.js'
import { initSocketServer } from './sockets/socketServer.js'
import { ensureFixedScheduleConfig } from './services/scheduleConfig.service.js'
import { ScheduleConfigModel } from './models/ScheduleConfig.model.js'
import { UserModel } from './models/User.model.js'
import { InterviewModel } from './models/Interview.model.js'
import { ApplicationModel } from './models/Application.model.js'
import { JobModel } from './models/Job.model.js'
import { startMeetingReminderScheduler } from './services/meetingReminder.service.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main() {
  await connectDb()
  console.log('[db] connected')

  // Mongoose's normal autoIndex only ever ADDS indexes missing from the schema — it never
  // detects or repairs an already-existing index whose shape/options no longer match the
  // current schema (e.g. ScheduleConfig's `singleton`/`recruiterId` moving to sparse-unique,
  // Interview.candidateEmail becoming a compound index, User dropping its unused accountType
  // index). A database created before any of those changes would otherwise silently keep the
  // stale index shape, which can range from "just missing the perf win" to actual spurious
  // duplicate-key errors (as happened with ScheduleConfig). syncIndexes() actually drops and
  // rebuilds any index that doesn't match the current schema, and is a no-op once a database
  // is already correct — safe to run on every boot given these collections' scale.
  await Promise.all([
    ScheduleConfigModel.syncIndexes(),
    UserModel.syncIndexes(),
    InterviewModel.syncIndexes(),
    ApplicationModel.syncIndexes(),
    JobModel.syncIndexes(),
  ])
  await ensureFixedScheduleConfig()

  const app = createApp()
  const httpServer = http.createServer(app)
  const io = initSocketServer(httpServer)

  httpServer.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`)
  })

  const reminderInterval = startMeetingReminderScheduler()

  // Without this, a deploy/restart (SIGTERM) kills in-flight requests and open socket
  // connections mid-response instead of draining them first.
  let shuttingDown = false
  async function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[server] received ${signal}, shutting down gracefully`)

    const forceExitTimer = setTimeout(() => {
      console.error(`[server] graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`)
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExitTimer.unref()

    try {
      clearInterval(reminderInterval)
      // io.close() disconnects every socket, then closes the underlying httpServer itself
      // (it's the same instance passed into initSocketServer) — no separate call needed.
      await io.close()
      await disconnectDb()
      console.log('[server] shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error('[server] error during shutdown:', error)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('[server] failed to start:', error)
  process.exit(1)
})
