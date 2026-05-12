const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', async (req, res) => {
  try {
    const { proveedor_id, obra_id, factura_id, estado, fecha_desde, fecha_hasta, search } = req.query;
    const params = [];
    let sql = `
      SELECT r.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero,
             f.numero as factura_numero
      FROM remitos r
      JOIN proveedores p ON p.id = r.proveedor_id
      JOIN obras o ON o.id = r.obra_id
      LEFT JOIN facturas f ON f.id = r.factura_id
      WHERE 1=1`;
    if (proveedor_id) { params.push(proveedor_id); sql += ` AND r.proveedor_id = $${params.length}`; }
    if (obra_id) { params.push(obra_id); sql += ` AND r.obra_id = $${params.length}`; }
    if (factura_id) { params.push(factura_id); sql += ` AND r.factura_id = $${params.length}`; }
    if (estado) { params.push(estado); sql += ` AND r.estado = $${params.length}`; }
    if (fecha_desde) { params.push(fecha_desde); sql += ` AND r.fecha >= $${params.length}`; }
    if (fecha_hasta) { params.push(fecha_hasta); sql += ` AND r.fecha <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (r.numero ILIKE $${params.length} OR p.razon_social ILIKE $${params.length})`;
    }
    sql += ' ORDER BY r.fecha DESC, r.id DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero,
             f.numero as factura_numero
      FROM remitos r
      JOIN proveedores p ON p.id = r.proveedor_id
      JOIN obras o ON o.id = r.obra_id
      LEFT JOIN facturas f ON f.id = r.factura_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Remito no encontrado' });
    const r = rows[0];
    const { rows: items } = await db.query('SELECT * FROM remito_items WHERE remito_id = $1 ORDER BY id', [req.params.id]);
    r.items = items;
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { proveedor_id, numero, fecha, obra_id, items } = req.body;
  if (!proveedor_id || !numero || !fecha || !obra_id) {
    return res.status(400).json({ error: 'Proveedor, número, fecha y obra son requeridos' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO remitos (proveedor_id, numero, fecha, moneda, obra_id, factura_id, estado, total_neto, total_iva, total)
       VALUES ($1, $2, $3, 'UYU', $4, NULL, 'pendiente', 0, 0, 0) RETURNING id`,
      [proveedor_id, numero, fecha, obra_id]
    );
    const remito_id = rows[0].id;
    for (const item of (items || [])) {
      if (!item.descripcion || !(parseFloat(item.cantidad) > 0)) continue;
      await client.query(
        `INSERT INTO remito_items (remito_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'TB', 0, 0)`,
        [remito_id, item.articulo_id || null, item.codigo || '', item.descripcion, item.unidad || '', parseFloat(item.cantidad)]
      );
    }
    await client.query('COMMIT');
    res.json({ id: remito_id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { rows: check } = await db.query('SELECT estado FROM remitos WHERE id = $1', [req.params.id]);
  if (check[0] && check[0].estado === 'facturado') {
    return res.status(400).json({ error: 'No se puede editar un remito ya facturado' });
  }

  const { proveedor_id, numero, fecha, obra_id, items } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE remitos SET proveedor_id=$1, numero=$2, fecha=$3, obra_id=$4, updated_at=NOW() WHERE id=$5',
      [proveedor_id, numero, fecha, obra_id, req.params.id]
    );
    await client.query('DELETE FROM remito_items WHERE remito_id = $1', [req.params.id]);
    for (const item of (items || [])) {
      if (!item.descripcion || !(parseFloat(item.cantidad) > 0)) continue;
      await client.query(
        `INSERT INTO remito_items (remito_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'TB', 0, 0)`,
        [req.params.id, item.articulo_id || null, item.codigo || '', item.descripcion, item.unidad || '', parseFloat(item.cantidad)]
      );
    }
    await client.query('COMMIT');
    res.json({ id: req.params.id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT estado FROM remitos WHERE id = $1', [req.params.id]);
    if (rows[0] && rows[0].estado === 'facturado') {
      return res.status(400).json({ error: 'No se puede eliminar un remito facturado' });
    }
    await db.query('DELETE FROM remito_items WHERE remito_id = $1', [req.params.id]);
    await db.query('DELETE FROM remitos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
