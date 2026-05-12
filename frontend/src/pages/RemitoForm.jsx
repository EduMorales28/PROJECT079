import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ArticuloBuscador from '../components/ArticuloBuscador';

function newItem() {
  return { articulo_id: null, codigo: '', descripcion: '', unidad: '', cantidad: '' };
}

export default function RemitoForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    proveedor_id: '', numero: '', fecha: new Date().toISOString().slice(0, 10), obra_id: ''
  });
  const [items, setItems] = useState([newItem()]);
  const [proveedores, setProveedores] = useState([]);
  const [obras, setObras] = useState([]);
  const [buscador, setBuscador] = useState(false);
  const [buscadorIdx, setBuscadorIdx] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores);
    fetch('/api/obras?activo=1').then(r => r.json()).then(setObras);
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    fetch(`/api/remitos/${id}`).then(r => r.json()).then(d => {
      setForm({
        proveedor_id: d.proveedor_id, numero: d.numero, fecha: d.fecha, obra_id: d.obra_id
      });
      setItems(d.items.length > 0
        ? d.items.map(i => ({ articulo_id: i.articulo_id, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad }))
        : [newItem()]
      );
    });
  }, [id]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateItem = (idx, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const openBuscador = (idx) => { setBuscadorIdx(idx); setBuscador(true); };
  const onSelectArticulo = (art) => {
    setItems(prev => {
      const copy = [...prev];
      copy[buscadorIdx] = { articulo_id: art.id, codigo: art.codigo, descripcion: art.descripcion, unidad: art.unidad, cantidad: copy[buscadorIdx].cantidad || '' };
      return copy;
    });
    setBuscador(false);
  };

  const save = async () => {
    setError('');
    if (!form.proveedor_id) { setError('Seleccione un proveedor'); return; }
    if (!form.numero) { setError('Ingrese número de remito'); return; }
    if (!form.fecha) { setError('Ingrese fecha'); return; }
    if (!form.obra_id) { setError('Seleccione una obra'); return; }
    const validItems = items.filter(it => it.descripcion && parseFloat(it.cantidad) > 0);
    if (validItems.length === 0) { setError('Agregue al menos un artículo con cantidad'); return; }
    setSaving(true);
    const payload = { ...form, items: validItems };
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/remitos/${id}` : '/api/remitos';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving(false);
    if (d.error) { setError(d.error); return; }
    nav('/remitos');
  };

  return (
    <div>
      <div className="page-bar">
        <h2>{isEdit ? `Editar Remito #${form.numero}` : 'Nuevo Remito'}</h2>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button className="btn btn-secondary" onClick={() => nav('/remitos')}>Cancelar</button>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="panel">
          <div className="panel-header">Datos del Remito</div>
          <div className="panel-body">
            <div className="form-row">
              <div className="form-group w300">
                <label>Proveedor *</label>
                <select value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
                  <option value="">-- Seleccionar --</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div className="form-group w120">
                <label>N° Remito *</label>
                <input value={form.numero} onChange={e => setF('numero', e.target.value)} />
              </div>
              <div className="form-group w130">
                <label>Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => setF('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group w300">
                <label>Obra *</label>
                <select value={form.obra_id} onChange={e => setF('obra_id', e.target.value)}>
                  <option value="">-- Seleccionar --</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.numero} - {o.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Artículos del Remito</span>
            <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Agregar Línea</button>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 90 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 130 }}>Unidad</th>
                  <th className="num" style={{ width: 100 }}>Cantidad</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center', color: '#888', fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <input value={item.codigo} onChange={e => updateItem(idx, 'codigo', e.target.value)} style={{ width: 55 }} />
                        <button className="btn btn-secondary btn-sm" onClick={() => openBuscador(idx)} style={{ padding: '1px 4px', fontSize: 11 }}>...</button>
                      </div>
                    </td>
                    <td><input value={item.descripcion} onChange={e => updateItem(idx, 'descripcion', e.target.value)} style={{ width: '100%', minWidth: 150 }} /></td>
                    <td><input value={item.unidad} onChange={e => updateItem(idx, 'unidad', e.target.value)} /></td>
                    <td><input type="number" step="0.001" min="0" value={item.cantidad} onChange={e => updateItem(idx, 'cantidad', e.target.value)} style={{ textAlign: 'right' }} /></td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Remito'}</button>
          <button className="btn btn-secondary" onClick={() => nav('/remitos')}>Cancelar</button>
        </div>
      </div>

      {buscador && <ArticuloBuscador onSelect={onSelectArticulo} onClose={() => setBuscador(false)} />}
    </div>
  );
}
