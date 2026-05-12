import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Obras from './pages/Obras';
import Proveedores from './pages/Proveedores';
import Articulos from './pages/Articulos';
import Facturas from './pages/Facturas';
import FacturaForm from './pages/FacturaForm';
import Remitos from './pages/Remitos';
import RemitoForm from './pages/RemitoForm';
import NotasCredito from './pages/NotasCredito';
import NotaCreditoForm from './pages/NotaCreditoForm';
import Reportes from './pages/Reportes';

function App() {
  const loc = useLocation();
  return (
    <div id="root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="app-header">
        <h1>OBRA 079 &mdash; MANTENIMIENTO DE BIENES</h1>
        <span className="header-status">Sistema Administrativo v1.0</span>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section-title">Inicio</div>
          <nav>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Inicio</NavLink>
          </nav>
          <div className="sidebar-section-title">Maestros</div>
          <nav>
            <NavLink to="/obras" className={({ isActive }) => isActive ? 'active' : ''}>Obras</NavLink>
            <NavLink to="/proveedores" className={({ isActive }) => isActive ? 'active' : ''}>Proveedores</NavLink>
            <NavLink to="/articulos" className={({ isActive }) => isActive ? 'active' : ''}>Artículos</NavLink>
          </nav>
          <div className="sidebar-section-title">Comprobantes</div>
          <nav>
            <NavLink to="/facturas" className={({ isActive }) => isActive || loc.pathname.startsWith('/facturas/') ? 'active' : ''}>Facturas</NavLink>
            <NavLink to="/remitos" className={({ isActive }) => isActive || loc.pathname.startsWith('/remitos/') ? 'active' : ''}>Remitos</NavLink>
            <NavLink to="/notas-credito" className={({ isActive }) => isActive || loc.pathname.startsWith('/notas-credito/') ? 'active' : ''}>Notas de Crédito</NavLink>
          </nav>
          <div className="sidebar-section-title">Reportes</div>
          <nav>
            <NavLink to="/reportes" className={({ isActive }) => isActive ? 'active' : ''}>Gastos por Obra</NavLink>
          </nav>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/obras" element={<Obras />} />
            <Route path="/proveedores" element={<Proveedores />} />
            <Route path="/articulos" element={<Articulos />} />
            <Route path="/facturas" element={<Facturas />} />
            <Route path="/facturas/nueva" element={<FacturaForm />} />
            <Route path="/facturas/:id" element={<FacturaForm />} />
            <Route path="/remitos" element={<Remitos />} />
            <Route path="/remitos/nuevo" element={<RemitoForm />} />
            <Route path="/remitos/:id" element={<RemitoForm />} />
            <Route path="/notas-credito" element={<NotasCredito />} />
            <Route path="/notas-credito/nueva" element={<NotaCreditoForm />} />
            <Route path="/notas-credito/:id" element={<NotaCreditoForm />} />
            <Route path="/reportes" element={<Reportes />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
