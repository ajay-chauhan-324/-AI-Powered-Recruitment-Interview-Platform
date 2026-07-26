import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'

export interface NotificationMessage {
  to: string
  subject: string
  body: string
}

export interface NotificationTransport {
  send(message: NotificationMessage): Promise<void>
}

/**
 * The credential-free default (CLAUDE.md §23 "do not over-engineer... keep future queue
 * integration possible"). No SMTP provider is configured for this project — rather than
 * block Phase 10 on a credential the way Phase 7 (AI) is blocked on an API key, real email
 * content is logged in full so its correctness is still verifiable without one.
 */
export class ConsoleNotificationTransport implements NotificationTransport {
  async send(message: NotificationMessage): Promise<void> {
    console.log(`[notification] to=${message.to} subject="${message.subject}"`)
    console.log(message.body)
  }
}

/** Real delivery, used automatically once SMTP_HOST etc. are configured — untested against
 * a live server (no credentials available), but it compiles against the same interface the
 * console transport does, so switching is a config change, not a code change. */
export class SmtpNotificationTransport implements NotificationTransport {
  private transporter: ReturnType<typeof nodemailer.createTransport>
  private from: string

  constructor() {
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      throw new Error('SmtpNotificationTransport requires SMTP_HOST and SMTP_PORT.')
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
    this.from = env.SMTP_FROM ?? env.SMTP_USER ?? 'no-reply@example.com'
  }

  async send(message: NotificationMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    })
  }
}

let cachedTransport: NotificationTransport | null = null

export function getNotificationTransport(): NotificationTransport {
  if (!cachedTransport) {
    cachedTransport = env.SMTP_HOST ? new SmtpNotificationTransport() : new ConsoleNotificationTransport()
  }
  return cachedTransport
}
