import mongoose from 'mongoose'
import { env } from './env.js'

mongoose.set('strictQuery', true)

export async function connectDb(): Promise<typeof mongoose> {
  mongoose.connection.on('error', (error) => {
    console.error('[db] connection error:', error)
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected')
  })

  return mongoose.connect(env.MONGODB_URI)
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}

/** True once Mongoose has an active connection (readyState 1). */
export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1
}
