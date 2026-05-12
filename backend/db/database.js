const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'obra079.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    numero TEXT NOT NULL UNIQUE,
    ubicacion TEXT,
    monto_presupuestado REAL DEFAULT 0,
    moneda TEXT DEFAULT 'UYU',
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razon_social TEXT NOT NULL,
    rut TEXT,
    direccion TEXT,
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS articulos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    subgrupo TEXT,
    unidad TEXT,
    moneda TEXT DEFAULT 'UYU',
    tipo_iva TEXT DEFAULT 'TB',
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    fecha TEXT NOT NULL,
    moneda TEXT DEFAULT 'UYU',
    obra_id INTEGER,
    condicion_pago TEXT DEFAULT 'credito',
    medio_pago TEXT,
    total_neto REAL DEFAULT 0,
    total_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    anulada INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    FOREIGN KEY (obra_id) REFERENCES obras(id)
  );

  CREATE TABLE IF NOT EXISTS factura_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL,
    articulo_id INTEGER,
    codigo TEXT,
    descripcion TEXT NOT NULL,
    unidad TEXT,
    cantidad REAL DEFAULT 1,
    precio_unitario REAL DEFAULT 0,
    precio_total REAL DEFAULT 0,
    tipo_iva TEXT DEFAULT 'TB',
    monto_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
    FOREIGN KEY (articulo_id) REFERENCES articulos(id)
  );

  CREATE TABLE IF NOT EXISTS remitos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    fecha TEXT NOT NULL,
    moneda TEXT DEFAULT 'UYU',
    obra_id INTEGER NOT NULL,
    factura_id INTEGER,
    estado TEXT DEFAULT 'pendiente',
    total_neto REAL DEFAULT 0,
    total_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    FOREIGN KEY (obra_id) REFERENCES obras(id),
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
  );

  CREATE TABLE IF NOT EXISTS remito_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remito_id INTEGER NOT NULL,
    articulo_id INTEGER,
    codigo TEXT,
    descripcion TEXT NOT NULL,
    unidad TEXT,
    cantidad REAL DEFAULT 1,
    precio_unitario REAL DEFAULT 0,
    precio_total REAL DEFAULT 0,
    tipo_iva TEXT DEFAULT 'TB',
    monto_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    FOREIGN KEY (remito_id) REFERENCES remitos(id) ON DELETE CASCADE,
    FOREIGN KEY (articulo_id) REFERENCES articulos(id)
  );

  CREATE TABLE IF NOT EXISTS notas_credito (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER NOT NULL,
    factura_id INTEGER,
    numero TEXT NOT NULL,
    fecha TEXT NOT NULL,
    moneda TEXT DEFAULT 'UYU',
    total_neto REAL DEFAULT 0,
    total_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
  );

  CREATE TABLE IF NOT EXISTS nota_credito_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_credito_id INTEGER NOT NULL,
    factura_item_id INTEGER,
    articulo_id INTEGER,
    codigo TEXT,
    descripcion TEXT NOT NULL,
    unidad TEXT,
    cantidad REAL DEFAULT 1,
    precio_unitario REAL DEFAULT 0,
    precio_total REAL DEFAULT 0,
    tipo_iva TEXT DEFAULT 'TB',
    monto_iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    FOREIGN KEY (nota_credito_id) REFERENCES notas_credito(id) ON DELETE CASCADE,
    FOREIGN KEY (factura_item_id) REFERENCES factura_items(id),
    FOREIGN KEY (articulo_id) REFERENCES articulos(id)
  );
`);

module.exports = db;
