const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET all
router.get('/', (req, res) => {
  const { proveedor_id, obra_id, factura_id, estado, fecha_desde, fecha_hasta, search } = req.query;
  let sql = `
    SELECT r.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero,
           f.numero as factura_numero
    FROM remitos r
    JOIN proveedores p ON p.id = r.proveedor_id
    JOIN obras o ON o.id = r.obra_id
    LEFT JOIN facturas f ON f.id = r.factura_id
    WHERE 1=1
  `;
  const params = [];
  if (proveedor_id) { sql += ' AND r.proveedor_id = ?'; params.push(proveedor_id); }
  if (obra_id) { sql += ' AND r.obra_id = ?'; params.push(obra_id); }
  if (factura_id) { sql += ' AND r.factura_id = ?'; params.push(factura_id); }
  if (estado) { sql += ' AND r.estado = ?'; params.push(estado); }
  if (fecha_desde) { sql += ' AND r.fecha >= ?'; params.push(fecha_desde); }
  if (fecha_hasta) { sql += ' AND r.fecha <= ?'; params.push(fecha_hasta); }
  if (search) { sql += ' AND (r.numero LIKE ? OR p.razon_social LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY r.fecha DESC, r.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET one with items
router.get('/:id', (req, res) => {
  const r = db.prepare(`
    SELECT r.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero,
           f.numero as factura_numero
    FROM remitos r
    JOIN proveedores p ON p.id = r.proveedor_id
    JOIN obras o ON o.id = r.obra_id
    LEFT JOIN facturas f ON f.id = r.factura_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Remito no encontrado' });
  r.items = db.prepare('SELECT * FROM remito_items WHERE remito_id = ? ORDER BY id').all(req.params.id);
  res.json(r);
});

// POST create
router.post('/', (req, res) => {
  const { proveedor_id, numero, fecha, obra_id, items } = req.body;
  if (!proveedor_id || !numero || !fecha || !obra_id) {
    return res.status(400).json({ error: 'Proveedor, número, fecha y obra son requeridos' });
  }

  const run = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO remitos (proveedor_id, numero, fecha, moneda, obra_id, factura_id, estado, total_neto, total_iva, total)
      VALUES (?, ?, ?, 'UYU', ?, NULL, 'pendiente', 0, 0, 0)
    `).run(proveedor_id, numero, fecha, obra_id);
    const remito_id = r.lastInsertRowid;
    const ins = db.prepare(`
      INSERT INTO remito_items (remito_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'TB', 0, 0)
    `);
    for (const item of (items || [])) {
      if (!item.descripcion || !(parseFloat(item.cantidad) > 0)) continue;
      ins.run(remito_id, item.articulo_id || null, item.codigo || '', item.descripcion,
        item.unidad || '', parseFloat(item.cantidad));
    }
    return remito_id;
  });

  try {
    const id = run();
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update
router.put('/:id', (req, res) => {
  const remito = db.prepare('SELECT estado FROM remitos WHERE id = ?').get(req.params.id);
  if (remito && remito.estado === 'facturado') {
    return res.status(400).json({ error: 'No se puede editar un remito ya facturado' });
  }

  const { proveedor_id, numero, fecha, obra_id, items } = req.body;

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE remitos SET proveedor_id=?, numero=?, fecha=?, obra_id=?,
      updated_at=datetime('now','localtime') WHERE id=?
    `).run(proveedor_id, numero, fecha, obra_id, req.params.id);
    db.prepare('DELETE FROM remito_items WHERE remito_id = ?').run(req.params.id);
    const ins = db.prepare(`
      INSERT INTO remito_items (remito_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'TB', 0, 0)
    `);
    for (const item of (items || [])) {
      if (!item.descripcion || !(parseFloat(item.cantidad) > 0)) continue;
      ins.run(req.params.id, item.articulo_id || null, item.codigo || '', item.descripcion,
        item.unidad || '', parseFloat(item.cantidad));
    }
  });

  try {
    run();
    res.json({ id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', (req, res) => {
  const remito = db.prepare('SELECT * FROM remitos WHERE id = ?').get(req.params.id);
  if (remito && remito.estado === 'facturado') {
    return res.status(400).json({ error: 'No se puede eliminar un remito facturado' });
  }
  db.prepare('DELETE FROM remito_items WHERE remito_id = ?').run(req.params.id);
  db.prepare('DELETE FROM remitos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
