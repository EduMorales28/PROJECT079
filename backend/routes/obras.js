const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET all
router.get('/', (req, res) => {
  const { search, activo } = req.query;
  let sql = `SELECT o.*,
    COALESCE((
      SELECT SUM(fi.total)
      FROM factura_items fi
      JOIN facturas f ON f.id = fi.factura_id
      WHERE f.obra_id = o.id AND f.anulada = 0
        AND NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)
    ), 0) +
    COALESCE((
      SELECT SUM(ri.total)
      FROM remito_items ri
      JOIN remitos r ON r.id = ri.remito_id
      WHERE r.obra_id = o.id
    ), 0) -
    COALESCE((
      SELECT SUM(nci.total)
      FROM nota_credito_items nci
      JOIN notas_credito nc ON nc.id = nci.nota_credito_id
      JOIN facturas f ON f.id = nc.factura_id
      WHERE f.obra_id = o.id
    ), 0)
    AS total_gastado
    FROM obras o WHERE 1=1`;
  const params = [];
  if (search) { sql += ' AND (o.nombre LIKE ? OR o.numero LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (activo !== undefined) { sql += ' AND o.activo = ?'; params.push(activo); }
  sql += ' ORDER BY o.numero';
  res.json(db.prepare(sql).all(...params));
});

// GET one
router.get('/:id', (req, res) => {
  const obra = db.prepare('SELECT * FROM obras WHERE id = ?').get(req.params.id);
  if (!obra) return res.status(404).json({ error: 'Obra no encontrada' });
  res.json(obra);
});

// POST create
router.post('/', (req, res) => {
  const { nombre, numero, ubicacion, monto_presupuestado, moneda } = req.body;
  if (!nombre || !numero) return res.status(400).json({ error: 'Nombre y número son requeridos' });
  try {
    const result = db.prepare(
      'INSERT INTO obras (nombre, numero, ubicacion, monto_presupuestado, moneda) VALUES (?, ?, ?, ?, ?)'
    ).run(nombre, numero, ubicacion || '', monto_presupuestado || 0, moneda || 'UYU');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El número de obra ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// PUT update
router.put('/:id', (req, res) => {
  const { nombre, numero, ubicacion, monto_presupuestado, moneda, activo } = req.body;
  try {
    db.prepare(
      `UPDATE obras SET nombre=?, numero=?, ubicacion=?, monto_presupuestado=?, moneda=?, activo=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(nombre, numero, ubicacion || '', monto_presupuestado || 0, moneda || 'UYU', activo !== undefined ? activo : 1, req.params.id);
    res.json({ id: req.params.id, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El número de obra ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE (soft delete)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE obras SET activo=0, updated_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// GET gastos por obra (detalle)
router.get('/:id/gastos', (req, res) => {
  const id = req.params.id;
  // Facturas directas (sin remitos)
  const facturas = db.prepare(`
    SELECT f.id, f.numero, f.fecha, f.moneda, p.razon_social as proveedor,
           f.total_neto, f.total_iva, f.total, 'factura' as tipo
    FROM facturas f
    JOIN proveedores p ON p.id = f.proveedor_id
    WHERE f.obra_id = ? AND f.anulada = 0
      AND NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)
    ORDER BY f.fecha
  `).all(id);

  // Remitos
  const remitos = db.prepare(`
    SELECT r.id, r.numero, r.fecha, r.moneda, p.razon_social as proveedor,
           f.numero as factura_numero, r.total_neto, r.total_iva, r.total, 'remito' as tipo
    FROM remitos r
    JOIN proveedores p ON p.id = r.proveedor_id
    LEFT JOIN facturas f ON f.id = r.factura_id
    WHERE r.obra_id = ?
    ORDER BY r.fecha
  `).all(id);

  res.json({ facturas, remitos });
});

module.exports = router;
