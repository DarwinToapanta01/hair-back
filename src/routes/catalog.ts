import type { FastifyPluginAsync } from 'fastify'
import { ProductKind, ProductStatus } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'

type CatalogQuery = { type?: 'EXTENSION' | 'WIG', texture?: string, color?: string, length?: string }

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: CatalogQuery }>('/catalog', async (request) => {
    const { type, texture, color, length } = request.query
    const inches = Number(length)
    const hasLength = Number.isFinite(inches)
    const variantsWhere = { ...(color ? { color: { name: color } } : {}), ...(hasLength ? { length: { inches } } : {}) }
    const products = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        ...(type ? { kind: type === 'WIG' ? ProductKind.WIG : ProductKind.EXTENSION } : {}),
        ...(texture ? { texture: { name: texture } } : {}),
        ...(color || hasLength ? { variants: { some: variantsWhere } } : {})
      },
      include: { texture: true, images: { orderBy: { position: 'asc' }, take: 1 }, variants: { where: variantsWhere, include: { color: true, length: true }, orderBy: { price: 'asc' } } },
      orderBy: { name: 'asc' }
    })
    return products.map(product => ({
      id: product.id, slug: product.slug, name: product.name, kind: product.kind, texture: product.texture?.name,
      image: product.images[0]?.url ?? '', description: product.description ?? '',
      variants: product.variants.map(variant => ({ id: variant.id, sku: variant.sku, color: variant.color.name, length: variant.length.inches, price: Number(variant.price), stock: variant.stock }))
    }))
  })

  app.get<{ Params: { slug: string } }>('/catalog/:slug', async (request, reply) => {
    const product = await prisma.product.findFirst({
      where: { slug: request.params.slug, status: ProductStatus.ACTIVE },
      include: { texture: true, images: { orderBy: { position: 'asc' } }, variants: { include: { color: true, length: true }, orderBy: { price: 'asc' } } }
    })
    if (!product) return reply.code(404).send({ message: 'Producto no encontrado.' })
    return {
      id: product.id, slug: product.slug, name: product.name, kind: product.kind, texture: product.texture?.name,
      image: product.images[0]?.url ?? '', images: product.images.map(image => ({ url: image.url, alt: image.alt })), description: product.description ?? '',
      variants: product.variants.map(variant => ({ id: variant.id, sku: variant.sku, color: variant.color.name, length: variant.length.inches, price: Number(variant.price), stock: variant.stock }))
    }
  })
}
