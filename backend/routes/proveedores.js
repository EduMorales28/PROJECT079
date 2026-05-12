const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.get('/', async (req, res) => {
  try {
    const { search, activo } = req.query;
    const params = [];
    let sql = 'SELECT * FROM proveedores WHERE 1=1';
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (razon_social ILIKE $${params.length} OR rut ILIKE $${params.length})`;
    }
    if (activo !== undefined) {
      params.push(activo);
      sql += ` AND activo = $${params.length}`;
    }
    sql += ' ORDER BY razon_social';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { razon_social, rut, direccion } = req.body;
  if (!razon_social) return res.status(400).json({ error: 'Razón social es requerida' });
  try {
    const { rows } = await db.query(
      'INSERT INTO proveedores (razon_social, rut, direccion) VALUES ($1, $2, $3) RETURNING id',
      [razon_social, rut || '', direccion || '']
    );
    res.json({ id: rows[0].id, ...req.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { razon_social, rut, direccion, activo } = req.body;
  try {
    await db.query(
      'UPDATE proveedores SET razon_social=$1, rut=$2, direccion=$3, activo=$4, updated_at=NOW() WHERE id=$5',
      [razon_social, rut || '', direccion || '', activo !== undefined ? activo : 1, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE proveedores SET activo=0, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/importar-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    fs.unlinkSync(req.file.path);

    if (rows.length < 2) return res.status(400).json({ error: 'El Excel está vacío o sin datos' });

    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const colRazon = headers.findIndex(h => h.includes('razon') || h.includes('razón') || h.includes('social'));
    const colRut = headers.findIndex(h => h.includes('rut'));
    const colDir = headers.findIndex(h => h.includes('direcci'));

    if (colRazon === -1) return res.status(400).json({ error: 'No se encontró columna "Razón Social"' });

    const results = { insertados: 0, omitidos: 0, errores: [] };
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== null && c !== ''));

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const row of dataRows) {
        const razon = String(row[colRazon] || '').trim();
        if (!razon) { results.omitidos++; continue; }
        const rut = colRut >= 0 ? String(row[colRut] || '').trim() : '';
        const dir = colDir >= 0 ? String(row[colDir] || '').trim() : '';
        const r = await client.query(
          'INSERT INTO proveedores (razon_social, rut, direccion) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [razon, rut, dir]
        );
        if (r.rowCount) results.insertados++; else results.omitidos++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json(results);
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
