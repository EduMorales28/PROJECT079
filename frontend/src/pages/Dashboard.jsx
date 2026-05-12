import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    fetch('/api/obras?activo=1')
      .then(r => r.json())
      .then(d => { setObras(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-bar">
        <h2>Inicio — Resumen de Obras</h2>
        <button className="btn btn-primary" onClick={() => nav('/facturas/nueva')}>Nueva Factura</button>
        <button className="btn btn-secondary" onClick={() => nav('/remitos/nuevo')}>Nuevo Remito</button>
        <button className="btn btn-secondary" onClick={() => nav('/notas-credito/nueva')}>Nueva N.C.</button>
      </div>
      <div className="page-content">
        {loading ? <div className="loading">Cargando...</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>N° Obra</th>
                <th>Nombre</th>
                <th>Ubicación</th>
                <th>Moneda</th>
                <th className="num">Presupuesto</th>
                <th className="num">Gastado</th>
                <th className="num">Saldo</th>
                <th>Consumido</th>
              </tr>
            </thead>
            <tbody>
              {obras.length === 0 && (
                <tr><td colSpan={8} className="empty-msg">No hay obras registradas. <a href="/obras" style={{color:'#1c3a6b'}}>Crear primera obra</a></td></tr>
              )}
              {obras.map(o => {
                const pct = o.monto_presupuestado > 0
                  ? Math.min(100, (o.total_gastado / o.monto_presupuestado) * 100)
                  : 0;
                const over = o.total_gastado > o.monto_presupuestado;
                return (
                  <tr key={o.id} onClick={() => nav('/obras')} style={{ cursor: 'pointer' }}>
                    <td className="bold">{o.numero}</td>
                    <td>{o.nombre}</td>
                    <td>{o.ubicacion}</td>
                    <td>{o.moneda}</td>
                    <td className="num">{fmt(o.monto_presupuestado)}</td>
                    <td className="num" style={{ color: over ? '#9b1c1c' : undefined }}>{fmt(o.total_gastado)}</td>
                    <td className="num" style={{ color: over ? '#9b1c1c' : '#1a5c1a', fontWeight: 'bold' }}>
                      {fmt(o.monto_presupuestado - o.total_gastado)}
                    </td>
                    <td>
                      <div className="progress-bar-container" style={{ width: 120 }}>
                        <div className={`progress-bar-fill${over ? ' over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        <div className="progress-bar-text">{pct.toFixed(1)}%</div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="panel" style={{ flex: 1, minWidth: 200 }}>
            <div className="panel-header">Accesos Rápidos</div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="btn btn-primary" onClick={() => nav('/facturas/nueva')}>+ Nueva Factura</button>
              <button className="btn btn-secondary" onClick={() => nav('/remitos/nuevo')}>+ Nuevo Remito</button>
              <button className="btn btn-secondary" onClick={() => nav('/notas-credito/nueva')}>+ Nueva Nota de Crédito</button>
              <button className="btn btn-secondary" onClick={() => nav('/proveedores')}>Ver Proveedores</button>
              <button className="btn btn-secondary" onClick={() => nav('/articulos')}>Ver Artículos</button>
              <button className="btn btn-secondary" onClick={() => nav('/reportes')}>Ver Reportes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
