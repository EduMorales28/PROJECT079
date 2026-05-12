const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

const UNIDADES_VALIDAS = [
  'Bidón','Bolsa de Portland','Día','Global','Kilos','Lata','Litros',
  'Metros','Metros cuadrados','Metros cúbicos','Paq','Pomo','Rollo',
  'Unidad','Varilla conformado 1','Varilla lisa 1'
];
const MONEDAS_VALIDAS = ['UYU', 'U$S'];
const IVA_VALIDOS = ['TB', 'TM', 'EX'];

// GET all with optional search
router.get('/', (req, res) => {
  const { search, subgrupo, activo } = req.query;
  let sql = 'SELECT * FROM articulos WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (codigo LIKE ? OR descripcion LIKE ? OR subgrupo LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (subgrupo) { sql += ' AND subgrupo = ?'; params.push(subgrupo); }
  if (activo !== undefined) { sql += ' AND activo = ?'; params.push(activo); }
  sql += ' ORDER BY codigo';
  res.json(db.prepare(sql).all(...params));
});

// GET subgrupos distinct
router.get('/subgrupos', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT subgrupo FROM articulos WHERE subgrupo IS NOT NULL AND subgrupo != "" ORDER BY subgrupo').all();
  res.json(rows.map(r => r.subgrupo));
});

// GET one
router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM articulos WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Artículo no encontrado' });
  res.json(a);
});

// POST create
router.post('/', (req, res) => {
  const { codigo, descripcion, subgrupo, unidad, moneda, tipo_iva } = req.body;
  if (!codigo || !descripcion) return res.status(400).json({ error: 'Código y descripción son requeridos' });
  try {
    const result = db.prepare(
      'INSERT INTO articulos (codigo, descripcion, subgrupo, unidad, moneda, tipo_iva) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(codigo, descripcion, subgrupo || '', unidad || '', moneda || 'UYU', tipo_iva || 'TB');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El código de artículo ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// PUT update
router.put('/:id', (req, res) => {
  const { codigo, descripcion, subgrupo, unidad, moneda, tipo_iva, activo } = req.body;
  try {
    db.prepare(
      `UPDATE articulos SET codigo=?, descripcion=?, subgrupo=?, unidad=?, moneda=?, tipo_iva=?, activo=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(codigo, descripcion, subgrupo || '', unidad || '', moneda || 'UYU', tipo_iva || 'TB', activo !== undefined ? activo : 1, req.params.id);
    res.json({ id: req.params.id, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El código ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE (soft)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE articulos SET activo=0, updated_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// POST import from Excel
router.post('/importar-excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'El Excel está vacío' });

    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const col = {
      codigo:      headers.findIndex(h => h.includes('codi')),
      descripcion: headers.findIndex(h => h.includes('descrip')),
      subgrupo:    headers.findIndex(h => h.includes('subgrup')),
      unidad:      headers.findIndex(h => h.includes('unidad')),
      moneda:      headers.findIndex(h => h.includes('moneda')),
      tipo_iva:    headers.findIndex(h => h.includes('iva')),
    };

    const missing = Object.entries(col).filter(([k, v]) => v === -1).map(([k]) => k);
    if (missing.length > 0) return res.status(400).json({ error: `Columnas faltantes: ${missing.join(', ')}` });

    const upsert = db.prepare(`
      INSERT INTO articulos (codigo, descripcion, subgrupo, unidad, moneda, tipo_iva)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET
        descripcion=excluded.descripcion,
        subgrupo=excluded.subgrupo,
        unidad=excluded.unidad,
        moneda=excluded.moneda,
        tipo_iva=excluded.tipo_iva,
        updated_at=datetime('now','localtime')
    `);

    const results = { insertados: 0, actualizados: 0, errores: [] };

    const runAll = db.transaction((dataRows) => {
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const codigo = String(row[col.codigo] || '').trim();
        const descripcion = String(row[col.descripcion] || '').trim();
        if (!codigo || !descripcion) continue;

        const unidadRaw = String(row[col.unidad] || '').trim();
        const monedaRaw = String(row[col.moneda] || '').trim();
        const tipo_iva = String(row[col.tipo_iva] || '').trim().toUpperCase();
        const subgrupo = String(row[col.subgrupo] || '').trim();

        // Normalizar moneda (case-insensitive). Unidad se acepta tal cual.
        const unidad = UNIDADES_VALIDAS.find(u => u.toLowerCase() === unidadRaw.toLowerCase()) || unidadRaw;
        const moneda = MONEDAS_VALIDAS.find(m => m.toLowerCase() === monedaRaw.toLowerCase()) || monedaRaw;

        const rowErrors = [];
        if (monedaRaw && !MONEDAS_VALIDAS.some(m => m.toLowerCase() === monedaRaw.toLowerCase())) rowErrors.push(`moneda inválida: "${monedaRaw}"`);
        if (tipo_iva && !IVA_VALIDOS.includes(tipo_iva)) rowErrors.push(`IVA inválido: "${tipo_iva}"`);

        if (rowErrors.length > 0) {
          results.errores.push(`Fila ${i + 2} (${codigo}): ${rowErrors.join(', ')}`);
          continue;
        }

        const exists = db.prepare('SELECT id FROM articulos WHERE codigo = ?').get(codigo);
        upsert.run(codigo, descripcion, subgrupo, unidad, moneda || 'UYU', tipo_iva || 'TB');
        if (exists) results.actualizados++; else results.insertados++;
      }
    });

    runAll(rows.slice(1).filter(r => r.some(c => c !== '')));
    fs.unlinkSync(req.file.path);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
