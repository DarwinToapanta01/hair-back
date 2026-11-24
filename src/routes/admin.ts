import type { FastifyPluginAsync } from 'fastify'
import { InventoryMovementType, ProductKind, ProductStatus } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'

type ProductBody = {
  kind: 'EXTENSION' | 'WIG'
  name: string
  slug: string
  description?: string
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  featured?: boolean
  categoryId?: string | null
  textureId?: string | null
}

type VariantBody = { colorId: string, lengthId: string, sku: string, price: number, stock?: number }
type ImageBody = { url: string, alt: string, position?: number, variantId?: string }
type StockBody = { quantity: number, type?: 'INITIAL' | 'ADJUSTMENT' | 'SALE' | 'RETURN', note?: string }
type CategoryBody = { name: string, slug: string, kind: 'EXTENSION' | 'WIG' }
type TextureBody = { name: string, slug: string }
type ColorBody = { name: string, code: string, hex?: string }
type LengthBody = { inches: number }

const requiredText = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} es obligatorio.`)
  return value.trim()
}

const positivePrice = (value: unknown) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error('El precio debe ser un número válido.')
  return number
}

const integer = (value: unknown, field: string) => {
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(`${field} debe ser un número entero.`)
  return number
}

const handleError = (reply: { code: (statusCode: number) => { send: (payload: { message: string }) => unknown } }, error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo procesar la solicitud.'
  return reply.code(400).send({ message })
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin/catalog-data', async () => {
    const [categories, textures, colors, lengths] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.texture.findMany({ orderBy: { name: 'asc' } }),
      prisma.color.findMany({ orderBy: { name: 'asc' } }),
      prisma.length.findMany({ orderBy: { inches: 'asc' } })
    ])
    return { categories, textures, colors, lengths }
  })

  app.post<{ Body: CategoryBody }>('/admin/categories', async (request, reply) => {
    try {
      const kind = request.body.kind === 'WIG' ? ProductKind.WIG : request.body.kind === 'EXTENSION' ? ProductKind.EXTENSION : null
      if (!kind) throw new Error('El tipo de categoría no es válido.')
      return reply.code(201).send(await prisma.category.create({ data: { name: requiredText(request.body.name, 'El nombre'), slug: requiredText(request.body.slug, 'El slug'), kind } }))
    } catch (error) { return handleError(reply, error) }
  })

  app.post<{ Body: TextureBody }>('/admin/textures', async (request, reply) => {
    try {
      return reply.code(201).send(await prisma.texture.create({ data: { name: requiredText(request.body.name, 'El nombre'), slug: requiredText(request.body.slug, 'El slug') } }))
    } catch (error) { return handleError(reply, error) }
  })

  app.post<{ Body: ColorBody }>('/admin/colors', async (request, reply) => {
    try {
      const hex = request.body.hex?.trim()
      if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error('El color hexadecimal debe tener formato #RRGGBB.')
      return reply.code(201).send(await prisma.color.create({ data: { name: requiredText(request.body.name, 'El nombre'), code: requiredText(request.body.code, 'El código'), hex: hex || null } }))
    } catch (error) { return handleError(reply, error) }
  })

  app.post<{ Body: LengthBody }>('/admin/lengths', async (request, reply) => {
    try {
      const inches = integer(request.body.inches, 'La longitud')
      if (inches < 10 || inches > 30) throw new Error('La longitud debe estar entre 10 y 30 pulgadas.')
      return reply.code(201).send(await prisma.length.create({ data: { inches } }))
    } catch (error) { return handleError(reply, error) }
  })

  app.get('/admin/products', async () => prisma.product.findMany({
    include: {
      category: true,
      texture: true,
      images: { orderBy: { position: 'asc' } },
      variants: { include: { color: true, length: true }, orderBy: { sku: 'asc' } }
    },
    orderBy: { updatedAt: 'desc' }
  }))

  app.get<{ Params: { id: string } }>('/admin/products/:id', async (request, reply) => {
    const product = await prisma.product.findUnique({
      where: { id: request.params.id },
      include: {
        category: true,
        texture: true,
        images: { orderBy: { position: 'asc' } },
        variants: { include: { color: true, length: true, images: { orderBy: { position: 'asc' } } }, orderBy: { sku: 'asc' } }
      }
    })
    return product ?? reply.code(404).send({ message: 'Producto no encontrado.' })
  })

  app.post<{ Body: ProductBody }>('/admin/products', async (request, reply) => {
    try {
      const body = request.body
      const kind = body.kind === 'WIG' ? ProductKind.WIG : body.kind === 'EXTENSION' ? ProductKind.EXTENSION : null
      if (!kind) throw new Error('El tipo de producto no es válido.')
      const product = await prisma.product.create({
        data: {
          kind,
          name: requiredText(body.name, 'El nombre'),
          slug: requiredText(body.slug, 'El slug'),
          description: body.description?.trim() || null,
          status: body.status ? ProductStatus[body.status] : ProductStatus.DRAFT,
          featured: Boolean(body.featured),
          categoryId: body.categoryId || null,
          textureId: kind === ProductKind.EXTENSION ? body.textureId || null : null
        }
      })
      return reply.code(201).send(product)
    } catch (error) { return handleError(reply, error) }
  })

  app.patch<{ Params: { id: string }, Body: Partial<ProductBody> }>('/admin/products/:id', async (request, reply) => {
    try {
      const body = request.body
      const product = await prisma.product.update({
        where: { id: request.params.id },
        data: {
          ...(body.name !== undefined ? { name: requiredText(body.name, 'El nombre') } : {}),
          ...(body.slug !== undefined ? { slug: requiredText(body.slug, 'El slug') } : {}),
          ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
          ...(body.status ? { status: ProductStatus[body.status] } : {}),
          ...(body.featured !== undefined ? { featured: Boolean(body.featured) } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId || null } : {}),
          ...(body.textureId !== undefined ? { textureId: body.textureId || null } : {})
        }
      })
      return product
    } catch (error) { return handleError(reply, error) }
  })

  app.post<{ Params: { id: string }, Body: VariantBody }>('/admin/products/:id/variants', async (request, reply) => {
    try {
      const body = request.body
      const stock = integer(body.stock ?? 0, 'El stock')
      if (stock < 0) throw new Error('El stock inicial no puede ser negativo.')
      const variant = await prisma.$transaction(async (tx) => {
        const created = await tx.productVariant.create({
          data: { productId: request.params.id, colorId: requiredText(body.colorId, 'El color'), lengthId: requiredText(body.lengthId, 'La longitud'), sku: requiredText(body.sku, 'El SKU'), price: positivePrice(body.price), stock }
        })
        if (stock > 0) await tx.inventoryMovement.create({ data: { variantId: created.id, type: InventoryMovementType.INITIAL, quantity: stock, previousStock: 0, resultingStock: stock, note: 'Stock inicial de la variante.' } })
        return created
      })
      return reply.code(201).send(variant)
    } catch (error) { return handleError(reply, error) }
  })

  app.patch<{ Params: { variantId: string }, Body: Partial<VariantBody> }>('/admin/variants/:variantId', async (request, reply) => {
    try {
      const body = request.body
      return await prisma.productVariant.update({
        where: { id: request.params.variantId },
        data: {
          ...(body.colorId ? { colorId: requiredText(body.colorId, 'El color') } : {}),
          ...(body.lengthId ? { lengthId: requiredText(body.lengthId, 'La longitud') } : {}),
          ...(body.sku !== undefined ? { sku: requiredText(body.sku, 'El SKU') } : {}),
          ...(body.price !== undefined ? { price: positivePrice(body.price) } : {})
        }
      })
    } catch (error) { return handleError(reply, error) }
  })

  app.post<{ Params: { variantId: string }, Body: StockBody }>('/admin/variants/:variantId/stock-adjustments', async (request, reply) => {
    try {
      const quantity = integer(request.body.quantity, 'La cantidad')
      if (quantity === 0) throw new Error('El ajuste no puede ser cero.')
      const type = request.body.type ? InventoryMovementType[request.body.type] : InventoryMovementType.ADJUSTMENT
      const result = await prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findUnique({ where: { id: request.params.variantId } })
        if (!variant) throw new Error('Variante no encontrada.')
        const resultingStock = variant.stock + quantity
        if (resultingStock < 0) throw new Error('El ajuste dejaría el stock en negativo.')
        const updated = await tx.productVariant.update({ where: { id: variant.id }, data: { stock: resultingStock } })
        const movement = await tx.inventoryMovement.create({ data: { variantId: variant.id, type, quantity, previousStock: variant.stock, resultingStock, note: request.body.note?.trim() || null } })
        return { variant: updated, movement }
      })
      return result
    } catch (error) { return handleError(reply, error) }
  })

  app.get<{ Params: { variantId: string } }>('/admin/variants/:variantId/movements', async (request) => prisma.inventoryMovement.findMany({
    where: { variantId: request.params.variantId }, orderBy: { createdAt: 'desc' }
  }))

  app.post<{ Params: { id: string }, Body: ImageBody }>('/admin/products/:id/images', async (request, reply) => {
    try {
      const body = request.body
      const image = await prisma.productImage.create({
        data: { productId: request.params.id, variantId: body.variantId || null, url: requiredText(body.url, 'La URL de la imagen'), alt: requiredText(body.alt, 'El texto alternativo'), position: integer(body.position ?? 0, 'La posición') }
      })
      return reply.code(201).send(image)
    } catch (error) { return handleError(reply, error) }
  })

  app.delete<{ Params: { id: string } }>('/admin/images/:id', async (request, reply) => {
    try {
      await prisma.productImage.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (error) { return handleError(reply, error) }
  })

  app.delete<{ Params: { id: string } }>('/admin/products/:id', async (request, reply) => {
    await prisma.product.update({ where: { id: request.params.id }, data: { status: ProductStatus.ARCHIVED } })
    return reply.code(204).send()
  })
}
