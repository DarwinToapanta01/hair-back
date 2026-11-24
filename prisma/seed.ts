import 'dotenv/config'
import { ProductKind, ProductStatus } from '../src/generated/prisma/client.js'
import { prisma } from '../src/lib/prisma.js'

const textures = ['Liso', 'Ondulado', 'Rizado', 'Crespo']
const colors = [{ name: 'Negro natural', code: '1B', hex: '#111416' }, { name: 'Castaño oscuro', code: '2', hex: '#39291F' }, { name: 'Chocolate', code: '4', hex: '#65412C' }]
const lengths = [10, 14, 20, 30]
type SeedProduct = {
  slug: string
  name: string
  kind: ProductKind
  texture?: string
  image: string
  description: string
  variants: Array<[string, number, number, number]>
}

const products: SeedProduct[] = [
  { slug: 'extension-liso-natural', name: 'Extensión Liso Natural', kind: ProductKind.EXTENSION, texture: 'Liso', image: '/images/Liso.png', description: 'Cabello humano natural virgen con caída pulida.', variants: [['1B', 10, 45, 12], ['1B', 20, 92, 8], ['2', 30, 146, 4]] },
  { slug: 'extension-ondulado-natural', name: 'Extensión Ondulado Natural', kind: ProductKind.EXTENSION, texture: 'Ondulado', image: '/images/Ondulado.png', description: 'Ondas suaves con movimiento y brillo natural.', variants: [['1B', 14, 63, 10], ['2', 20, 101, 7], ['4', 30, 154, 3]] },
  { slug: 'extension-rizado-natural', name: 'Extensión Rizado Natural', kind: ProductKind.EXTENSION, texture: 'Rizado', image: '/images/Riso.png', description: 'Rizos definidos para una textura con carácter.', variants: [['1B', 14, 68, 9], ['2', 20, 110, 5]] },
  { slug: 'extension-crespo-natural', name: 'Extensión Crespo Natural', kind: ProductKind.EXTENSION, texture: 'Crespo', image: '/images/Crespo.png', description: 'Volumen y definición en cabello humano natural virgen.', variants: [['1B', 10, 48, 14], ['1B', 20, 98, 6]] },
  { slug: 'peluca-bob-natural', name: 'Peluca Bob Natural', kind: ProductKind.WIG, image: '/images/Liso.png', description: 'Peluca de cabello humano con acabado elegante.', variants: [['1B', 10, 175, 2], ['2', 14, 210, 2]] }
]

async function main() {
  const extensionCategory = await prisma.category.upsert({ where: { slug: 'extensiones' }, update: {}, create: { name: 'Extensiones', slug: 'extensiones', kind: ProductKind.EXTENSION } })
  const wigCategory = await prisma.category.upsert({ where: { slug: 'pelucas' }, update: {}, create: { name: 'Pelucas', slug: 'pelucas', kind: ProductKind.WIG } })
  for (const name of textures) await prisma.texture.upsert({ where: { slug: name.toLowerCase() }, update: { name }, create: { name, slug: name.toLowerCase() } })
  for (const color of colors) await prisma.color.upsert({ where: { code: color.code }, update: color, create: color })
  for (const inches of lengths) await prisma.length.upsert({ where: { inches }, update: {}, create: { inches } })

  for (const item of products) {
    const textureId = item.texture ? (await prisma.texture.findUniqueOrThrow({ where: { slug: item.texture.toLowerCase() } })).id : null
    const categoryId = item.kind === ProductKind.EXTENSION ? extensionCategory.id : wigCategory.id
    const product = await prisma.product.upsert({ where: { slug: item.slug }, update: { name: item.name, description: item.description, kind: item.kind, status: ProductStatus.ACTIVE, categoryId, textureId }, create: { name: item.name, slug: item.slug, description: item.description, kind: item.kind, status: ProductStatus.ACTIVE, featured: item.kind === ProductKind.EXTENSION, categoryId, textureId } })
    await prisma.productVariant.deleteMany({ where: { productId: product.id } })
    await prisma.productImage.deleteMany({ where: { productId: product.id } })
    await prisma.productImage.create({ data: { productId: product.id, url: item.image, alt: item.name } })
    for (const [colorCode, inches, price, stock] of item.variants) {
      const color = await prisma.color.findUniqueOrThrow({ where: { code: colorCode } })
      const length = await prisma.length.findUniqueOrThrow({ where: { inches } })
      await prisma.productVariant.create({ data: { productId: product.id, colorId: color.id, lengthId: length.id, sku: `JC-${item.slug}-${colorCode}-${inches}`, price, stock } })
    }
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1) })
