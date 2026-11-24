import 'dotenv/config'
import { UserRole } from '../src/generated/prisma/client.js'
import { hashPassword } from '../src/lib/auth.js'
import { prisma } from '../src/lib/prisma.js'

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME?.trim() || 'Administradora'
  if (!email || !password) throw new Error('Configura ADMIN_EMAIL y ADMIN_PASSWORD en tu archivo .env antes de ejecutar este comando.')
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.')
  const passwordHash = await hashPassword(password)
  await prisma.user.upsert({ where: { email }, update: { name, passwordHash, role: UserRole.ADMIN }, create: { email, name, passwordHash, role: UserRole.ADMIN } })
  console.log(`Administrador configurado: ${email}`)
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1) })
