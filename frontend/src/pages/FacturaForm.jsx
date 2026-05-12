import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ArticuloBuscador from '../components/ArticuloBuscador';

const IVA_RATES = { TB: 0.22, TM: 0.10, EX: 0 };
const IVA_LABEL = { TB: 'TB 22%', TM: 'TM 10%', EX: 'EX 0%' };
const MEDIOS_PAGO = ['Caja', 'Banco', 'Transferencia', 'Efectivo', 'Cheque'];

function newItem() {
  return { articulo_id: null, codigo: '', descripcion: '', unidad: '', cantidad: '', precio_unitario: '', tipo_iva: 'TB', precio_total: 0, monto_iva: 0, total: 0 };
}

function calcItem(item) {
  const cantidad = parseFloat(item.cantidad) || 0;
  const precio_unitario = parseFloat(item.precio_unitario) || 0;
  const precio_total = cantidad * precio_unitario;
  const rate = IVA_RATES[item.tipo_iva] || 0;
  const monto_iva = precio_total * rate;
  const total = precio_total + monto_iva;
  return { ...item, precio_total, monto_iva, total };
}

const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export default function FacturaForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    proveedor_id: '', numero: '', fecha: new Date().toISOString().slice(0, 10),
    moneda: 'UYU', obra_id: '', condicion_pago: 'credito', medio_pago: ''
  });
  const [items, setItems] = useState([newItem()]);
  const [proveedores, setProveedores] = useState([]);
  const [obras, setObras] = useState([]);

  // Remitos
  const [remitosDisponibles, setRemitosDisponibles] = useState([]);
  const [selectedRemitoIds, setSelectedRemitoIds] = useState([]);
  const [remitosVinculados, setRemitosVinculados] = useState([]);
  const [remitoItemsCache, setRemitoItemsCache] = useState({}); // { [remitoId]: [items] }

  const [buscador, setBuscador] = useState(false);
  const [buscadorIdx, setBuscadorIdx] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores);
    fetch('/api/obras?activo=1').then(r => r.json()).then(setObras);
  }, []);

  // Cargar remitos pendientes cuando cambia el proveedor, y pre-cargar sus items
  useEffect(() => {
    if (!form.proveedor_id) {
      setRemitosDisponibles([]);
      setSelectedRemitoIds([]);
      setRemitoItemsCache({});
      return;
    }
    fetch(`/api/remitos?proveedor_id=${form.proveedor_id}&estado=pendiente`)
      .then(r => r.json())
      .then(async (data) => {
        setRemitosDisponibles(data);
        // Pre-cargar items de todos los remitos disponibles
        const results = await Promise.all(
          data.map(r => fetch(`/api/remitos/${r.id}`).then(res => res.json()))
        );
        const cache = {};
        results.forEach(d => { cache[d.id] = d.items || []; });
        setRemitoItemsCache(prev => ({ ...prev, ...cache }));
      });
  }, [form.proveedor_id]);

  // Cargar factura existente al editar
  useEffect(() => {
    if (!isEdit) return;
    fetch(`/api/facturas/${id}`).then(r => r.json()).then(async d => {
      setForm({
        proveedor_id: d.proveedor_id, numero: d.numero, fecha: d.fecha,
        moneda: d.moneda, obra_id: d.obra_id || '', condicion_pago: d.condicion_pago, medio_pago: d.medio_pago || ''
      });
      setItems(d.items.length > 0 ? d.items : [newItem()]);
      setRemitosVinculados(d.remitos || []);
      setSelectedRemitoIds((d.remitos || []).map(r => r.id));
      // Pre-cargar items de remitos vinculados
      if (d.remitos && d.remitos.length > 0) {
        const results = await Promise.all(
          d.remitos.map(r => fetch(`/api/remitos/${r.id}`).then(res => res.json()))
        );
        const cache = {};
        results.forEach(rd => { cache[rd.id] = rd.items || []; });
        setRemitoItemsCache(prev => ({ ...prev, ...cache }));
      }
    });
  }, [id]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateItem = (idx, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[idx] = calcItem({ ...copy[idx], [field]: value });
      return copy;
    });
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const openBuscador = (idx) => { setBuscadorIdx(idx); setBuscador(true); };
  const onSelectArticulo = (art) => {
    setItems(prev => {
      const copy = [...prev];
      copy[buscadorIdx] = calcItem({
        ...copy[buscadorIdx],
        articulo_id: art.id, codigo: art.codigo, descripcion: art.descripcion,
        unidad: art.unidad, tipo_iva: art.tipo_iva
      });
      return copy;
    });
    setBuscador(false);
  };

  const toggleRemito = (remitoId) => {
    setSelectedRemitoIds(prev =>
      prev.includes(remitoId) ? prev.filter(x => x !== remitoId) : [...prev, remitoId]
    );
  };

  // Todos los remitos: vinculados (edición) + disponibles pendientes sin duplicar
  const todosLosRemitos = [
    ...remitosVinculados,
    ...remitosDisponibles.filter(r => !remitosVinculados.some(rv => rv.id === r.id))
  ];

  const totalesItems = items.reduce((acc, it) => ({
    neto: acc.neto + (it.precio_total || 0),
    iva: acc.iva + (it.monto_iva || 0),
    total: acc.total + (it.total || 0)
  }), { neto: 0, iva: 0, total: 0 });

  // Calcular comparación de cantidades por artículo
  const factQtyMap = {};
  for (const item of items.filter(i => i.descripcion && parseFloat(i.cantidad) > 0)) {
    const key = item.articulo_id ? `id:${item.articulo_id}` : `desc:${item.descripcion}`;
    if (!factQtyMap[key]) factQtyMap[key] = { qty: 0, desc: item.descripcion, unidad: item.unidad };
    factQtyMap[key].qty += parseFloat(item.cantidad) || 0;
  }

  const remQtyMap = {};
  for (const rid of selectedRemitoIds) {
    for (const item of (remitoItemsCache[rid] || [])) {
      const key = item.articulo_id ? `id:${item.articulo_id}` : `desc:${item.descripcion}`;
      if (!remQtyMap[key]) remQtyMap[key] = { qty: 0, desc: item.descripcion, unidad: item.unidad };
      remQtyMap[key].qty += parseFloat(item.cantidad) || 0;
    }
  }

  const compKeys = [...new Set([...Object.keys(factQtyMap), ...Object.keys(remQtyMap)])];
  const hayRemitos = selectedRemitoIds.length > 0;
  const comparacionOk = hayRemitos && compKeys.length > 0 && compKeys.every(key => {
    const fQty = factQtyMap[key]?.qty || 0;
    const rQty = remQtyMap[key]?.qty || 0;
    return Math.abs(fQty - rQty) <= 0.001;
  });

  const save = async () => {
    setError('');
    if (!form.proveedor_id) { setError('Seleccione un proveedor'); return; }
    if (!form.numero) { setError('Ingrese número de factura'); return; }
    if (!form.fecha) { setError('Ingrese fecha'); return; }

    const validItems = items.filter(it => it.descripcion && parseFloat(it.cantidad) > 0);
    setSaving(true);
    const payload = { ...form, items: validItems, remito_ids: selectedRemitoIds };
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/facturas/${id}` : '/api/facturas';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving(false);
    if (d.error) { setError(d.error); return; }
    nav('/facturas');
  };

  return (
    <div>
      <div className="page-bar">
        <h2>{isEdit ? `Editar Factura #${form.numero}` : 'Nueva Factura'}</h2>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button className="btn btn-secondary" onClick={() => nav('/facturas')}>Cancelar</button>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Cabecera */}
        <div className="panel">
          <div className="panel-header">Datos de la Factura</div>
          <div className="panel-body">
            <div className="form-row">
              <div className="form-group w300">
                <label>Proveedor *</label>
                <select value={form.proveedor_id} onChange={e => { setF('proveedor_id', e.target.value); setSelectedRemitoIds([]); }}>
                  <option value="">-- Seleccionar --</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div className="form-group w120">
                <label>N° Factura *</label>
                <input value={form.numero} onChange={e => setF('numero', e.target.value)} />
              </div>
              <div className="form-group w130">
                <label>Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => setF('fecha', e.target.value)} />
              </div>
              <div className="form-group w90">
                <label>Moneda</label>
                <select value={form.moneda} onChange={e => setF('moneda', e.target.value)}>
                  {['UYU','USD','UI','UR'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group w250">
                <label>Obra (solo si no tiene remitos)</label>
                <select value={form.obra_id} onChange={e => setF('obra_id', e.target.value)}>
                  <option value="">-- Sin obra directa --</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.numero} - {o.nombre}</option>)}
                </select>
              </div>
              <div className="form-group w130">
                <label>Condición de Pago</label>
                <select value={form.condicion_pago} onChange={e => setF('condicion_pago', e.target.value)}>
                  <option value="credito">Crédito</option>
                  <option value="contado">Contado</option>
                </select>
              </div>
              {form.condicion_pago === 'contado' && (
                <div className="form-group w150">
                  <label>Medio de Pago</label>
                  <select value={form.medio_pago} onChange={e => setF('medio_pago', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {MEDIOS_PAGO.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items de la factura */}
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Artículos / Líneas de Factura</span>
            <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Agregar Línea</button>
          </div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="items-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 90 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 110 }}>Unidad</th>
                  <th className="num" style={{ width: 80 }}>Cantidad</th>
                  <th className="num" style={{ width: 110 }}>Precio Unit.</th>
                  <th className="num" style={{ width: 110 }}>Precio Total</th>
                  <th style={{ width: 90 }}>IVA</th>
                  <th className="num" style={{ width: 90 }}>Monto IVA</th>
                  <th className="num" style={{ width: 110 }}>Total</th>
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
                        <button className="btn btn-secondary btn-sm" title="Buscar artículo" onClick={() => openBuscador(idx)} style={{ padding: '1px 4px', fontSize: 11 }}>...</button>
                      </div>
                    </td>
                    <td><input value={item.descripcion} onChange={e => updateItem(idx, 'descripcion', e.target.value)} style={{ width: '100%', minWidth: 150 }} /></td>
                    <td><input value={item.unidad} onChange={e => updateItem(idx, 'unidad', e.target.value)} /></td>
                    <td><input type="number" step="0.001" value={item.cantidad} onChange={e => updateItem(idx, 'cantidad', e.target.value)} style={{ textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.01" value={item.precio_unitario} onChange={e => updateItem(idx, 'precio_unitario', e.target.value)} style={{ textAlign: 'right' }} /></td>
                    <td className="num">{fmt(item.precio_total)}</td>
                    <td>
                      <select value={item.tipo_iva} onChange={e => updateItem(idx, 'tipo_iva', e.target.value)}>
                        {Object.entries(IVA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="num">{fmt(item.monto_iva)}</td>
                    <td className="num bold">{fmt(item.total)}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeItem(idx)} title="Eliminar fila">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right' }}>TOTALES:</td>
                  <td className="num">{fmt(totalesItems.neto)}</td>
                  <td></td>
                  <td className="num">{fmt(totalesItems.iva)}</td>
                  <td className="num bold">{fmt(totalesItems.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Totales resumen */}
        <div className="clearfix">
          <div className="totales-box" style={{ marginTop: 8 }}>
            <table>
              <tbody>
                <tr><td>Subtotal Neto:</td><td>{form.moneda} {fmt(totalesItems.neto)}</td></tr>
                <tr><td>IVA Total:</td><td>{form.moneda} {fmt(totalesItems.iva)}</td></tr>
              </tbody>
              <tfoot>
                <tr className="total-final"><td>TOTAL FACTURA:</td><td>{form.moneda} {fmt(totalesItems.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Remitos asociados */}
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Remitos Asociados</span>
            <span style={{ fontSize: 11, fontWeight: 'normal' }}>
              {hayRemitos
                ? `${selectedRemitoIds.length} remito(s) seleccionado(s)`
                : 'Opcional — vincule los remitos que cubre esta factura'}
            </span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {!form.proveedor_id ? (
              <div className="empty-msg">Seleccione un proveedor para ver sus remitos pendientes</div>
            ) : todosLosRemitos.length === 0 ? (
              <div className="empty-msg">No hay remitos pendientes para este proveedor</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>N° Remito</th>
                    <th>Fecha</th>
                    <th>Obra</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {todosLosRemitos.map(r => {
                    const checked = selectedRemitoIds.includes(r.id);
                    return (
                      <tr key={r.id} className={checked ? 'selected' : ''} onClick={() => toggleRemito(r.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleRemito(r.id)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td className="bold mono">{r.numero}</td>
                        <td>{r.fecha}</td>
                        <td>{r.obra_numero ? `${r.obra_numero} - ${r.obra_nombre}` : r.obra_nombre}</td>
                        <td>
                          <span className={`badge ${r.estado === 'facturado' ? 'badge-green' : 'badge-yellow'}`}>
                            {r.estado === 'facturado' ? 'Facturado' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Verificación de cantidades por artículo */}
        {hayRemitos && compKeys.length > 0 && (
          <div className="panel" style={{ marginTop: 8 }}>
            <div className="panel-header" style={{
              background: comparacionOk ? '#155724' : '#721c24',
              color: '#fff'
            }}>
              {comparacionOk ? '✓ Cantidades correctas — los remitos coinciden con la factura' : '⚠ Cantidades no coinciden'}
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Unidad</th>
                    <th className="num">Factura</th>
                    <th className="num">Remitos</th>
                    <th className="num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {compKeys.map(key => {
                    const fQty = factQtyMap[key]?.qty || 0;
                    const rQty = remQtyMap[key]?.qty || 0;
                    const diff = rQty - fQty;
                    const ok = Math.abs(diff) <= 0.001;
                    const desc = factQtyMap[key]?.desc || remQtyMap[key]?.desc;
                    const unidad = factQtyMap[key]?.unidad || remQtyMap[key]?.unidad;
                    return (
                      <tr key={key} style={{ background: ok ? undefined : '#fff3f3' }}>
                        <td>{desc}</td>
                        <td>{unidad}</td>
                        <td className="num">{fmtQty(fQty)}</td>
                        <td className="num">{fmtQty(rQty)}</td>
                        <td className="num" style={{ color: ok ? '#155724' : '#721c24', fontWeight: 'bold' }}>
                          {ok ? '✓' : (diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Factura'}</button>
          <button className="btn btn-secondary" onClick={() => nav('/facturas')}>Cancelar</button>
        </div>
      </div>

      {buscador && (
        <ArticuloBuscador onSelect={onSelectArticulo} onClose={() => setBuscador(false)} />
      )}
    </div>
  );
}
