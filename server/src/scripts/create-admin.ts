import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { connectDb, disconnectDb } from '../config/db.js'
import { AdminUserModel } from '../models/AdminUser.model.js'

/**
 * The only code path that creates an admin account — deliberately no
 * self-service signup. Usage: npm run admin:create -- <email>
 * Prints the generated password once; it is never stored or logged again.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run admin:create -- <email>')
    process.exit(1)
  }

  await connectDb()

  const existing = await AdminUserModel.findOne({ email })
  if (existing) {
    console.error(`An admin with email ${email} already exists.`)
    await disconnectDb()
    process.exit(1)
  }

  const password = crypto.randomBytes(18).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)
  await AdminUserModel.create({ email, passwordHash })

  console.log('Admin account created.')
  console.log('Email:   ', email)
  console.log('Password:', password)
  console.log('This password is shown once — store it securely. (No self-service password change exists yet.)')

  await disconnectDb()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
