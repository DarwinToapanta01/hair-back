# API — Johanna Chavez

Backend de catálogo e inventario. Corre en `http://localhost:3001`.

## Desarrollo

```powershell
corepack pnpm dev
```

La API pública está bajo `/api/catalog`. La administración está bajo `/api/admin` y exige una sesión de administradora.

Configura `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 12 caracteres) y opcionalmente `ADMIN_NAME` en `.env`. Después ejecuta `corepack pnpm db:create-admin` para crear o actualizar la cuenta administradora. La sesión se conserva en una cookie HTTP-only por siete días.

## Autenticación

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Catálogo público

- `GET /api/catalog`
- `GET /api/catalog/:slug`

Filtros admitidos en catálogo: `type`, `texture`, `color` y `length`.

## Administración de catálogo

- `GET /api/admin/catalog-data` — categorías, texturas, colores y longitudes para formularios.
- `GET /api/admin/products` — lista interna, incluso borradores y archivados.
- `GET /api/admin/products/:id` — producto completo.
- `POST /api/admin/products` — crear producto.
- `PATCH /api/admin/products/:id` — editar producto.
- `DELETE /api/admin/products/:id` — archivar producto de forma segura.
- `POST /api/admin/products/:id/variants` — crear una variante color/longitud.
- `PATCH /api/admin/variants/:variantId` — editar SKU, color, longitud o precio.
- `POST /api/admin/products/:id/images` — vincular una imagen ya subida.
- `DELETE /api/admin/images/:id` — eliminar vínculo de imagen.

## Inventario

- `POST /api/admin/variants/:variantId/stock-adjustments` — ajustar existencias.
- `GET /api/admin/variants/:variantId/movements` — consultar historial de movimientos.

Un ajuste recibe una cantidad positiva o negativa. No permite que el stock sea negativo y conserva el stock anterior y resultante. Los tipos disponibles son `INITIAL`, `ADJUSTMENT`, `SALE` y `RETURN`.

## Datos auxiliares

- `POST /api/admin/categories`
- `POST /api/admin/textures`
- `POST /api/admin/colors`
- `POST /api/admin/lengths`

Las longitudes están limitadas a 10–30 pulgadas, como exige el catálogo de extensiones.
