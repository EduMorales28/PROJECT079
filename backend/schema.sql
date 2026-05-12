-- Esquema para Supabase (PostgreSQL)
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS obras (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  numero TEXT NOT NULL UNIQUE,
  ubicacion TEXT DEFAULT '',
  monto_presupuestado FLOAT8 DEFAULT 0,
  moneda TEXT DEFAULT 'UYU',
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  razon_social TEXT NOT NULL,
  rut TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articulos (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  subgrupo TEXT DEFAULT '',
  unidad TEXT DEFAULT '',
  moneda TEXT DEFAULT 'UYU',
  tipo_iva TEXT DEFAULT 'TB',
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facturas (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  moneda TEXT DEFAULT 'UYU',
  obra_id INTEGER REFERENCES obras(id),
  condicion_pago TEXT DEFAULT 'credito',
  medio_pago TEXT,
  total_neto FLOAT8 DEFAULT 0,
  total_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0,
  anulada INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factura_items (
  id SERIAL PRIMARY KEY,
  factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  articulo_id INTEGER REFERENCES articulos(id),
  codigo TEXT DEFAULT '',
  descripcion TEXT NOT NULL,
  unidad TEXT DEFAULT '',
  cantidad FLOAT8 DEFAULT 1,
  precio_unitario FLOAT8 DEFAULT 0,
  precio_total FLOAT8 DEFAULT 0,
  tipo_iva TEXT DEFAULT 'TB',
  monto_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS remitos (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  moneda TEXT DEFAULT 'UYU',
  obra_id INTEGER NOT NULL REFERENCES obras(id),
  factura_id INTEGER REFERENCES facturas(id),
  estado TEXT DEFAULT 'pendiente',
  total_neto FLOAT8 DEFAULT 0,
  total_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remito_items (
  id SERIAL PRIMARY KEY,
  remito_id INTEGER NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
  articulo_id INTEGER REFERENCES articulos(id),
  codigo TEXT DEFAULT '',
  descripcion TEXT NOT NULL,
  unidad TEXT DEFAULT '',
  cantidad FLOAT8 DEFAULT 1,
  precio_unitario FLOAT8 DEFAULT 0,
  precio_total FLOAT8 DEFAULT 0,
  tipo_iva TEXT DEFAULT 'TB',
  monto_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notas_credito (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  factura_id INTEGER REFERENCES facturas(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  moneda TEXT DEFAULT 'UYU',
  total_neto FLOAT8 DEFAULT 0,
  total_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nota_credito_items (
  id SERIAL PRIMARY KEY,
  nota_credito_id INTEGER NOT NULL REFERENCES notas_credito(id) ON DELETE CASCADE,
  factura_item_id INTEGER REFERENCES factura_items(id),
  articulo_id INTEGER REFERENCES articulos(id),
  codigo TEXT DEFAULT '',
  descripcion TEXT NOT NULL,
  unidad TEXT DEFAULT '',
  cantidad FLOAT8 DEFAULT 1,
  precio_unitario FLOAT8 DEFAULT 0,
  precio_total FLOAT8 DEFAULT 0,
  tipo_iva TEXT DEFAULT 'TB',
  monto_iva FLOAT8 DEFAULT 0,
  total FLOAT8 DEFAULT 0
);
