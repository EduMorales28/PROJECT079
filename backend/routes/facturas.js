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

async function validarCantidadesRemitos(remitoIds, calcedItems) {
  const { rows: rItems } = await db.query(
    `SELECT articulo_id, descripcion, SUM(cantidad) as total_cant
     FROM remito_items WHERE remito_id = ANY($1::int[])
     GROUP BY articulo_id, descripcion`,
    [remitoIds]
  );

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
    remMap[key].qty += parseFloat(item.total_cant);
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

router.get('/', async (req, res) => {
  try {
    const { proveedor_id, obra_id, fecha_desde, fecha_hasta, moneda, condicion_pago, search } = req.query;
    const params = [];
    let sql = `
      SELECT f.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre, o.numero as obra_numero
      FROM facturas f
      JOIN proveedores p ON p.id = f.proveedor_id
      LEFT JOIN obras o ON o.id = f.obra_id
      WHERE f.anulada = 0`;
    if (proveedor_id) { params.push(proveedor_id); sql += ` AND f.proveedor_id = $${params.length}`; }
    if (obra_id) { params.push(obra_id); sql += ` AND f.obra_id = $${params.length}`; }
    if (fecha_desde) { params.push(fecha_desde); sql += ` AND f.fecha >= $${params.length}`; }
    if (fecha_hasta) { params.push(fecha_hasta); sql += ` AND f.fecha <= $${params.length}`; }
    if (moneda) { params.push(moneda); sql += ` AND f.moneda = $${params.length}`; }
    if (condicion_pago) { params.push(condicion_pago); sql += ` AND f.condicion_pago = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (f.numero ILIKE $${params.length} OR p.razon_social ILIKE $${params.length})`;
    }
    sql += ' ORDER BY f.fecha DESC, f.id DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT f.*, p.razon_social as proveedor_nombre, o.nombre as obra_nombre
      FROM facturas f
      JOIN proveedores p ON p.id = f.proveedor_id
      LEFT JOIN obras o ON o.id = f.obra_id
      WHERE f.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Factura no encontrada' });
    const f = rows[0];
    const { rows: items } = await db.query('SELECT * FROM factura_items WHERE factura_id = $1 ORDER BY id', [req.params.id]);
    const { rows: remitos } = await db.query(`
      SELECT r.*, o.nombre as obra_nombre, o.numero as obra_numero
      FROM remitos r LEFT JOIN obras o ON o.id = r.obra_id
      WHERE r.factura_id = $1
    `, [req.params.id]);
    f.items = items;
    f.remitos = remitos;
    res.json(f);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, items, remito_ids } = req.body;
  if (!proveedor_id || !numero || !fecha) return res.status(400).json({ error: 'Proveedor, número y fecha son requeridos' });

  let total_neto = 0, total_iva = 0, total = 0;
  const calcedItems = (items || []).map(item => {
    const c = calcItem(item);
    total_neto += c.precio_total; total_iva += c.monto_iva; total += c.total;
    return c;
  });

  const remitoIds = Array.isArray(remito_ids) ? remito_ids.filter(Boolean).map(Number) : [];

  if (remitoIds.length > 0) {
    const { rows: remitos } = await db.query('SELECT id, estado FROM remitos WHERE id = ANY($1::int[])', [remitoIds]);
    const yaFacturados = remitos.filter(r => r.estado === 'facturado');
    if (yaFacturados.length > 0) {
      return res.status(400).json({ error: `Los remitos ${yaFacturados.map(r => r.id).join(', ')} ya están facturados` });
    }
    const errores = await validarCantidadesRemitos(remitoIds, calcedItems);
    if (errores.length > 0) {
      return res.status(400).json({ error: `Las cantidades no coinciden — ${errores.join(' | ')}` });
    }
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: fRows } = await client.query(
      `INSERT INTO facturas (proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, total_neto, total_iva, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [proveedor_id, numero, fecha, moneda || 'UYU', obra_id || null, condicion_pago || 'credito',
       medio_pago || null, parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4))]
    );
    const factura_id = fRows[0].id;
    for (const item of calcedItems) {
      await client.query(
        `INSERT INTO factura_items (factura_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [factura_id, item.articulo_id || null, item.codigo || '', item.descripcion,
         item.unidad || '', item.cantidad, item.precio_unitario,
         item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total]
      );
    }
    if (remitoIds.length > 0) {
      await client.query(
        `UPDATE remitos SET factura_id=$1, estado='facturado', updated_at=NOW() WHERE id = ANY($2::int[])`,
        [factura_id, remitoIds]
      );
    }
    await client.query('COMMIT');
    res.json({ id: factura_id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, medio_pago, items, remito_ids } = req.body;

  let total_neto = 0, total_iva = 0, total = 0;
  const calcedItems = (items || []).map(item => {
    const c = calcItem(item);
    total_neto += c.precio_total; total_iva += c.monto_iva; total += c.total;
    return c;
  });

  const remitoIds = Array.isArray(remito_ids) ? remito_ids.filter(Boolean).map(Number) : [];

  if (remitoIds.length > 0) {
    const { rows: remitos } = await db.query(
      'SELECT id, estado, factura_id FROM remitos WHERE id = ANY($1::int[])', [remitoIds]
    );
    const yaFacturadosOtro = remitos.filter(r => r.estado === 'facturado' && parseInt(r.factura_id) !== parseInt(req.params.id));
    if (yaFacturadosOtro.length > 0) {
      return res.status(400).json({ error: `Los remitos ${yaFacturadosOtro.map(r => r.id).join(', ')} ya están vinculados a otra factura` });
    }
    const errores = await validarCantidadesRemitos(remitoIds, calcedItems);
    if (errores.length > 0) {
      return res.status(400).json({ error: `Las cantidades no coinciden — ${errores.join(' | ')}` });
    }
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE facturas SET proveedor_id=$1, numero=$2, fecha=$3, moneda=$4, obra_id=$5,
       condicion_pago=$6, medio_pago=$7, total_neto=$8, total_iva=$9, total=$10, updated_at=NOW() WHERE id=$11`,
      [proveedor_id, numero, fecha, moneda || 'UYU', obra_id || null,
       condicion_pago || 'credito', medio_pago || null,
       parseFloat(total_neto.toFixed(4)), parseFloat(total_iva.toFixed(4)), parseFloat(total.toFixed(4)),
       req.params.id]
    );
    await client.query('DELETE FROM factura_items WHERE factura_id = $1', [req.params.id]);
    for (const item of calcedItems) {
      await client.query(
        `INSERT INTO factura_items (factura_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [req.params.id, item.articulo_id || null, item.codigo || '', item.descripcion,
         item.unidad || '', item.cantidad, item.precio_unitario,
         item.precio_total, item.tipo_iva || 'TB', item.monto_iva, item.total]
      );
    }
    await client.query(
      `UPDATE remitos SET factura_id=NULL, estado='pendiente', updated_at=NOW() WHERE factura_id=$1`,
      [req.params.id]
    );
    if (remitoIds.length > 0) {
      await client.query(
        `UPDATE remitos SET factura_id=$1, estado='facturado', updated_at=NOW() WHERE id = ANY($2::int[])`,
        [req.params.id, remitoIds]
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
    await db.query('UPDATE facturas SET anulada=1, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/items', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM factura_items WHERE factura_id = $1 ORDER BY id', [req.params.id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
