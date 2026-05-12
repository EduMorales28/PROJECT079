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

function validarCantidadesRemitos(remitoIds, calcedItems) {
  const placeholders = remitoIds.map(() => '?').join(',');

  // Sumar cantidades de remito_items agrupado por articulo_id / descripcion
  const rItems = db.prepare(
    `SELECT articulo_id, descripcion, SUM(cantidad) as total_cant
     FROM remito_items WHERE remito_id IN (${placeholders})
     GROUP BY articulo_id, descripcion`
  ).all(...remitoIds);

  const factMap = {};
  for (const item of calcedItems) {
    const key = item.articulo_id ? `id:${item.articulo_id}` : `desc:${item.descripcion}`;
    if (!factMap[key]) factMap[key] = { qty: 0, desc: item.descripcion };
    factMap[key].qty += parseFloat(item.cantidad || 0);
  }

  const remMap = {};
  for (const item of rItems) {
    const key = item.articulo_id ? `id:${item.articulo_id}` : `desc:${item.descripcion}`;
    if (!remMap[key]) remMap[key] = { qty: 0, desc: item.descripcion };
    remMap[key].qty += item.total_cant;
  }

  const allKeys = new Set([...Object.keys(factMap), ...Object.keys(remMap)]);
  const errores = [];
  for (const key of allKeys) {
    const fQty = factMap[key]?.qty || 0;
    const rQty = remMap[key]?.qty || 0;
    const desc = factMap[key]?.desc || remMap[key]?.desc;
    if (Math.abs(fQty - rQty) > 0.001) {
      errores.push(`"${desc}": factura ${fQty}, remitos ${rQty}`);
    }
  }
  return errores;
}

