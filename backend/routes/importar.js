const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

function parseDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) {
    const d = new Date(val.getTime() - val.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s) return null;
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function getTipoIva(subtotal, monto_iva) {
  if (!monto_iva || parseFloat(monto_iva) === 0) return 'EX';
  if (!subtotal || parseFloat(subtotal) === 0) return 'EX';
  const ratio = parseFloat(monto_iva) / parseFloat(subtotal);
  if (Math.abs(ratio - 0.22) <= 0.04) return 'TB';
  if (Math.abs(ratio - 0.10) <= 0.04) return 'TM';
  return 'TB';
}

function parseMoneda(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'u$s' || s === 'usd' || s.startsWith('u$') || s === '$s') return 'USD';
  return 'UYU';
}

function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  return parseFloat(String(val).replace(',', '.')) || 0;
}

// POST /api/importar/datos
router.post('/datos', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  try {
    const wb = XLSX.readFile(req.file.path, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    fs.unlinkSync(req.file.path);

    if (rows.length < 2) return res.status(400).json({ error: 'El Excel está vacío' });

    const headers = rows[0].map(h => String(h).toLowerCase().trim());

    const col = {
      proveedor: headers.findIndex(h => h.includes('proveedor') || h.includes('razon') || h.includes('razón') || h.includes('social')),
      fecha:    headers.findIndex(h => h.includes('fecha')),
      tipo:     headers.findIndex(h => h.includes('tipo')),
      numero:   headers.findIndex(h => h.includes('numer') || h.includes('número') || h === 'n°'),
      moneda:   headers.findIndex(h => h.includes('moneda')),
      subtotal: headers.findIndex(h => h.includes('subtotal') || h.includes('sub total')),
      iva:      headers.findIndex(h => h === 'iva' || h.includes('monto iva') || h.includes('imp iva')),
      total:    headers.findIndex(h => h === 'total' || (h.includes('total') && !h.includes('sub'))),
    };

    const missing = Object.entries(col).filter(([k, v]) => v === -1).map(([k]) => k);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Columnas no encontradas: ${missing.join(', ')}. Encabezados detectados: ${headers.join(', ')}` });
    }

    // Cache de proveedores para no ir a la BD en cada fila
    const proveedorCache = {};
    const getProveedorId = (nombre) => {
      const key = String(nombre || '').trim().toLowerCase();
      if (!key) return null;
      if (proveedorCache[key] !== undefined) return proveedorCache[key];
      const p = db.prepare("SELECT id FROM proveedores WHERE LOWER(TRIM(razon_social)) = ?").get(key);
      proveedorCache[key] = p ? p.id : null;
      return proveedorCache[key];
    };

    const stmts = {
      insertFact: db.prepare(`
        INSERT INTO facturas (proveedor_id, numero, fecha, moneda, obra_id, condicion_pago, total_neto, total_iva, total)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `),
      insertFactItem: db.prepare(`
        INSERT INTO factura_items (factura_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
        VALUES (?, NULL, '', 'Importado de planilla', '', 1, ?, ?, ?, ?, ?)
      `),
      insertNC: db.prepare(`
        INSERT INTO notas_credito (proveedor_id, factura_id, numero, fecha, moneda, total_neto, total_iva, total)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
      `),
      insertNCItem: db.prepare(`
        INSERT INTO nota_credito_items (nota_credito_id, factura_item_id, articulo_id, codigo, descripcion, unidad, cantidad, precio_unitario, precio_total, tipo_iva, monto_iva, total)
        VALUES (?, NULL, NULL, '', 'Importado de planilla', '', 1, ?, ?, ?, ?, ?)
      `),
      checkFact: db.prepare('SELECT id FROM facturas WHERE proveedor_id=? AND numero=?'),
      checkNC:   db.prepare('SELECT id FROM notas_credito WHERE proveedor_id=? AND numero=?'),
    };

    const results = { facturas: 0, ncs: 0, omitidos: 0, errores: [] };

    const importAll = db.transaction((dataRows) => {
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const proveedorNombre = String(row[col.proveedor] || '').trim();
        const fecha    = parseDate(row[col.fecha]);
        const tipoRaw  = String(row[col.tipo] || '').toLowerCase().trim().replace(/\s+/g, '');
        const numero   = String(row[col.numero] || '').trim();
        const moneda   = parseMoneda(row[col.moneda]);
        const subtotal = parseNum(row[col.subtotal]);
        const monto_iva = parseNum(row[col.iva]);
        const total    = parseNum(row[col.total]);

        if (!fecha || !numero || !tipoRaw) { results.omitidos++; continue; }

        const proveedor_id = getProveedorId(proveedorNombre);
        if (!proveedor_id) {
          results.errores.push(`Fila ${i + 2}: proveedor no encontrado "${proveedorNombre}"`);
          continue;
        }

        const tipo_iva = getTipoIva(subtotal, monto_iva);

        if (tipoRaw === 'faccre' || tipoRaw === 'faccre+') {
          if (stmts.checkFact.get(proveedor_id, numero)) { results.omitidos++; continue; }
          const r = stmts.insertFact.run(proveedor_id, numero, fecha, moneda, 'credito', subtotal, monto_iva, total);
          stmts.insertFactItem.run(r.lastInsertRowid, subtotal, subtotal, tipo_iva, monto_iva, total);
          results.facturas++;
        } else if (tipoRaw === 'faccdo') {
          if (stmts.checkFact.get(proveedor_id, numero)) { results.omitidos++; continue; }
          const r = stmts.insertFact.run(proveedor_id, numero, fecha, moneda, 'contado', subtotal, monto_iva, total);
          stmts.insertFactItem.run(r.lastInsertRowid, subtotal, subtotal, tipo_iva, monto_iva, total);
          results.facturas++;
        } else if (tipoRaw === 'nc' || tipoRaw === 'nc+') {
          if (stmts.checkNC.get(proveedor_id, numero)) { results.omitidos++; continue; }
          const r = stmts.insertNC.run(proveedor_id, numero, fecha, moneda, subtotal, monto_iva, total);
          stmts.insertNCItem.run(r.lastInsertRowid, subtotal, subtotal, tipo_iva, monto_iva, total);
          results.ncs++;
        } else {
          results.errores.push(`Fila ${i + 2}: tipo desconocido "${row[col.tipo]}"`);
        }
      }
    });

    importAll(rows.slice(1).filter(r => r.some(c => c !== '')));
    res.json(results);
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
