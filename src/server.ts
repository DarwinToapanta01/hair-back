import 'dotenv/config'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { prisma } from './lib/prisma.js'
import { findAuthenticatedAdmin } from './lib/auth.js'
import { authRoutes } from './routes/auth.js'
import { orderRoutes } from './routes/orders.js'
import { catalogRoutes } from './routes/catalog.js'
import { adminRoutes } from './routes/admin.js'

const app = Fastify({ logger: true })
await app.register(cors, {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002'
  ],
  credentials: true
})

app.get('/health', async () => ({ status: 'ok', service: 'johanna-chavez-api' }))
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/api/admin')) return
  const authenticated = await findAuthenticatedAdmin(request)
  if (!authenticated) {
    return reply.code(401).send({ message: 'No autorizado.' })
  }
})
await app.register(authRoutes, { prefix: '/api' })
await app.register(catalogRoutes, { prefix: '/api' })
await app.register(orderRoutes, { prefix: '/api' })
await app.register(adminRoutes, { prefix: '/api' })
app.addHook('onClose', async () => prisma.$disconnect())

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '0.0.0.0'
await app.listen({ port, host })
