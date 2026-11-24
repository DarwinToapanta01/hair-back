import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyRequest } from 'fastify'
import { UserRole } from '../generated/prisma/client.js'
import { prisma } from './prisma.js'

const scrypt = promisify(scryptCallback)
export const sessionCookieName = 'jc_admin_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const derived = await scrypt(password, salt, 64) as Buffer
  const saved = Buffer.from(hash, 'hex')
  return saved.length === derived.length && timingSafeEqual(saved, derived)
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function cookieValue(request: FastifyRequest, name: string) {
  const cookieHeader = request.headers.cookie || ''
  const value = cookieHeader.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null
}

export function sessionCookie(token: string, expiresAt: Date) {
  const isSecure = process.env.NODE_ENV === 'production'
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${isSecure ? '; Secure' : ''}`
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export async function findAuthenticatedAdmin(request: FastifyRequest) {
  const token = cookieValue(request, sessionCookieName)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  })
  if (!session || session.expiresAt <= new Date()) return null
  if (session.user.role !== UserRole.ADMIN) return null
  return { session, user: session.user }
}

export async function createAdminSession(userId: string) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + sessionDurationMs)
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } })
  return { token, expiresAt }
}
