const express = require('express');
const router = express.Router();
const db = require('../db/database');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

async function buildReporteData(query) {
  const { obra_id, proveedor_id, fecha_desde, fecha_hasta, moneda, condicion_pago, con_articulos } = query;

  const condF = []; const pF = [];
  if (obra_id) { pF.push(obra_id); condF.push(`f.obra_id = $${pF.length}`); }
  if (proveedor_id) { pF.push(proveedor_id); condF.push(`f.proveedor_id = $${pF.length}`); }
  if (fecha_desde) { pF.push(fecha_desde); condF.push(`f.fecha >= $${pF.length}`); }
  if (fecha_hasta) { pF.push(fecha_hasta); condF.push(`f.fecha <= $${pF.length}`); }
  if (moneda) { pF.push(moneda); condF.push(`f.moneda = $${pF.length}`); }
  if (condicion_pago) { pF.push(condicion_pago); condF.push(`f.condicion_pago = $${pF.length}`); }
  condF.push('f.anulada = 0');
  condF.push('NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)');
  const whereF = 'WHERE ' + condF.join(' AND ');

  const condR = []; const pR = [];
  if (obra_id) { pR.push(obra_id); condR.push(`r.obra_id = $${pR.length}`); }
  if (proveedor_id) { pR.push(proveedor_id); condR.push(`r.proveedor_id = $${pR.length}`); }
  if (fecha_desde) { pR.push(fecha_desde); condR.push(`r.fecha >= $${pR.length}`); }
  if (fecha_hasta) { pR.push(fecha_hasta); condR.push(`r.fecha <= $${pR.length}`); }
  if (moneda) { pR.push(moneda); condR.push(`r.moneda = $${pR.length}`); }
  const whereR = condR.length ? 'WHERE ' + condR.join(' AND ') : '';

  let data;

  if (con_articulos === '1') {
    const { rows: factItems } = await db.query(`
      SELECT f.numero as factura, f.fecha, p.razon_social as proveedor, NULL as remito,
             fi.codigo, fi.descripcion, fi.cantidad, fi.unidad, fi.precio_unitario,
             fi.tipo_iva, fi.monto_iva, fi.total, f.moneda, f.condicion_pago,
             o.nombre as obra_nombre, o.numero as obra_numero, f.obra_id
      FROM facturas f
      JOIN proveedores p ON p.id = f.proveedor_id
      JOIN factura_items fi ON fi.factura_id = f.id
      JOIN obras o ON o.id = f.obra_id
      ${whereF} ORDER BY f.fecha, f.numero
    `, pF);
    const { rows: remitoItems } = await db.query(`
      SELECT f.numero as factura, r.fecha, p.razon_social as proveedor, r.numero as remito,
             ri.codigo, ri.descripcion, ri.cantidad, ri.unidad, ri.precio_unitario,
             ri.tipo_iva, ri.monto_iva, ri.total, r.moneda, f.condicion_pago,
             o.nombre as obra_nombre, o.numero as obra_numero, r.obra_id
      FROM remitos r
      JOIN proveedores p ON p.id = r.proveedor_id
      JOIN remito_items ri ON ri.remito_id = r.id
      JOIN obras o ON o.id = r.obra_id
      LEFT JOIN facturas f ON f.id = r.factura_id
      ${whereR} ORDER BY r.fecha, r.numero
    `, pR);
    data = [...factItems, ...remitoItems];
  } else {
    const { rows: factSummary } = await db.query(`
      SELECT f.numero as factura, f.fecha, p.razon_social as proveedor, f.moneda,
             f.condicion_pago, f.total_neto, f.total_iva, f.total,
             o.nombre as obra_nombre, o.numero as obra_numero, f.obra_id
      FROM facturas f
      JOIN proveedores p ON p.id = f.proveedor_id
      JOIN obras o ON o.id = f.obra_id
      ${whereF} ORDER BY f.fecha, f.numero
    `, pF);
    const { rows: remitoSummary } = await db.query(`
      SELECT f.numero as factura, r.fecha, p.razon_social as proveedor, r.moneda,
             f.condicion_pago, r.total_neto, r.total_iva, r.total,
             o.nombre as obra_nombre, o.numero as obra_numero, r.obra_id
      FROM remitos r
      JOIN proveedores p ON p.id = r.proveedor_id
      JOIN obras o ON o.id = r.obra_id
      LEFT JOIN facturas f ON f.id = r.factura_id
      ${whereR} ORDER BY r.fecha, r.numero
    `, pR);
    data = [...factSummary, ...remitoSummary];
  }

  return { data, obra_id };
}

