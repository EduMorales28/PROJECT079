const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

// GET all
router.get('/', (req, res) => {
  const { search, activo } = req.query;
  let sql = 'SELECT * FROM proveedores WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (razon_social LIKE ? OR rut LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (activo !== undefined) { sql += ' AND activo = ?'; params.push(activo); }
  sql += ' ORDER BY razon_social';
  res.json(db.prepare(sql).all(...params));
});

// GET one
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
  res.json(p);
});

// POST create
router.post('/', (req, res) => {
  const { razon_social, rut, direccion } = req.body;
  if (!razon_social) return res.status(400).json({ error: 'Razón social es requerida' });
  const result = db.prepare(
    'INSERT INTO proveedores (razon_social, rut, direccion) VALUES (?, ?, ?)'
  ).run(razon_social, rut || '', direccion || '');
  res.json({ id: result.lastInsertRowid, ...req.body });
});

// PUT update
router.put('/:id', (req, res) => {
  const { razon_social, rut, direccion, activo } = req.body;
  db.prepare(
    `UPDATE proveedores SET razon_social=?, rut=?, direccion=?, activo=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(razon_social, rut || '', direccion || '', activo !== undefined ? activo : 1, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

// DELETE (soft)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE proveedores SET activo=0, updated_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// POST import from Excel
router.post('/importar-excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) return res.status(400).json({ error: 'El Excel está vacío o sin datos' });

    // Detect headers (first row)
    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const colRazon = headers.findIndex(h => h.includes('razon') || h.includes('razón') || h.includes('social'));
    const colRut = headers.findIndex(h => h.includes('rut'));
    const colDir = headers.findIndex(h => h.includes('direcci'));

    if (colRazon === -1) return res.status(400).json({ error: 'No se encontró columna "Razón Social"' });

    const insertOrUpdate = db.prepare(`
      INSERT INTO proveedores (razon_social, rut, direccion)
      VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `);

    const results = { insertados: 0, omitidos: 0, errores: [] };
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const razon = String(row[colRazon] || '').trim();
        if (!razon) { results.omitidos++; continue; }
        const rut = colRut >= 0 ? String(row[colRut] || '').trim() : '';
        const dir = colDir >= 0 ? String(row[colDir] || '').trim() : '';
        try {
          const r = insertOrUpdate.run(razon, rut, dir);
          if (r.changes) results.insertados++; else results.omitidos++;
        } catch (e) {
          results.errores.push(`Fila: ${razon} - ${e.message}`);
        }
      }
    });
    insertMany(rows.slice(1).filter(r => r.some(c => c !== null && c !== '')));

    const fs = require('fs');
    fs.unlinkSync(req.file.path);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
