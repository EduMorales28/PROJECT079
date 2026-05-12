# Obra 079 — Mantenimiento de Bienes
## Sistema Administrativo Local

---

## REQUISITOS PREVIOS

- **Node.js** versión 18 o superior → https://nodejs.org
- **npm** (viene con Node.js)

Verificar instalación:
```
node --version
npm --version
```

---

## INSTALACIÓN (primera vez)

### 1. Abrir terminal en la carpeta del proyecto

En VS Code: Menú → Terminal → New Terminal

### 2. Instalar todas las dependencias

```bash
npm run install:all
```

Esto instala dependencias del proyecto raíz, backend y frontend.

---

## EJECUTAR EL SISTEMA

### Opción A — Iniciar todo junto (recomendado)

```bash
npm run dev
```

Esto inicia simultáneamente:
- **Backend** en http://localhost:3001
- **Frontend** en http://localhost:5173

Luego abrir en el navegador: **http://localhost:5173**

### Opción B — Iniciar por separado

Terminal 1 (backend):
```bash
cd backend
npm run dev
```

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```

---

## ESTRUCTURA DEL PROYECTO

```
PROJECT 079/
├── package.json          ← scripts raíz (dev, install:all)
├── backend/
│   ├── package.json
│   ├── server.js         ← servidor Express puerto 3001
│   ├── data/
│   │   └── obra079.db    ← base de datos SQLite (se crea automático)
│   ├── db/
│   │   └── database.js   ← definición de tablas SQLite
│   └── routes/
│       ├── obras.js
│       ├── proveedores.js
│       ├── articulos.js
│       ├── facturas.js
│       ├── remitos.js
│       ├── notasCredito.js
│       └── reportes.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Obras.jsx
        │   ├── Proveedores.jsx
        │   ├── Articulos.jsx
        │   ├── Facturas.jsx
        │   ├── FacturaForm.jsx
        │   ├── Remitos.jsx
        │   ├── RemitoForm.jsx
        │   ├── NotasCredito.jsx
        │   ├── NotaCreditoForm.jsx
        │   └── Reportes.jsx
        └── components/
            └── ArticuloBuscador.jsx
```

---

## BASE DE DATOS

La base de datos SQLite se crea automáticamente en `backend/data/obra079.db` al iniciar el backend por primera vez.

**Backup:** simplemente copiar el archivo `obra079.db`.

---

## IMPORTACIÓN DE EXCEL

### Artículos
El Excel debe tener estas columnas (primera fila = encabezados):
- `Codigo` (o "Código")
- `Descripcion` (o "Descripción")
- `Subgrupo`
- `Unidad`
- `Moneda` → valores: `UYU` o `U$S`
- `IVA` (o "Tipo IVA") → valores: `TB`, `TM`, `EX`

### Proveedores
- `Razon Social` (o "Razón Social")
- `RUT`
- `Direccion` (o "Dirección")

---

## MÓDULOS

| Módulo | Descripción |
|--------|-------------|
| **Obras** | CRUD de obras con presupuesto y seguimiento de gasto |
| **Proveedores** | CRUD + importación desde Excel |
| **Artículos** | CRUD + importación desde Excel con validación |
| **Facturas** | Ingreso de facturas con artículos, cálculo automático IVA |
| **Remitos** | Remitos vinculados a obras y facturas |
| **Notas de Crédito** | Devoluciones parciales o totales de facturas |
| **Reportes** | Gastos por obra con exportación Excel y PDF |

---

## CÁLCULO DE IVA

| Tipo | Tasa |
|------|------|
| TB (Básico) | 22% |
| TM (Mínimo) | 10% |
| EX (Exento) | 0% |

---

## FLUJO DE TRABAJO TÍPICO

1. Cargar **Proveedores** y **Artículos** (desde Excel o manualmente)
2. Crear **Obras** con presupuesto
3. Ingresar **Facturas**:
   - Con obra directa (una obra por factura)
   - Sin obra (si tiene múltiples remitos con distintas obras)
4. Ingresar **Remitos** vinculados a obras y opcionalmente a facturas
5. Ver **Reportes** de gastos por obra
6. Emitir **Notas de Crédito** para devoluciones

---

## DETENER EL SISTEMA

En la terminal donde corre `npm run dev`, presionar `Ctrl + C`.
