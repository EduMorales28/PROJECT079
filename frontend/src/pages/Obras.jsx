import React, { useEffect, useState, useRef } from 'react';

const MONEDAS = ['UYU', 'USD', 'UI', 'UR'];
const EMPTY = { nombre: '', numero: '', ubicacion: '', monto_presupuestado: '', moneda: 'UYU' };

export default function Obras() {
  const [obras, setObras] = useState([]);
  const [search, setSearch] = useState('');
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef();

  const load = () => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (!mostrarInactivas) qs.set('activo', '1');
    fetch('/api/obras?' + qs).then(r => r.json()).then(setObras);
  };

  useEffect(() => { load(); }, [search, mostrarInactivas]);

  const openNew = () => {
    setForm(EMPTY); setEditId(null); setError(''); setModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };
  const openEdit = (o) => {
    setForm({ nombre: o.nombre, numero: o.numero, ubicacion: o.ubicacion || '', monto_presupuestado: o.monto_presupuestado, moneda: o.moneda });
    setEditId(o.id); setError(''); setModal(true);
  };
  const closeModal = () => { setModal(false); setError(''); };

  const save = async () => {
    setError('');
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/obras/${editId}` : '/api/obras';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.error) { setError(d.error); return; }
    setStatus(editId ? 'Obra actualizada.' : 'Obra creada.');
    closeModal(); load();
    setTimeout(() => setStatus(''), 3000);
  };

  const toggleActivo = async (o) => {
    if (o.activo && !confirm(`¿Desactivar la obra "${o.nombre}"?`)) return;
    await fetch(`/api/obras/${o.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...o, activo: o.activo ? 0 : 1 })
    });
    load();
  };

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="page-bar">
        <h2>Obras</h2>
        <button className="btn btn-primary" onClick={openNew}>Nueva Obra</button>
      </div>
      <div className="page-content">
        {status && <div className="alert alert-success">{status}</div>}
        <div className="search-bar">
          <input placeholder="Buscar por nombre o número..." value={search} onChange={e => setSearch(e.target.value)} />
          <label style={{ fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarInactivas} onChange={e => setMostrarInactivas(e.target.checked)} style={{ marginRight: 4 }} />
            Mostrar inactivas
          </label>
        </div>

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
              <th>% Consumido</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {obras.length === 0 && <tr><td colSpan={10} className="empty-msg">Sin resultados</td></tr>}
            {obras.map(o => {
              const pct = o.monto_presupuestado > 0 ? (o.total_gastado / o.monto_presupuestado) * 100 : 0;
              const over = o.total_gastado > o.monto_presupuestado;
              return (
                <tr key={o.id}>
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
                    <div className="progress-bar-container" style={{ width: 100 }}>
                      <div className={`progress-bar-fill${over ? ' over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      <div className="progress-bar-text">{pct.toFixed(1)}%</div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${o.activo ? 'badge-green' : 'badge-gray'}`}>
                      {o.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm mr4" onClick={() => openEdit(o)}>Editar</button>
                    <button className="btn btn-sm" style={{ background: o.activo ? '#fff3cd' : '#d4edda', borderColor: '#999' }}
                      onClick={() => toggleActivo(o)}>
                      {o.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box" style={{ width: 480 }}>
            <div className="modal-header">
              <span>{editId ? 'Editar Obra' : 'Nueva Obra'}</span>
              <button onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-row">
                <div className="form-group w120">
                  <label>N° Obra *</label>
                  <input ref={inputRef} value={form.numero} onChange={e => set('numero', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && save()} />
                </div>
                <div className="form-group flex1">
                  <label>Nombre *</label>
                  <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && save()} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group flex1">
                  <label>Ubicación</label>
                  <input value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group w120">
                  <label>Moneda</label>
                  <select value={form.moneda} onChange={e => set('moneda', e.target.value)}>
                    {MONEDAS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group w200">
                  <label>Monto Presupuestado</label>
                  <input type="number" step="0.01" value={form.monto_presupuestado}
                    onChange={e => set('monto_presupuestado', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={save}>Guardar</button>
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