// GET all
router.get('/', (req, res) => {
  const { proveedor_id, obra_id, fecha_desde, fecha_hasta, moneda, condicion_pago, search } = req.query;
  let sql = `
    SELECT f.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero
    FROM facturas f
    JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN obras o ON o.id = f.obra_id
    WHERE f.anulada = 0
  `;
  const params = [];
  if (proveedor_id) { sql += ' AND f.proveedor_id = ?'; params.push(proveedor_id); }
  if (obra_id) { sql += ' AND f.obra_id = ?'; params.push(obra_id); }
  if (fecha_desde) { sql += ' AND f.fecha >= ?'; params.push(fecha_desde); }
  if (fecha_hasta) { sql += ' AND f.fecha <= ?'; params.push(fecha_hasta); }
  if (moneda) { sql += ' AND f.moneda = ?'; params.push(moneda); }
  if (condicion_pago) { sql += ' AND f.condicion_pago = ?'; params.push(condicion_pago); }
  if (search) { sql += ' AND (f.numero LIKE ? OR p.razon_social LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY f.fecha DESC, f.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET one with items and remitos
router.get('/:id', (req, res) => {
  const f = db.prepare(`
    SELECT f.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre
    FROM facturas f
    JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN obras o ON o.id = f.obra_id
    WHERE f.id = ?
  `).get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Factura no encontrada' });
  f.items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ? ORDER BY id').all(req.params.id);
  f.remitos = db.prepare(`
    SELECT r.*, o.nombre as obra_nombre, o.numero as obra_numero
    FROM remitos r
    LEFT JOIN obras o ON o.id = r.obra_id
    WHERE r.factura_id = ?
  `).all(req.params.id);
  res.json(f);
});

// POST create
router.post('/', (req, res) => {
  const { proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, items, remito_ids } = req.body;
  if (!proveedor_id || !numero || !fecha) return res.status(400).json({ error: 'Proveedor, número y fecha son requeridos' });

  let total_neto = 0, total_iva = 0, total = 0;
  const calcedItems = (items || []).map(item => {
    const c = calcItem(item);
    total_neto += c.precio_total;
    total_iva += c.monto_iva;
    total += c.total;
    return c;
  });

  const remitoIds = Array.isArray(remito_ids) ? remito_ids.filter(Boolean).map(Number) : [];

  if (remitoIds.length > 0) {
    const placeholders = remitoIds.map(() => '?').join(',');
    const remitos = db.prepare(`SELECT id, estado FROM remitos WHERE id IN (${placeholders})`).all(...remitoIds);
    const yaFacturados = remitos.filter(r => r.estado === 'facturado');
    if (yaFacturados.length > 0) {
      return res.status(400).json({ error: `Los remitos ${yaFacturados.map(r => r.id).join(', ')} ya están facturados` });
    }

    const errores = validarCantidadesRemitos(remitoIds, calcedItems);
    if (errores.length > 0) {
      return res.status(400).json({ error: `Las cantidades no coinciden — ${errores.join(' | ')}` });
    }
  }

  const insertFactura = db.prepare(`
    INSERT INTO facturas (proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, total_neto, total_iva, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO factura_items (factura_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const r = insertFactura.run(
      proveedor_id, numero, fecha, moneda || 'UYU',
      obra_id || null, condicion_pago || 'credito', medio_pago || null,
      parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4))
    );
    const factura_id = r.lastInsertRowid;
    for (const item of calcedItems) {
      insertItem.run(
        factura_id, item.articulo_id || null, item.codigo || '', item.descripcion,
        item.unidad || '', item.cantidad, item.precio_unitario,
        item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total
      );
    }
    if (remitoIds.length > 0) {
      const linkRemito = db.prepare(`UPDATE remitos SET factura_id=?, estado='facturado', updated_at=datetime('now','localtime') WHERE id=?`);
      for (const rid of remitoIds) linkRemito.run(factura_id, rid);
    }
    return factura_id;
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
  const { proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, items, remito_ids } = req.body;

  let total_neto = 0, total_iva = 0, total = 0;
  const calcedItems = (items || []).map(item => {
    const c = calcItem(item);
    total_neto += c.precio_total;
    total_iva += c.monto_iva;
    total += c.total;
    return c;
  });

  const remitoIds = Array.isArray(remito_ids) ? remito_ids.filter(Boolean).map(Number) : [];

  if (remitoIds.length > 0) {
    const placeholders = remitoIds.map(() => '?').join(',');
    const remitos = db.prepare(`SELECT id, estado, factura_id FROM remitos WHERE id IN (${placeholders})`).all(...remitoIds);
    const yaFacturadosOtro = remitos.filter(r => r.estado === 'facturado' && r.factura_id !== parseInt(req.params.id));
    if (yaFacturadosOtro.length > 0) {
      return res.status(400).json({ error: `Los remitos ${yaFacturadosOtro.map(r => r.id).join(', ')} ya están vinculados a otra factura` });
    }

    const errores = validarCantidadesRemitos(remitoIds, calcedItems);
    if (errores.length > 0) {
      return res.status(400).json({ error: `Las cantidades no coinciden — ${errores.join(' | ')}` });
    }
  }

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE facturas SET proveedor_id=?, numero=?, fecha=?, moneda=?, obra_id=?, condicion_pago=?, medio_pago=?,
      total_neto=?, total_iva=?, total=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(
      proveedor_id, numero, fecha, moneda || 'UYU', obra_id || null,
      condicion_pago || 'credito', medio_pago || null,
      parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4)),
      req.params.id
    );
    db.prepare('DELETE FROM factura_items WHERE factura_id = ?').run(req.params.id);
    const insertItem = db.prepare(`
      INSERT INTO factura_items (factura_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of calcedItems) {
      insertItem.run(
        req.params.id, item.articulo_id || null, item.codigo || '', item.descripcion,
        item.unidad || '', item.cantidad, item.precio_unitario,
        item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total
      );
    }
    db.prepare(`UPDATE remitos SET factura_id=NULL, estado='pendiente', updated_at=datetime('now','localtime') WHERE factura_id=?`).run(req.params.id);
    if (remitoIds.length > 0) {
      const linkRemito = db.prepare(`UPDATE remitos SET factura_id=?, estado='facturado', updated_at=datetime('now','localtime') WHERE id=?`);
      for (const rid of remitoIds) linkRemito.run(req.params.id, rid);
    }
  });

  try {
    run();
    res.json({ id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE (anular)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE facturas SET anulada=1, updated_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// GET items of a factura (for NC)
router.get('/:id/items', (req, res) => {
  const items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ? ORDER BY id').all(req.params.id);
  res.json(items);
});

module.exports = router;
