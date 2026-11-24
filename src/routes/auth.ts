import type { FastifyPluginAsync } from 'fastify'
import { UserRole } from '../generated/prisma/client.js'
import { clearSessionCookie, cookieValue, createAdminSession, findAuthenticatedAdmin, hashPassword, hashSessionToken, sessionCookie, sessionCookieName, verifyPassword } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

type LoginBody = { email?: string, password?: string }

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase()
    const password = request.body?.password
    if (!email || !password) return reply.code(400).send({ message: 'Correo y contraseña son obligatorios.' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || user.role !== UserRole.ADMIN || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ message: 'Credenciales incorrectas.' })
    }
    const { token, expiresAt } = await createAdminSession(user.id)
    reply.header('Set-Cookie', sessionCookie(token, expiresAt))
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = cookieValue(request, sessionCookieName)
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
    reply.header('Set-Cookie', clearSessionCookie())
    return { ok: true }
  })

  app.get('/auth/me', async (request, reply) => {
    const authenticated = await findAuthenticatedAdmin(request)
    if (!authenticated) return reply.code(401).send({ message: 'Sesión no válida.' })
    const { user } = authenticated
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  })
}
