import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotasCredito() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const nav = useNavigate();

  const load = () => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (fechaDesde) qs.set('fecha_desde', fechaDesde);
    if (fechaHasta) qs.set('fecha_hasta', fechaHasta);
    if (filtroProveedor) qs.set('proveedor_id', filtroProveedor);
    fetch('/api/notas-credito?' + qs).then(r => r.json()).then(setRows);
  };

  useEffect(() => { load(); }, [search, fechaDesde, fechaHasta, filtroProveedor]);
  useEffect(() => { fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores); }, []);

  const eliminar = async (id, numero) => {
    if (!confirm(`¿Eliminar la Nota de Crédito ${numero}?`)) return;
    await fetch(`/api/notas-credito/${id}`, { method: 'DELETE' });
    load();
  };

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-bar">
        <h2>Notas de Crédito</h2>
        <button className="btn btn-primary" onClick={() => nav('/notas-credito/nueva')}>Nueva N.C.</button>
      </div>
      <div className="page-content">
        <div className="search-bar">
          <input placeholder="N° NC o proveedor..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} style={{ width: 200 }}>
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ width: 130 }} />
          <label style={{ fontSize: 12 }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ width: 130 }} />
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>N° NC</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Factura Ref.</th>
              <th>Moneda</th>
              <th className="num">Neto</th>
              <th className="num">IVA</th>
              <th className="num">Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="empty-msg">Sin notas de crédito registradas</td></tr>}
            {rows.map(nc => (
              <tr key={nc.id}>
                <td className="bold mono">{nc.numero}</td>
                <td>{nc.fecha}</td>
                <td>{nc.proveedor_nombre}</td>
                <td>{nc.factura_numero || <span style={{ color: '#888' }}>—</span>}</td>
                <td>{nc.moneda}</td>
                <td className="num">{fmt(nc.total_neto)}</td>
                <td className="num">{fmt(nc.total_iva)}</td>
                <td className="num bold" style={{ color: '#9b1c1c' }}>({fmt(nc.total)})</td>
                <td>
                  <button className="btn btn-secondary btn-sm mr4" onClick={() => nav(`/notas-credito/${nc.id}`)}>Ver</button>
                  <button className="btn btn-danger btn-sm" onClick={() => eliminar(nc.id, nc.numero)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-bar">{rows.length} nota(s) de crédito</div>
      </div>
    </div>
  );
}
