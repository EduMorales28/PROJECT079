import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const IVA_RATES = { TB: 0.22, TM: 0.10, EX: 0 };

function calcItem(item) {
  const cantidad = parseFloat(item.cantidad) || 0;
  const precio_unitario = parseFloat(item.precio_unitario) || 0;
  const precio_total = cantidad * precio_unitario;
  const rate = IVA_RATES[item.tipo_iva] || 0;
  const monto_iva = precio_total * rate;
  const total = precio_total + monto_iva;
  return { ...item, precio_total, monto_iva, total };
}

export default function NotaCreditoForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id) && id !== 'nueva';

  const [form, setForm] = useState({
    proveedor_id: '', factura_id: '', numero: '',
    fecha: new Date().toISOString().slice(0, 10), moneda: 'UYU'
  });
  const [items, setItems] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [facturaItems, setFacturaItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/proveedores?activo=1').then(r => r.json()).then(setProveedores);
  }, []);

  useEffect(() => {
    if (!form.proveedor_id) { setFacturas([]); return; }
    fetch(`/api/notas-credito/proveedor/${form.proveedor_id}/facturas`)
      .then(r => r.json()).then(setFacturas);
  }, [form.proveedor_id]);

  useEffect(() => {
    if (!form.factura_id) { setFacturaItems([]); setItems([]); return; }
    fetch(`/api/facturas/${form.factura_id}/items`).then(r => r.json()).then(fItems => {
      setFacturaItems(fItems);
      // Pre-populate items with 0 quantities
      setItems(fItems.map(fi => ({
        factura_item_id: fi.id,
        articulo_id: fi.articulo_id,
        codigo: fi.codigo,
        descripcion: fi.descripcion,
        unidad: fi.unidad,
        tipo_iva: fi.tipo_iva,
        precio_unitario: fi.precio_unitario,
        cantidad: '',
        cantidad_max: fi.cantidad,
        precio_total: 0, monto_iva: 0, total: 0
      })));
    });
  }, [form.factura_id]);

  useEffect(() => {
    if (!isEdit) return;
    fetch(`/api/notas-credito/${id}`).then(r => r.json()).then(d => {
      setForm({
        proveedor_id: d.proveedor_id, factura_id: d.factura_id || '',
        numero: d.numero, fecha: d.fecha, moneda: d.moneda
      });
      setItems(d.items);
    });
  }, [id]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateQty = (idx, value) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[idx], cantidad: value };
      const max = parseFloat(item.cantidad_max) || Infinity;
      const qty = Math.min(parseFloat(value) || 0, max);
      copy[idx] = calcItem({ ...item, cantidad: qty });
      return copy;
    });
  };

  const cargarTodo = () => {
    setItems(prev => prev.map(item => calcItem({ ...item, cantidad: item.cantidad_max || item.cantidad })));
  };

  const limpiar = () => {
    setItems(prev => prev.map(item => ({ ...item, cantidad: '', precio_total: 0, monto_iva: 0, total: 0 })));
  };

  const totales = items.reduce((acc, it) => ({
    neto: acc.neto + (it.precio_total || 0),
    iva: acc.iva + (it.monto_iva || 0),
    total: acc.total + (it.total || 0)
  }), { neto: 0, iva: 0, total: 0 });

  const fmt = (n) => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const save = async () => {
    setError('');
    if (!form.proveedor_id) { setError('Seleccione un proveedor'); return; }
    if (!form.numero) { setError('Ingrese número de NC'); return; }
    if (!form.fecha) { setError('Ingrese fecha'); return; }
    const validItems = items.filter(it => parseFloat(it.cantidad) > 0);
    if (validItems.length === 0) { setError('Ingrese al menos un artículo con cantidad'); return; }
    setSaving(true);
    const payload = { ...form, items: validItems };
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/notas-credito/${id}` : '/api/notas-credito';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving(false);
    if (d.error) { setError(d.error); return; }
    nav('/notas-credito');
  };

  return (
    <div>
      <div className="page-bar">
        <h2>{isEdit ? `Nota de Crédito #${form.numero}` : 'Nueva Nota de Crédito'}</h2>
        {!isEdit && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>}
        <button className="btn btn-secondary" onClick={() => nav('/notas-credito')}>Volver</button>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="panel">
          <div className="panel-header">Datos de la Nota de Crédito</div>
          <div className="panel-body">
            <div className="form-row">
              <div className="form-group w300">
                <label>Proveedor *</label>
                <select value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)} disabled={isEdit}>
                  <option value="">-- Seleccionar --</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div className="form-group w120">
                <label>N° Nota de Crédito *</label>
                <input value={form.numero} onChange={e => setF('numero', e.target.value)} readOnly={isEdit} />
              </div>
              <div className="form-group w130">
                <label>Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => setF('fecha', e.target.value)} readOnly={isEdit} />
              </div>
              <div className="form-group w90">
                <label>Moneda</label>
                <select value={form.moneda} onChange={e => setF('moneda', e.target.value)} disabled={isEdit}>
                  {['UYU','USD','UI','UR'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {!isEdit && (
              <div className="form-row">
                <div className="form-group w300">
                  <label>Factura a Acreditar</label>
                  <select value={form.factura_id} onChange={e => setF('factura_id', e.target.value)} disabled={!form.proveedor_id}>
                    <option value="">-- Sin factura de referencia --</option>
                    {facturas.map(f => <option key={f.id} value={f.id}>Fac. {f.numero} — {f.fecha}</option>)}
                  </select>
                </div>
                {form.factura_id && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={cargarTodo}>Devolución Total</button>
                    <button className="btn btn-secondary" onClick={limpiar}>Limpiar Cantidades</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {(items.length > 0) && (
          <div className="panel">
            <div className="panel-header">Artículos a Devolver</div>
            <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="items-table" style={{ minWidth: 800 }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Unidad</th>
                    {!isEdit && <th className="num">Máx.</th>}
                    <th className="num">Cantidad</th>
                    <th className="num">Precio Unit.</th>
                    <th>IVA</th>
                    <th className="num">Neto</th>
                    <th className="num">Monto IVA</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="mono">{item.codigo}</td>
                      <td>{item.descripcion}</td>
                      <td>{item.unidad}</td>
                      {!isEdit && <td className="num" style={{ color: '#888', fontStyle: 'italic' }}>{item.cantidad_max}</td>}
                      <td>
                        {isEdit
                          ? <span className="num">{item.cantidad}</span>
                          : <input type="number" step="0.001" min="0" max={item.cantidad_max}
                              value={item.cantidad}
                              onChange={e => updateQty(idx, e.target.value)}
                              style={{ textAlign: 'right', width: 80 }} />
                        }
                      </td>
                      <td className="num">{fmt(item.precio_unitario)}</td>
                      <td>{item.tipo_iva}</td>
                      <td className="num">{fmt(item.precio_total)}</td>
                      <td className="num">{fmt(item.monto_iva)}</td>
                      <td className="num bold" style={{ color: '#9b1c1c' }}>({fmt(item.total)})</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={isEdit ? 5 : 6} style={{ textAlign: 'right' }}>TOTALES:</td>
                    <td></td>
                    <td className="num">{fmt(totales.neto)}</td>
                    <td className="num">{fmt(totales.iva)}</td>
                    <td className="num bold" style={{ color: '#9b1c1c' }}>({fmt(totales.total)})</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {!isEdit && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Nota de Crédito'}</button>
            <button className="btn btn-secondary" onClick={() => nav('/notas-credito')}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}
