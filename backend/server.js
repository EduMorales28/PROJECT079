require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Routes
app.use('/api/obras', require('./routes/obras'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/articulos', require('./routes/articulos'));
app.use('/api/facturas', require('./routes/facturas'));
app.use('/api/remitos', require('./routes/remitos'));
app.use('/api/notas-credito', require('./routes/notasCredito'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/importar', require('./routes/importar'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`\n  Obra 079 Backend corriendo en http://localhost:${PORT}\n`);
});
