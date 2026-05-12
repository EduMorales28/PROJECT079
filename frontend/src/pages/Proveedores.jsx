import React, { useEffect, useState, useRef } from 'react';

const EMPTY = { razon_social: '', rut: '', direccion: '' };

export default function Proveedores() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [importResult, setImportResult] = useState(null);
  const inputRef = useRef();
  const fileRef = useRef();

  const load = () => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (!mostrarInactivos) qs.set('activo', '1');
    fetch('/api/proveedores?' + qs).then(r => r.json()).then(setRows);
  };
  useEffect(() => { load(); }, [search, mostrarInactivos]);

  const openNew = () => {
    setForm(EMPTY); setEditId(null); setError(''); setModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };
  const openEdit = (p) => {
    setForm({ razon_social: p.razon_social, rut: p.rut || '', direccion: p.direccion || '' });
    setEditId(p.id); setError(''); setModal(true);
  };
  const closeModal = () => { setModal(false); setError(''); };

  const save = async () => {
    setError('');
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/proveedores/${editId}` : '/api/proveedores';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.error) { setError(d.error); return; }
    setStatus(editId ? 'Proveedor actualizado.' : 'Proveedor creado.');
    closeModal(); load();
    setTimeout(() => setStatus(''), 3000);
  };

  const toggleActivo = async (p) => {
    await fetch(`/api/proveedores/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, activo: p.activo ? 0 : 1 })
    });
    load();
  };

  const importExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/proveedores/importar-excel', { method: 'POST', body: fd });
    const d = await r.json();
    setImportResult(d);
    load();
    e.target.value = '';
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="page-bar">
        <h2>Proveedores</h2>
        <button className="btn btn-primary" onClick={openNew}>Nuevo Proveedor</button>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Importar Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
      </div>
      <div className="page-content">
        {status && <div className="alert alert-success">{status}</div>}
        {importResult && (
          <div className={`alert ${importResult.error ? 'alert-error' : 'alert-success'}`}>
            {importResult.error
              ? importResult.error
              : `Importación: ${importResult.insertados} insertados, ${importResult.omitidos} omitidos.
                 ${importResult.errores?.length ? ' Errores: ' + importResult.errores.join(' | ') : ''}`}
            <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => setImportResult(null)}>×</button>
          </div>
        )}
        <div className="search-bar">
          <input placeholder="Buscar por razón social o RUT..." value={search} onChange={e => setSearch(e.target.value)} />
          <label style={{ fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarInactivos} onChange={e => setMostrarInactivos(e.target.checked)} style={{ marginRight: 4 }} />
            Mostrar inactivos
          </label>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Razón Social</th>
              <th>RUT</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty-msg">Sin resultados</td></tr>}
            {rows.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td className="bold">{p.razon_social}</td>
                <td>{p.rut}</td>
                <td>{p.direccion}</td>
                <td><span className={`badge ${p.activo ? 'badge-green' : 'badge-gray'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm mr4" onClick={() => openEdit(p)}>Editar</button>
                  <button className="btn btn-sm" style={{ background: p.activo ? '#fff3cd' : '#d4edda', borderColor: '#999' }}
                    onClick={() => toggleActivo(p)}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-bar">{rows.length} proveedor(es)</div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box" style={{ width: 460 }}>
            <div className="modal-header">
              <span>{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</span>
              <button onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-row">
                <div className="form-group flex1">
                  <label>Razón Social *</label>
                  <input ref={inputRef} value={form.razon_social} onChange={e => set('razon_social', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && save()} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group w150">
                  <label>RUT</label>
                  <input value={form.rut} onChange={e => set('rut', e.target.value)} />
                </div>
                <div className="form-group flex1">
                  <label>Dirección</label>
                  <input value={form.direccion} onChange={e => set('direccion', e.target.value)} />
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
