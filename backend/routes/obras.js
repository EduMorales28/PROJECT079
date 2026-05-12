const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', async (req, res) => {
  try {
    const { search, activo } = req.query;
    const params = [];
    let sql = `
      SELECT o.*,
        COALESCE((
          SELECT SUM(fi.total) FROM factura_items fi
          JOIN facturas f ON f.id = fi.factura_id
          WHERE f.obra_id = o.id AND f.anulada = 0
            AND NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)
        ), 0) +
        COALESCE((
          SELECT SUM(ri.total) FROM remito_items ri
          JOIN remitos r ON r.id = ri.remito_id
          WHERE r.obra_id = o.id
        ), 0) -
        COALESCE((
          SELECT SUM(nci.total) FROM nota_credito_items nci
          JOIN notas_credito nc ON nc.id = nci.nota_credito_id
          JOIN facturas f ON f.id = nc.factura_id
          WHERE f.obra_id = o.id
        ), 0) AS total_gastado
      FROM obras o WHERE 1=1`;
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (o.nombre ILIKE $${params.length} OR o.numero ILIKE $${params.length})`;
    }
    if (activo !== undefined) {
      params.push(activo);
      sql += ` AND o.activo = $${params.length}`;
    }
    sql += ' ORDER BY o.numero';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM obras WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Obra no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { nombre, numero, ubicacion, monto_presupuestado, moneda } = req.body;
  if (!nombre || !numero) return res.status(400).json({ error: 'Nombre y número son requeridos' });
  try {
    const { rows } = await db.query(
      'INSERT INTO obras (nombre, numero, ubicacion, monto_presupuestado, moneda) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nombre, numero, ubicacion || '', monto_presupuestado || 0, moneda || 'UYU']
    );
    res.json({ id: rows[0].id, ...req.body });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'El número de obra ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { nombre, numero, ubicacion, monto_presupuestado, moneda, activo } = req.body;
  try {
    await db.query(
      'UPDATE obras SET nombre=$1, numero=$2, ubicacion=$3, monto_presupuestado=$4, moneda=$5, activo=$6, updated_at=NOW() WHERE id=$7',
      [nombre, numero, ubicacion || '', monto_presupuestado || 0, moneda || 'UYU', activo !== undefined ? activo : 1, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'El número de obra ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE obras SET activo=0, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/gastos', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows: facturas } = await db.query(`
      SELECT f.id, f.numero, f.fecha, f.moneda, p.razon_social as proveedor,
             f.total_neto, f.total_iva, f.total, 'factura' as tipo
      FROM facturas f
      JOIN proveedores p ON p.id = f.proveedor_id
      WHERE f.obra_id = $1 AND f.anulada = 0
        AND NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)
      ORDER BY f.fecha
    `, [id]);
    const { rows: remitos } = await db.query(`
      SELECT r.id, r.numero, r.fecha, r.moneda, p.razon_social as proveedor,
             f.numero as factura_numero, r.total_neto, r.total_iva, r.total, 'remito' as tipo
      FROM remitos r
      JOIN proveedores p ON p.id = r.proveedor_id
      LEFT JOIN facturas f ON f.id = r.factura_id
      WHERE r.obra_id = $1
      ORDER BY r.fecha
    `, [id]);
    res.json({ facturas, remitos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
