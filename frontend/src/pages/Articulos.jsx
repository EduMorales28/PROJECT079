import React, { useEffect, useState, useRef } from 'react';

const UNIDADES = ['Bidón','Bolsa de Portland','Día','Global','Kilos','Lata','Litros','Metros','Metros cuadrados','Metros cúbicos','Paq','Pomo','Rollo','Unidad','Varilla conformado 1','Varilla lisa 1'];
const MONEDAS = ['UYU', 'U$S'];
const IVAS = ['TB', 'TM', 'EX'];
const EMPTY = { codigo: '', descripcion: '', subgrupo: '', unidad: '', moneda: 'UYU', tipo_iva: 'TB' };

export default function Articulos() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroSubgrupo, setFiltroSubgrupo] = useState('');
  const [subgrupos, setSubgrupos] = useState([]);
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
    if (filtroSubgrupo) qs.set('subgrupo', filtroSubgrupo);
    if (!mostrarInactivos) qs.set('activo', '1');
    fetch('/api/articulos?' + qs).then(r => r.json()).then(setRows);
  };
  useEffect(() => { load(); }, [search, filtroSubgrupo, mostrarInactivos]);
  useEffect(() => {
    fetch('/api/articulos/subgrupos').then(r => r.json()).then(setSubgrupos);
  }, []);

  const openNew = () => {
    setForm(EMPTY); setEditId(null); setError(''); setModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };
  const openEdit = (a) => {
    setForm({ codigo: a.codigo, descripcion: a.descripcion, subgrupo: a.subgrupo || '', unidad: a.unidad || '', moneda: a.moneda || 'UYU', tipo_iva: a.tipo_iva || 'TB' });
    setEditId(a.id); setError(''); setModal(true);
  };
  const closeModal = () => { setModal(false); setError(''); };

  const save = async () => {
    setError('');
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/articulos/${editId}` : '/api/articulos';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json();
    if (d.error) { setError(d.error); return; }
    setStatus(editId ? 'Artículo actualizado.' : 'Artículo creado.');
    closeModal(); load();
    setTimeout(() => setStatus(''), 3000);
  };

  const toggleActivo = async (a) => {
    await fetch(`/api/articulos/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...a, activo: a.activo ? 0 : 1 })
    });
    load();
  };

  const importExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/articulos/importar-excel', { method: 'POST', body: fd });
    const d = await r.json();
    setImportResult(d);
    load();
    e.target.value = '';
  };

  const IVA_LABEL = { TB: 'Básico 22%', TM: 'Mínimo 10%', EX: 'Exento' };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="page-bar">
        <h2>Artículos</h2>
        <button className="btn btn-primary" onClick={openNew}>Nuevo Artículo</button>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Importar Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
      </div>
      <div className="page-content">
        {status && <div className="alert alert-success">{status}</div>}
        {importResult && (
          <div className={`alert ${importResult.error ? 'alert-error' : 'alert-success'}`}>
            {importResult.error
              ? importResult.error
              : `Importación: ${importResult.insertados} insertados, ${importResult.actualizados} actualizados.
                 ${importResult.errores?.length ? ' Errores: ' + importResult.errores.join(' | ') : ''}`}
            <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => setImportResult(null)}>×</button>
          </div>
        )}
        <div className="search-bar">
          <input placeholder="Buscar por código, descripción o subgrupo..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={filtroSubgrupo} onChange={e => setFiltroSubgrupo(e.target.value)} style={{ width: 180 }}>
            <option value="">Todos los subgrupos</option>
            {subgrupos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarInactivos} onChange={e => setMostrarInactivos(e.target.checked)} style={{ marginRight: 4 }} />
            Mostrar inactivos
          </label>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Subgrupo</th>
              <th>Unidad</th>
              <th>Moneda</th>
              <th>IVA</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="empty-msg">Sin resultados</td></tr>}
            {rows.map(a => (
              <tr key={a.id}>
                <td className="bold mono">{a.codigo}</td>
                <td>{a.descripcion}</td>
                <td>{a.subgrupo}</td>
                <td>{a.unidad}</td>
                <td>{a.moneda}</td>
                <td><span className={`badge ${a.tipo_iva === 'EX' ? 'badge-gray' : a.tipo_iva === 'TM' ? 'badge-yellow' : 'badge-blue'}`}>{a.tipo_iva}</span></td>
                <td><span className={`badge ${a.activo ? 'badge-green' : 'badge-gray'}`}>{a.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm mr4" onClick={() => openEdit(a)}>Editar</button>
                  <button className="btn btn-sm" style={{ background: a.activo ? '#fff3cd' : '#d4edda', borderColor: '#999' }}
                    onClick={() => toggleActivo(a)}>
                    {a.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-bar">{rows.length} artículo(s)</div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box" style={{ width: 520 }}>
            <div className="modal-header">
              <span>{editId ? 'Editar Artículo' : 'Nuevo Artículo'}</span>
              <button onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-row">
                <div className="form-group w120">
                  <label>Código *</label>
                  <input ref={inputRef} value={form.codigo} onChange={e => set('codigo', e.target.value)} />
                </div>
                <div className="form-group flex1">
                  <label>Descripción *</label>
                  <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group w150">
                  <label>Subgrupo</label>
                  <input value={form.subgrupo} onChange={e => set('subgrupo', e.target.value)} />
                </div>
                <div className="form-group w200">
                  <label>Unidad</label>
                  <select value={form.unidad} onChange={e => set('unidad', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group w120">
                  <label>Moneda</label>
                  <select value={form.moneda} onChange={e => set('moneda', e.target.value)}>
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group w150">
                  <label>Tipo IVA</label>
                  <select value={form.tipo_iva} onChange={e => set('tipo_iva', e.target.value)}>
                    {IVAS.map(v => <option key={v} value={v}>{v} - {IVA_LABEL[v]}</option>)}
                  </select>
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
