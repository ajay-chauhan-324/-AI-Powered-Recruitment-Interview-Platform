import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDb } from './config/db.js'

async function main() {
  await connectDb()
  console.log('[db] connected')

  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`)
  })
}

main().catch((error) => {
  console.error('[server] failed to start:', error)
  process.exit(1)
})