router.get('/gastos-obra', async (req, res) => {
  try {
    const { data, obra_id } = await buildReporteData(req.query);

    const { rows: obrasQuery } = obra_id
      ? await db.query('SELECT * FROM obras WHERE id = $1', [obra_id])
      : await db.query('SELECT * FROM obras WHERE activo = 1 ORDER BY numero');

    const obrasSummary = obrasQuery.map(o => {
      const gastado = data.filter(d => parseInt(d.obra_id) === o.id).reduce((s, d) => s + (parseFloat(d.total) || 0), 0);
      return {
        id: o.id,
        nombre: o.nombre,
        numero: o.numero,
        presupuesto: o.monto_presupuestado,
        moneda_presupuesto: o.moneda,
        gastado: parseFloat(gastado.toFixed(2)),
        saldo: parseFloat((o.monto_presupuestado - gastado).toFixed(2)),
        pct: o.monto_presupuestado > 0 ? parseFloat(((gastado / o.monto_presupuestado) * 100).toFixed(1)) : 0
      };
    });

    res.json({ obras: obrasSummary, detalle: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/gastos-obra/excel', async (req, res) => {
  try {
    const { obra_id, proveedor_id, fecha_desde, fecha_hasta, moneda, condicion_pago, con_articulos } = req.query;

    const condF = []; const pF = [];
    if (obra_id) { pF.push(obra_id); condF.push(`f.obra_id = $${pF.length}`); }
    if (proveedor_id) { pF.push(proveedor_id); condF.push(`f.proveedor_id = $${pF.length}`); }
    if (fecha_desde) { pF.push(fecha_desde); condF.push(`f.fecha >= $${pF.length}`); }
    if (fecha_hasta) { pF.push(fecha_hasta); condF.push(`f.fecha <= $${pF.length}`); }
    if (moneda) { pF.push(moneda); condF.push(`f.moneda = $${pF.length}`); }
    if (condicion_pago) { pF.push(condicion_pago); condF.push(`f.condicion_pago = $${pF.length}`); }
    condF.push('f.anulada = 0');
    condF.push('NOT EXISTS (SELECT 1 FROM remitos r WHERE r.factura_id = f.id)');
    const whereF = 'WHERE ' + condF.join(' AND ');

    const condR = []; const pR = [];
    if (obra_id) { pR.push(obra_id); condR.push(`r.obra_id = $${pR.length}`); }
    if (proveedor_id) { pR.push(proveedor_id); condR.push(`r.proveedor_id = $${pR.length}`); }
    if (fecha_desde) { pR.push(fecha_desde); condR.push(`r.fecha >= $${pR.length}`); }
    if (fecha_hasta) { pR.push(fecha_hasta); condR.push(`r.fecha <= $${pR.length}`); }
    if (moneda) { pR.push(moneda); condR.push(`r.moneda = $${pR.length}`); }
    const whereR = condR.length ? 'WHERE ' + condR.join(' AND ') : '';

    let rows = [];
    if (con_articulos === '1') {
      const { rows: fi } = await db.query(`
        SELECT o.numero as obra_nro, o.nombre as obra, f.numero as factura, f.fecha, p.razon_social as proveedor,
               NULL as remito, fi.codigo, fi.descripcion, fi.cantidad, fi.unidad, fi.precio_unitario,
               fi.tipo_iva, fi.monto_iva, fi.total, f.moneda
        FROM facturas f JOIN proveedores p ON p.id=f.proveedor_id
        JOIN factura_items fi ON fi.factura_id=f.id JOIN obras o ON o.id=f.obra_id
        ${whereF} ORDER BY f.fecha
      `, pF);
      const { rows: ri } = await db.query(`
        SELECT o.numero as obra_nro, o.nombre as obra, f.numero as factura, r.fecha, p.razon_social as proveedor,
               r.numero as remito, ri.codigo, ri.descripcion, ri.cantidad, ri.unidad, ri.precio_unitario,
               ri.tipo_iva, ri.monto_iva, ri.total, r.moneda
        FROM remitos r JOIN proveedores p ON p.id=r.proveedor_id
        JOIN remito_items ri ON ri.remito_id=r.id JOIN obras o ON o.id=r.obra_id
        LEFT JOIN facturas f ON f.id=r.factura_id
        ${whereR} ORDER BY r.fecha
      `, pR);
      rows = [...fi, ...ri];
    } else {
      const { rows: fs } = await db.query(`
        SELECT o.numero as obra_nro, o.nombre as obra, f.numero as factura, f.fecha, p.razon_social as proveedor,
               f.moneda, f.condicion_pago, f.total_neto, f.total_iva, f.total
        FROM facturas f JOIN proveedores p ON p.id=f.proveedor_id JOIN obras o ON o.id=f.obra_id
        ${whereF} ORDER BY f.fecha
      `, pF);
      const { rows: rs } = await db.query(`
        SELECT o.numero as obra_nro, o.nombre as obra, f.numero as factura, r.fecha, p.razon_social as proveedor,
               r.moneda, f.condicion_pago, r.total_neto, r.total_iva, r.total
        FROM remitos r JOIN proveedores p ON p.id=r.proveedor_id JOIN obras o ON o.id=r.obra_id
        LEFT JOIN facturas f ON f.id=r.factura_id
        ${whereR} ORDER BY r.fecha
      `, pR);
      rows = [...fs, ...rs];
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos por Obra');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-gastos-obra.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/gastos-obra/pdf', async (req, res) => {
  try {
    const { obra_id } = req.query;
    const { rows: obras } = obra_id
      ? await db.query('SELECT * FROM obras WHERE id = $1', [obra_id])
      : await db.query('SELECT * FROM obras WHERE activo = 1 ORDER BY numero');

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-gastos-obra.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold').text('OBRA 079 - REPORTE GASTOS POR OBRA', { align: 'center' });
    doc.moveDown(0.5);

    for (const o of obras) {
      const { rows: qF } = await db.query(`
        SELECT COALESCE(SUM(fi.total), 0) as s FROM factura_items fi
        JOIN facturas f ON f.id=fi.factura_id
        WHERE f.obra_id=$1 AND f.anulada=0 AND NOT EXISTS(SELECT 1 FROM remitos r WHERE r.factura_id=f.id)
      `, [o.id]);
      const { rows: qR } = await db.query(`
        SELECT COALESCE(SUM(ri.total), 0) as s FROM remito_items ri
        JOIN remitos r ON r.id=ri.remito_id WHERE r.obra_id=$1
      `, [o.id]);
      const gastado = parseFloat(qF[0].s) + parseFloat(qR[0].s);
      const saldo = o.monto_presupuestado - gastado;
      const pct = o.monto_presupuestado > 0 ? ((gastado / o.monto_presupuestado) * 100).toFixed(1) : '0.0';

      doc.fontSize(11).font('Helvetica-Bold').text(`Obra ${o.numero} - ${o.nombre}`, { underline: true });
      doc.fontSize(9).font('Helvetica')
        .text(`Presupuesto: ${o.moneda} ${o.monto_presupuestado.toLocaleString('es-UY', { minimumFractionDigits: 2 })}   |   Gastado: ${gastado.toLocaleString('es-UY', { minimumFractionDigits: 2 })}   |   Saldo: ${saldo.toLocaleString('es-UY', { minimumFractionDigits: 2 })}   |   Consumido: ${pct}%`);
      doc.moveDown(0.8);
    }

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
