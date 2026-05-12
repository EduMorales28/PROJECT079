import React, { useEffect, useState, useRef } from 'react';

export default function ArticuloBuscador({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ activo: '1' });
    if (search) qs.set('search', search);
    fetch('/api/articulos?' + qs).then(r => r.json()).then(setRows);
  }, [search]);

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && selected) onSelect(selected);
  };

  const IVA_LABEL = { TB: 'TB 22%', TM: 'TM 10%', EX: 'EX 0%' };

  return (
    <div className="modal-overlay" onKeyDown={handleKey}>
      <div className="modal-box" style={{ width: 700, maxHeight: '80vh' }}>
        <div className="modal-header">
          <span>Buscar Artículo</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '8px 10px' }}>
          <input
            ref={inputRef}
            placeholder="Buscar por código, descripción o subgrupo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 8, padding: '4px 6px', border: '1px solid #888', fontSize: 13 }}
          />
          <div style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid #ccc' }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Subgrupo</th>
                  <th>Unidad</th>
                  <th>Moneda</th>
                  <th>IVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="empty-msg">Sin resultados</td></tr>}
                {rows.map(a => (
                  <tr
                    key={a.id}
                    className={selected?.id === a.id ? 'selected' : ''}
                    onClick={() => setSelected(a)}
                    onDoubleClick={() => onSelect(a)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="bold mono">{a.codigo}</td>
                    <td>{a.descripcion}</td>
                    <td>{a.subgrupo}</td>
                    <td>{a.unidad}</td>
                    <td>{a.moneda}</td>
                    <td>{IVA_LABEL[a.tipo_iva] || a.tipo_iva}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => selected && onSelect(selected)} disabled={!selected}>
            Seleccionar
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <span style={{ fontSize: 11, color: '#666', marginRight: 'auto' }}>Doble clic o Enter para seleccionar</span>
        </div>
      </div>
    </div>
  );
}
