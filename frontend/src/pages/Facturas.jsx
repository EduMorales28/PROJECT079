import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Facturas() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroMoneda, setFiltroMoneda] = useState('');
  const [filtroCondicion, setFiltroCondicion] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const nav = useNavigate();

  // Importación
  const [modalImport, setModalImport] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const load = () => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (filtroMoneda) qs.set('moneda', filtroMoneda);
    if (filtroCondicion) qs.set('condicion_pago', filtroCondicion);
    if (fechaDesde) qs.set('fecha_desde', fechaDesde);
    if (fechaHasta) qs.set('fecha_hasta', fechaHasta);
    if (filtroProveedor) qs.set('proveedor_id', filtroProveedor);
    fetch('/api/facturas?' + qs).then(r => r.json()).then(setRows);
  };

  useEffect(() => { load(); }, [search, filtroMoneda, filtroCondicion, fechaDesde, fechaHasta, filtroProveedor]);
  useEffect(() => {
    fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores);
  }, []);

  const anular = async (id, numero) => {
    if (!confirm(`¿Anular la factura ${numero}? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/facturas/${id}`, { method: 'DELETE' });
    load();
  };

  const openImport = () => {
    setImportResult(null);
    setModalImport(true);
  };

  const doImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/importar/datos', { method: 'POST', body: fd });
    const d = await r.json();
    setImportResult(d);
    setImporting(false);
    e.target.value = '';
    if (!d.error) load();
  };

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totales = rows.reduce((acc, r) => ({
    neto: acc.neto + r.total_neto,
    iva: acc.iva + r.total_iva,
    total: acc.total + r.total
  }), { neto: 0, iva: 0, total: 0 });

  return (
    <div>
      <div className="page-bar">
        <h2>Facturas</h2>
        <button className="btn btn-primary" onClick={() => nav('/facturas/nueva')}>Nueva Factura</button>
        <button className="btn btn-secondary" onClick={openImport}>Importar desde planilla</button>
      </div>
      <div className="page-content">
        <div className="search-bar">
          <input placeholder="N° factura o proveedor..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} style={{ width: 200 }}>
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
          <select value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)} style={{ width: 90 }}>
            <option value="">Moneda</option>
            {['UYU','USD','UI','UR'].map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={filtroCondicion} onChange={e => setFiltroCondicion(e.target.value)} style={{ width: 100 }}>
            <option value="">Cond. pago</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
          <label style={{ fontSize: 12 }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ width: 130 }} />
          <label style={{ fontSize: 12 }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ width: 130 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFiltroMoneda(''); setFiltroCondicion(''); setFechaDesde(''); setFechaHasta(''); setFiltroProveedor(''); }}>Limpiar</button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>N° Factura</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Obra</th>
              <th>Moneda</th>
              <th>Cond. Pago</th>
              <th className="num">Neto</th>
              <th className="num">IVA</th>
              <th className="num">Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="empty-msg">Sin facturas registradas</td></tr>}
            {rows.map(f => (
              <tr key={f.id}>
                <td className="bold mono">{f.numero}</td>
                <td>{f.fecha}</td>
                <td>{f.proveedor_nombre}</td>
                <td>{f.obra_numero ? `${f.obra_numero} - ${f.obra_nombre}` : <span style={{ color: '#888' }}>—</span>}</td>
                <td>{f.moneda}</td>
                <td>
                  <span className={`badge ${f.condicion_pago === 'contado' ? 'badge-green' : 'badge-blue'}`}>
                    {f.condicion_pago === 'contado' ? `Contado${f.medio_pago ? ' / ' + f.medio_pago : ''}` : 'Crédito'}
                  </span>
                </td>
                <td className="num">{fmt(f.total_neto)}</td>
                <td className="num">{fmt(f.total_iva)}</td>
                <td className="num bold">{fmt(f.total)}</td>
                <td>
                  <button className="btn btn-secondary btn-sm mr4" onClick={() => nav(`/facturas/${f.id}`)}>Ver/Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => anular(f.id, f.numero)}>Anular</button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 'bold' }}>TOTALES:</td>
                <td className="num">{fmt(totales.neto)}</td>
                <td className="num">{fmt(totales.iva)}</td>
                <td className="num bold">{fmt(totales.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        <div className="status-bar">{rows.length} factura(s)</div>
      </div>

      {/* Modal de importación */}
      {modalImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalImport(false)}>
          <div className="modal-box" style={{ width: 520 }}>
            <div className="modal-header">
              <span>Importar datos desde planilla</span>
              <button onClick={() => setModalImport(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#555' }}>
                Importa facturas (FACCRE, FACCRE+, FACCDO) y notas de crédito (NC, NC+) desde un Excel.<br />
                Columnas requeridas: <strong>proveedor, fecha, tipo, numero, moneda, subtotal, iva, total</strong><br />
                El proveedor se busca por razón social — debe coincidir con los proveedores ya cargados.
              </p>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <button
                  className="btn btn-primary"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  {importing ? 'Importando...' : 'Seleccionar archivo Excel'}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={doImport} />
              </div>

              {importResult && (
                <div className={`alert ${importResult.error ? 'alert-error' : 'alert-success'}`} style={{ marginTop: 12 }}>
                  {importResult.error ? (
                    <span>{importResult.error}</span>
                  ) : (
                    <div>
                      <div><strong>Importación completada:</strong></div>
                      <div>• Facturas importadas: <strong>{importResult.facturas}</strong></div>
                      <div>• Notas de crédito importadas: <strong>{importResult.ncs}</strong></div>
                      <div>• Omitidos (duplicados o vacíos): <strong>{importResult.omitidos}</strong></div>
                      {importResult.errores?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <strong>Filas con error:</strong>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                            {importResult.errores.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalImport(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
