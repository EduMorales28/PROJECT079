import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Remitos() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [obras, setObras] = useState([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const nav = useNavigate();

  const load = () => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (filtroEstado) qs.set('estado', filtroEstado);
    if (filtroObra) qs.set('obra_id', filtroObra);
    if (fechaDesde) qs.set('fecha_desde', fechaDesde);
    if (fechaHasta) qs.set('fecha_hasta', fechaHasta);
    fetch('/api/remitos?' + qs).then(r => r.json()).then(setRows);
  };

  useEffect(() => { load(); }, [search, filtroEstado, filtroObra, fechaDesde, fechaHasta]);
  useEffect(() => { fetch('/api/obras?activo=1').then(r => r.json()).then(setObras); }, []);

  const eliminar = async (id, numero) => {
    if (!confirm(`¿Eliminar el remito ${numero}?`)) return;
    const r = await fetch(`/api/remitos/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    load();
  };

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ESTADO_BADGE = {
    pendiente: 'badge-yellow',
    parcialmente_facturado: 'badge-blue',
    facturado: 'badge-green'
  };
  const ESTADO_LABEL = {
    pendiente: 'Pendiente',
    parcialmente_facturado: 'Parc. Facturado',
    facturado: 'Facturado'
  };

  return (
    <div>
      <div className="page-bar">
        <h2>Remitos</h2>
        <button className="btn btn-primary" onClick={() => nav('/remitos/nuevo')}>Nuevo Remito</button>
      </div>
      <div className="page-content">
        <div className="search-bar">
          <input placeholder="N° remito o proveedor..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} style={{ width: 200 }}>
            <option value="">Todas las obras</option>
            {obras.map(o => <option key={o.id} value={o.id}>{o.numero} - {o.nombre}</option>)}
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 130 }}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="facturado">Facturado</option>
          </select>
          <label style={{ fontSize: 12 }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ width: 130 }} />
          <label style={{ fontSize: 12 }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ width: 130 }} />
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>N° Remito</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Obra</th>
              <th>Moneda</th>
              <th>Factura</th>
              <th>Estado</th>
              <th className="num">Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="empty-msg">Sin remitos registrados</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="bold mono">{r.numero}</td>
                <td>{r.fecha}</td>
                <td>{r.proveedor_nombre}</td>
                <td>{r.obra_numero} - {r.obra_nombre}</td>
                <td>{r.moneda}</td>
                <td>{r.factura_numero || <span style={{ color: '#888' }}>—</span>}</td>
                <td>
                  <span className={`badge ${ESTADO_BADGE[r.estado] || 'badge-gray'}`}>
                    {ESTADO_LABEL[r.estado] || r.estado}
                  </span>
                </td>
                <td className="num">{fmt(r.total)}</td>
                <td>
                  <button className="btn btn-secondary btn-sm mr4" onClick={() => nav(`/remitos/${r.id}`)}>Ver/Editar</button>
                  {r.estado !== 'facturado' && (
                    <button className="btn btn-danger btn-sm" onClick={() => eliminar(r.id, r.numero)}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-bar">{rows.length} remito(s)</div>
      </div>
    </div>
  );
}
