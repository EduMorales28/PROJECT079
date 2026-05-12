const express = require('express');
const router = express.Router();
const db = require('../db/database');

const IVA_RATES = { TB: 0.22, TM: 0.10, EX: 0 };

function calcItem(item) {
  const precio_total = parseFloat(item.cantidad) * parseFloat(item.precio_unitario);
  const rate = IVA_RATES[item.tipo_iva] || 0;
  const monto_iva = parseFloat((precio_total * rate).toFixed(4));
  const total = parseFloat((precio_total + monto_iva).toFixed(4));
  return { ...item, precio_total: parseFloat(precio_total.toFixed(4)), monto_iva, total };
}

// GET all
router.get('/', (req, res) => {
  const { proveedor_id, fecha_desde, fecha_hasta, search } = req.query;
  let sql = `
    SELECT nc.*, p.razon_social as proveedor_nombre, f.numero as factura_numero
    FROM notas_credito nc
    JOIN proveedores p ON p.id = nc.proveedor_id
    LEFT JOIN facturas f ON f.id = nc.factura_id
    WHERE 1=1
  `;
  const params = [];
  if (proveedor_id) { sql += ' AND nc.proveedor_id = ?'; params.push(proveedor_id); }
  if (fecha_desde) { sql += ' AND nc.fecha >= ?'; params.push(fecha_desde); }
  if (fecha_hasta) { sql += ' AND nc.fecha <= ?'; params.push(fecha_hasta); }
  if (search) { sql += ' AND (nc.numero LIKE ? OR p.razon_social LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY nc.fecha DESC, nc.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET one with items
router.get('/:id', (req, res) => {
  const nc = db.prepare(`
    SELECT nc.*, p.razon_social as proveedor_nombre, f.numero as factura_numero
    FROM notas_credito nc
    JOIN proveedores p ON p.id = nc.proveedor_id
    LEFT JOIN facturas f ON f.id = nc.factura_id
    WHERE nc.id = ?
  `).get(req.params.id);
  if (!nc) return res.status(404).json({ error: 'Nota de crédito no encontrada' });
  nc.items = db.prepare('SELECT * FROM nota_credito_items WHERE nota_credito_id = ? ORDER BY id').all(req.params.id);
  res.json(nc);
});

// GET facturas by proveedor (for NC form)
router.get('/proveedor/:proveedor_id/facturas', (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.numero, f.fecha, f.moneda, f.total
    FROM facturas f
    WHERE f.proveedor_id = ? AND f.anulada = 0
    ORDER BY f.fecha DESC
  `).all(req.params.proveedor_id);
  res.json(rows);
});

// POST create
router.post('/', (req, res) => {
  const { proveedor_id, factura_id, numero, fecha, moneda, items } = req.body;
  if (!proveedor_id || !numero || !fecha) return res.status(400).json({ error: 'Proveedor, número y fecha son requeridos' });

  // Validate quantities against original factura items
  if (factura_id && items && items.length > 0) {
    for (const item of items) {
      if (item.factura_item_id) {
        const original = db.prepare('SELECT * FROM factura_items WHERE id = ?').get(item.factura_item_id);
        // Sum already credited
        const yaDevuelto = db.prepare(`
          SELECT COALESCE(SUM(nci.cantidad), 0) as suma
          FROM nota_credito_items nci
          JOIN notas_credito nc ON nc.id = nci.nota_credito_id
          WHERE nci.factura_item_id = ? AND nc.id != ?
        `).get(item.factura_item_id, 0);
        const disponible = (original ? original.cantidad : 0) - (yaDevuelto ? yaDevuelto.suma : 0);
        if (parseFloat(item.cantidad) > disponible) {
          return res.status(400).json({
            error: `Item "${item.descripcion}": cantidad a devolver (${item.cantidad}) supera lo disponible (${disponible})`
          });
        }
      }
    }
  }

  let total_neto = 0, total_iva = 0, total = 0;
  const calcedItems = (items || []).map(item => {
    const c = calcItem(item);
    total_neto += c.precio_total;
    total_iva += c.monto_iva;
    total += c.total;
    return c;
  });

  const run = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO notas_credito (proveedor_id, factura_id, numero, fecha, moneda, total_neto, total_iva, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proveedor_id, factura_id || null, numero, fecha, moneda || 'UYU',
      parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4))
    );
    const nc_id = r.lastInsertRowid;
    const ins = db.prepare(`
      INSERT INTO nota_credito_items (nota_credito_id, factura_item_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of calcedItems) {
      ins.run(nc_id, item.factura_item_id || null, item.articulo_id || null, item.codigo || '',
        item.descripcion, item.unidad || '', item.cantidad, item.precio_unitario,
        item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total);
    }
    return nc_id;
  });

  try {
    const id = run();
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notas_credito WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
