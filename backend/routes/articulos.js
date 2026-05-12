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

router.get('/', async (req, res) => {
  try {
    const { search, subgrupo, activo } = req.query;
    const params = [];
    let sql = 'SELECT * FROM articulos WHERE 1=1';
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (codigo ILIKE $${params.length} OR descripcion ILIKE $${params.length} OR subgrupo ILIKE $${params.length})`;
    }
    if (subgrupo) {
      params.push(subgrupo);
      sql += ` AND subgrupo = $${params.length}`;
    }
    if (activo !== undefined) {
      params.push(activo);
      sql += ` AND activo = $${params.length}`;
    }
    sql += ' ORDER BY codigo';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/subgrupos', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT DISTINCT subgrupo FROM articulos WHERE subgrupo IS NOT NULL AND subgrupo != '' ORDER BY subgrupo"
    );
    res.json(rows.map(r => r.subgrupo));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM articulos WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Artículo no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { codigo, descripcion, subgrupo, unidad, moneda, tipo_iva } = req.body;
  if (!codigo || !descripcion) return res.status(400).json({ error: 'Código y descripción son requeridos' });
  try {
    const { rows } = await db.query(
      'INSERT INTO articulos (codigo, descripcion, subgrupo, unidad, moneda, tipo_iva) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [codigo, descripcion, subgrupo || '', unidad || '', moneda || 'UYU', tipo_iva || 'TB']
    );
    res.json({ id: rows[0].id, ...req.body });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'El código de artículo ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { codigo, descripcion, subgrupo, unidad, moneda, tipo_iva, activo } = req.body;
  try {
    await db.query(
      'UPDATE articulos SET codigo=$1, descripcion=$2, subgrupo=$3, unidad=$4, moneda=$5, tipo_iva=$6, activo=$7, updated_at=NOW() WHERE id=$8',
      [codigo, descripcion, subgrupo || '', unidad || '', moneda || 'UYU', tipo_iva || 'TB', activo !== undefined ? activo : 1, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'El código ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE articulos SET activo=0, updated_at=NOW() WHERE id=$1', [req.params.id]);
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
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    fs.unlinkSync(req.file.path);

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

    const results = { insertados: 0, actualizados: 0, errores: [] };
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const codigo = String(row[col.codigo] || '').trim();
        const descripcion = String(row[col.descripcion] || '').trim();
        if (!codigo || !descripcion) continue;

        const unidadRaw = String(row[col.unidad] || '').trim();
        const monedaRaw = String(row[col.moneda] || '').trim();
        const tipo_iva = String(row[col.tipo_iva] || '').trim().toUpperCase();
        const subgrupo = String(row[col.subgrupo] || '').trim();

        const unidad = UNIDADES_VALIDAS.find(u => u.toLowerCase() === unidadRaw.toLowerCase()) || unidadRaw;
        const moneda = MONEDAS_VALIDAS.find(m => m.toLowerCase() === monedaRaw.toLowerCase()) || monedaRaw;

        const rowErrors = [];
        if (monedaRaw && !MONEDAS_VALIDAS.some(m => m.toLowerCase() === monedaRaw.toLowerCase())) rowErrors.push(`moneda inválida: "${monedaRaw}"`);
        if (tipo_iva && !IVA_VALIDOS.includes(tipo_iva)) rowErrors.push(`IVA inválido: "${tipo_iva}"`);

        if (rowErrors.length > 0) {
          results.errores.push(`Fila ${i + 2} (${codigo}): ${rowErrors.join(', ')}`);
          continue;
        }

        const { rows: exists } = await client.query('SELECT id FROM articulos WHERE codigo = $1', [codigo]);
        await client.query(`
          INSERT INTO articulos (codigo, descripcion, subgrupo, unidad, moneda, tipo_iva)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (codigo) DO UPDATE SET
            descripcion=EXCLUDED.descripcion, subgrupo=EXCLUDED.subgrupo,
            unidad=EXCLUDED.unidad, moneda=EXCLUDED.moneda,
            tipo_iva=EXCLUDED.tipo_iva, updated_at=NOW()
        `, [codigo, descripcion, subgrupo, unidad, moneda || 'UYU', tipo_iva || 'TB']);
        if (exists.length) results.actualizados++; else results.insertados++;
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
