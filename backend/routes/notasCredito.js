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

router.get('/', async (req, res) => {
  try {
    const { proveedor_id, fecha_desde, fecha_hasta, search } = req.query;
    const params = [];
    let sql = `
      SELECT nc.*, p.razon_social as proveedor_nombre, f.numero as factura_numero
      FROM notas_credito nc
      JOIN proveedores p ON p.id = nc.proveedor_id
      LEFT JOIN facturas f ON f.id = nc.factura_id
      WHERE 1=1`;
    if (proveedor_id) { params.push(proveedor_id); sql += ` AND nc.proveedor_id = $${params.length}`; }
    if (fecha_desde) { params.push(fecha_desde); sql += ` AND nc.fecha >= $${params.length}`; }
    if (fecha_hasta) { params.push(fecha_hasta); sql += ` AND nc.fecha <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (nc.numero ILIKE $${params.length} OR p.razon_social ILIKE $${params.length})`;
    }
    sql += ' ORDER BY nc.fecha DESC, nc.id DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT nc.*, p.razon_social as proveedor_nombre, f.numero as factura_numero
      FROM notas_credito nc
      JOIN proveedores p ON p.id = nc.proveedor_id
      LEFT JOIN facturas f ON f.id = nc.factura_id
      WHERE nc.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nota de crédito no encontrada' });
    const nc = rows[0];
    const { rows: items } = await db.query('SELECT * FROM nota_credito_items WHERE nota_credito_id = $1 ORDER BY id', [req.params.id]);
    nc.items = items;
    res.json(nc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/proveedor/:proveedor_id/facturas', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT f.id, f.numero, f.fecha, f.moneda, f.total FROM facturas f WHERE f.proveedor_id = $1 AND f.anulada = 0 ORDER BY f.fecha DESC',
      [req.params.proveedor_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { proveedor_id, factura_id, numero, fecha, moneda, items } = req.body;
  if (!proveedor_id || !numero || !fecha) return res.status(400).json({ error: 'Proveedor, número y fecha son requeridos' });

  if (factura_id && items && items.length > 0) {
    for (const item of items) {
      if (item.factura_item_id) {
        const { rows: origRows } = await db.query('SELECT * FROM factura_items WHERE id = $1', [item.factura_item_id]);
        const original = origRows[0];
        const { rows: devRows } = await db.query(`
          SELECT COALESCE(SUM(nci.cantidad), 0) as suma
          FROM nota_credito_items nci
          JOIN notas_credito nc ON nc.id = nci.nota_credito_id
          WHERE nci.factura_item_id = $1 AND nc.id != $2
        `, [item.factura_item_id, 0]);
        const disponible = (original ? parseFloat(original.cantidad) : 0) - parseFloat(devRows[0].suma);
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
    total_neto += c.precio_total; total_iva += c.monto_iva; total += c.total;
    return c;
  });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO notas_credito (proveedor_id, factura_id, numero, fecha, moneda, total_neto, total_iva, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [proveedor_id, factura_id || null, numero, fecha, moneda || 'UYU',
       parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4))]
    );
    const nc_id = rows[0].id;
    for (const item of calcedItems) {
      await client.query(
        `INSERT INTO nota_credito_items (nota_credito_id, factura_item_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [nc_id, item.factura_item_id || null, item.articulo_id || null, item.codigo || '',
         item.descripcion, item.unidad || '', item.cantidad, item.precio_unitario,
         item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total]
      );
    }
    await client.query('COMMIT');
    res.json({ id: nc_id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM notas_credito WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
