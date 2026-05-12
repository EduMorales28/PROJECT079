import React, { useEffect, useState } from 'react';

export default function Reportes() {
  const [obras, setObras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [filtros, setFiltros] = useState({
    obra_id: '', proveedor_id: '', fecha_desde: '', fecha_hasta: '',
    moneda: '', condicion_pago: '', con_articulos: '0'
  });
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/obras?activo=1').then(r => r.json()).then(setObras);
    fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores);
  }, []);

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  const generar = async () => {
    setLoading(true);
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)));
    const r = await fetch('/api/reportes/gastos-obra?' + qs);
    const d = await r.json();
    setReporte(d);
    setLoading(false);
  };

  const descargarExcel = () => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)));
    window.open('/api/reportes/gastos-obra/excel?' + qs, '_blank');
  };

  const descargarPDF = () => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)));
    window.open('/api/reportes/gastos-obra/pdf?' + qs, '_blank');
  };

  const limpiarFiltros = () => setFiltros({ obra_id: '', proveedor_id: '', fecha_desde: '', fecha_hasta: '', moneda: '', condicion_pago: '', con_articulos: '0' });

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-bar">
        <h2>Reportes — Gastos por Obra</h2>
        {reporte && (
          <>
            <button className="btn btn-success" onClick={descargarExcel}>Exportar Excel</button>
            <button className="btn btn-secondary" onClick={descargarPDF}>Exportar PDF</button>
          </>
        )}
      </div>
      <div className="page-content">

        {/* Filtros */}
        <div className="panel">
          <div className="panel-header">Filtros</div>
          <div className="panel-body">
            <div className="form-row">
              <div className="form-group w250">
                <label>Obra</label>
                <select value={filtros.obra_id} onChange={e => setF('obra_id', e.target.value)}>
                  <option value="">Todas las obras</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.numero} - {o.nombre}</option>)}
                </select>
              </div>
              <div className="form-group w250">
                <label>Proveedor</label>
                <select value={filtros.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
                  <option value="">Todos los proveedores</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div className="form-group w100">
                <label>Moneda</label>
                <select value={filtros.moneda} onChange={e => setF('moneda', e.target.value)}>
                  <option value="">Todas</option>
                  {['UYU','USD','UI','UR'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group w120">
                <label>Cond. Pago</label>
                <select value={filtros.condicion_pago} onChange={e => setF('condicion_pago', e.target.value)}>
                  <option value="">Todas</option>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group w130">
                <label>Fecha Desde</label>
                <input type="date" value={filtros.fecha_desde} onChange={e => setF('fecha_desde', e.target.value)} />
              </div>
              <div className="form-group w130">
                <label>Fecha Hasta</label>
                <input type="date" value={filtros.fecha_hasta} onChange={e => setF('fecha_hasta', e.target.value)} />
              </div>
              <div className="form-group w200">
                <label>Detalle</label>
                <select value={filtros.con_articulos} onChange={e => setF('con_articulos', e.target.value)}>
                  <option value="0">Sin artículos (resumen)</option>
                  <option value="1">Con artículos (detallado)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={generar} disabled={loading}>
                  {loading ? 'Generando...' : 'Generar Reporte'}
                </button>
                <button className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
              </div>
            </div>
          </div>
        </div>

        {reporte && (
          <>
            {/* Resumen por obra */}
            <div className="panel">
              <div className="panel-header">Resumen por Obra</div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>N° Obra</th>
                      <th>Nombre</th>
                      <th>Moneda Ppto.</th>
                      <th className="num">Presupuesto</th>
                      <th className="num">Gastado</th>
                      <th className="num">Saldo</th>
                      <th>% Consumido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.obras.length === 0 && <tr><td colSpan={7} className="empty-msg">Sin datos para los filtros seleccionados</td></tr>}
                    {reporte.obras.map(o => {
                      const over = o.gastado > o.presupuesto;
                      const pct = Math.min(100, o.pct);
                      return (
                        <tr key={o.id}>
                          <td className="bold">{o.numero}</td>
                          <td>{o.nombre}</td>
                          <td>{o.moneda_presupuesto}</td>
                          <td className="num">{fmt(o.presupuesto)}</td>
                          <td className="num" style={{ color: over ? '#9b1c1c' : undefined }}>{fmt(o.gastado)}</td>
                          <td className="num" style={{ color: over ? '#9b1c1c' : '#1a5c1a', fontWeight: 'bold' }}>
                            {fmt(o.saldo)}
                          </td>
                          <td>
                            <div className="progress-bar-container" style={{ width: 110 }}>
                              <div className={`progress-bar-fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
                              <div className="progress-bar-text">{o.pct}%</div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {reporte.obras.length > 1 && (
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'right' }}>TOTALES:</td>
                        <td className="num">{fmt(reporte.obras.reduce((s, o) => s + o.presupuesto, 0))}</td>
                        <td className="num">{fmt(reporte.obras.reduce((s, o) => s + o.gastado, 0))}</td>
                        <td className="num">{fmt(reporte.obras.reduce((s, o) => s + o.saldo, 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Detalle */}
            {reporte.detalle.length > 0 && (
              <div className="panel">
                <div className="panel-header">Detalle ({reporte.detalle.length} registros)</div>
                <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
                  {filtros.con_articulos === '1' ? (
                    <table className="data-table" style={{ fontSize: 11, minWidth: 1000 }}>
                      <thead>
                        <tr>
                          <th>Obra</th>
                          <th>Factura</th>
                          <th>Remito</th>
                          <th>Fecha</th>
                          <th>Proveedor</th>
                          <th>Código</th>
                          <th>Descripción</th>
                          <th className="num">Cant.</th>
                          <th>Unidad</th>
                          <th className="num">Precio</th>
                          <th>IVA</th>
                          <th className="num">Monto IVA</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.detalle.map((d, i) => (
                          <tr key={i}>
                            <td>{d.obra_numero}</td>
                            <td className="mono">{d.factura || '—'}</td>
                            <td className="mono">{d.remito || '—'}</td>
                            <td>{d.fecha}</td>
                            <td>{d.proveedor}</td>
                            <td className="mono">{d.codigo}</td>
                            <td>{d.descripcion}</td>
                            <td className="num">{d.cantidad}</td>
                            <td>{d.unidad}</td>
                            <td className="num">{fmt(d.precio_unitario)}</td>
                            <td>{d.tipo_iva}</td>
                            <td className="num">{fmt(d.monto_iva)}</td>
                            <td className="num bold">{fmt(d.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={12} style={{ textAlign: 'right' }}>TOTAL:</td>
                          <td className="num bold">{fmt(reporte.detalle.reduce((s, d) => s + (d.total || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <table className="data-table" style={{ fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th>Obra</th>
                          <th>Factura</th>
                          <th>Fecha</th>
                          <th>Proveedor</th>
                          <th>Moneda</th>
                          <th>Cond. Pago</th>
                          <th className="num">Neto</th>
                          <th className="num">IVA</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.detalle.map((d, i) => (
                          <tr key={i}>
                            <td>{d.obra_numero}</td>
                            <td className="mono">{d.factura || '—'}</td>
                            <td>{d.fecha}</td>
                            <td>{d.proveedor}</td>
                            <td>{d.moneda}</td>
                            <td>{d.condicion_pago}</td>
                            <td className="num">{fmt(d.total_neto)}</td>
                            <td className="num">{fmt(d.total_iva)}</td>
                            <td className="num bold">{fmt(d.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'right' }}>TOTALES:</td>
                          <td className="num">{fmt(reporte.detalle.reduce((s, d) => s + (d.total_neto || 0), 0))}</td>
                          <td className="num">{fmt(reporte.detalle.reduce((s, d) => s + (d.total_iva || 0), 0))}</td>
                          <td className="num bold">{fmt(reporte.detalle.reduce((s, d) => s + (d.total || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
