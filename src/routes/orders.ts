import type { FastifyPluginAsync } from 'fastify'
import { InventoryMovementType, OrderStatus } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'

type OrderBody = { customer: { name: string, phone: string, email?: string }, city: string, address: string, notes?: string, items: Array<{ variantId: string, quantity: number }> }

const clean = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} es obligatorio.`)
  return value.trim()
}

type OrderWithDetails = {
  id: string, code: string, status: OrderStatus, subtotal: unknown, shippingCost: unknown, total: unknown, city: string, address: string, notes: string | null, createdAt: Date,
  customer: { id: string, name: string, phone: string, email: string | null },
  items: Array<{ id: string, variantId: string, productName: string, sku: string, colorName: string, lengthInches: number, unitPrice: unknown, quantity: number }>
}

const serializeOrder = (order: OrderWithDetails) => ({
  id: order.id, code: order.code, status: order.status, subtotal: Number(order.subtotal), shippingCost: Number(order.shippingCost), total: Number(order.total), city: order.city, address: order.address, notes: order.notes, createdAt: order.createdAt,
  customer: order.customer,
  items: order.items.map(item => ({ id: item.id, variantId: item.variantId, productName: item.productName, sku: item.sku, colorName: item.colorName, lengthInches: item.lengthInches, unitPrice: Number(item.unitPrice), quantity: item.quantity }))
})

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: OrderBody }>('/orders', async (request, reply) => {
    try {
      const body = request.body
      if (!Array.isArray(body?.items) || body.items.length === 0) throw new Error('El pedido debe incluir al menos un producto.')
      const normalizedItems = body.items.map(item => ({ variantId: clean(item.variantId, 'La variante'), quantity: Number(item.quantity) }))
      if (normalizedItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error('Las cantidades deben ser enteros mayores que cero.')
      const ids = normalizedItems.map(item => item.variantId)
      if (new Set(ids).size !== ids.length) throw new Error('No repitas una variante en el pedido.')
      const variants = await prisma.productVariant.findMany({ where: { id: { in: ids }, product: { status: 'ACTIVE' } }, include: { product: true, color: true, length: true } })
      if (variants.length !== ids.length) throw new Error('Uno de los productos ya no está disponible.')
      const byId = new Map(variants.map(variant => [variant.id, variant]))
      const subtotal = normalizedItems.reduce((sum, item) => sum + Number(byId.get(item.variantId)!.price) * item.quantity, 0)
      const phone = clean(body.customer?.phone, 'El teléfono').replace(/\s/g, '')
      const customer = await prisma.customer.upsert({ where: { phone }, update: { name: clean(body.customer?.name, 'El nombre'), email: body.customer?.email?.trim() || null }, create: { phone, name: clean(body.customer?.name, 'El nombre'), email: body.customer?.email?.trim() || null } })
      const code = `JC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`
      const order = await prisma.order.create({
        data: {
          code, customerId: customer.id, subtotal, total: subtotal, city: clean(body.city, 'La ciudad'), address: clean(body.address, 'La dirección'), notes: body.notes?.trim() || null,
          items: { create: normalizedItems.map(item => { const variant = byId.get(item.variantId)!; return { variantId: variant.id, productName: variant.product.name, sku: variant.sku, colorName: variant.color.name, lengthInches: variant.length.inches, unitPrice: variant.price, quantity: item.quantity } }) }
        },
        include: { customer: true, items: true }
      })
      return reply.code(201).send(serializeOrder(order))
    } catch (error) { return reply.code(400).send({ message: error instanceof Error ? error.message : 'No se pudo crear el pedido.' }) }
  })

  app.get('/admin/orders', async () => {
    const orders = await prisma.order.findMany({ include: { customer: true, items: true }, orderBy: { createdAt: 'desc' } })
    return orders.map(serializeOrder)
  })

  app.post<{ Params: { id: string } }>('/admin/orders/:id/confirm', async (request, reply) => {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const found = await tx.order.findUnique({ where: { id: request.params.id }, include: { customer: true, items: { include: { variant: true } } } })
        if (!found) throw new Error('Pedido no encontrado.')
        if (found.status !== OrderStatus.PENDING) throw new Error('Este pedido ya fue procesado.')
        for (const item of found.items) if (item.variant.stock < item.quantity) throw new Error(`Stock insuficiente para ${item.productName} (${item.colorName}, ${item.lengthInches} pulgadas).`)
        for (const item of found.items) {
          const previousStock = item.variant.stock
          const resultingStock = previousStock - item.quantity
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: resultingStock } })
          await tx.inventoryMovement.create({ data: { variantId: item.variantId, type: InventoryMovementType.SALE, quantity: -item.quantity, previousStock, resultingStock, note: `Pedido ${found.code}` } })
        }
        return tx.order.update({ where: { id: found.id }, data: { status: OrderStatus.CONFIRMED }, include: { customer: true, items: true } })
      })
      return serializeOrder(order)
    } catch (error) { return reply.code(400).send({ message: error instanceof Error ? error.message : 'No se pudo confirmar el pedido.' }) }
  })
}
