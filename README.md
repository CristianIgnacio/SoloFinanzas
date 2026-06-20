# SoloFinanzas

Aplicación web para centralizar finanzas personales en Chile. Permite registrar cuentas, importar cartolas bancarias en PDF, revisar y categorizar movimientos, detectar transferencias entre cuentas propias y visualizar resultados mensuales.

> El proyecto está orientado actualmente al uso personal y local. Usa SQLite, no incluye autenticación y todavía no debe considerarse listo para exponer directamente en internet.

## Funcionalidades

- Dashboard por período con ingresos, gastos, balance, evolución mensual y distribución por categoría.
- Gestión de cuentas bancarias y billeteras digitales.
- Detalle por cuenta con cartolas y movimientos asociados.
- Importación de cartolas PDF con vista previa antes de guardar.
- Corrección manual del tipo y la categoría durante la importación.
- Categorización automática mediante reglas por palabras clave y prioridades.
- Edición manual de categorías desde el listado de movimientos.
- Filtros por período, cuenta, tipo y categoría.
- Detección de transferencias internas entre cuentas, considerando fines de semana y feriados bancarios chilenos.
- Prevención de cartolas duplicadas mediante checksum.
- Soporte para documentos PDF protegidos con contraseña; la contraseña no se almacena.

### Instituciones compatibles

- Banco de Chile
- Banco Santander
- BancoEstado
- Mercado Pago
- CopecPay

Los parsers admiten distintos formatos de cartola: montos con signo, indicadores de cargo/abono y tablas con columnas separadas. El parser de Santander también valida los totales detectados contra el resumen de la cartola.

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, ECharts, Axios |
| Backend | FastAPI, SQLModel, Pydantic |
| Persistencia | SQLite |
| PDFs | pdfplumber, pypdf |
| Pruebas | unittest |

## Estructura del proyecto

```text
SoloFinanzas/
├── backend/
│   ├── app/
│   │   ├── api/routes/   # Endpoints FastAPI
│   │   ├── core/         # Configuración y base de datos
│   │   ├── domain/       # Enums, normalización y parsers
│   │   ├── models/       # Modelos SQLModel
│   │   ├── schemas/      # Contratos de entrada y salida
│   │   └── services/     # Lógica de negocio
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       ├── router/
│       └── services/
└── docs/
```

## Requisitos

- Python 3.11 o superior
- Node.js 22 o superior
- npm 11 o superior

## Instalación y ejecución

### 1. Backend

Desde la raíz del repositorio:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

La API quedará disponible en `http://127.0.0.1:8000` y su documentación interactiva en:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

Al iniciar, el backend crea automáticamente la base `backend/data/solo_finanzas.db`, sus tablas y los catálogos predeterminados.

Configuración opcional mediante un archivo `backend/.env`:

```dotenv
APP_NAME=SoloFinanzas API
APP_ENV=development
DATABASE_PATH=data/solo_finanzas.db
FRONTEND_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]
```

### 2. Frontend

En otra terminal, desde la raíz:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

La aplicación quedará disponible en `http://127.0.0.1:5173`.

La variable `VITE_API_URL` permite apuntar el frontend a otra instancia de la API:

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api/v1
```

## Flujo de uso recomendado

1. Crear una cuenta desde **Configuración**.
2. Entrar a **Importar PDF**, seleccionar la cuenta y analizar la cartola.
3. Revisar los movimientos detectados y corregir tipo o categoría si es necesario.
4. Confirmar la importación.
5. Revisar los resultados en **Dashboard**, **Cuentas** o **Movimientos**.
6. Ajustar categorías para mejorar las reglas y los análisis posteriores.

## Pruebas y verificación

Ejecutar las pruebas del backend:

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

Verificar que el frontend compile:

```powershell
cd frontend
npm run build
```

## API principal

Todos los endpoints de negocio usan el prefijo `/api/v1`.

| Recurso | Operaciones disponibles |
| --- | --- |
| Health | `GET /health` |
| Dashboard | `GET /dashboard?period_month=YYYY-MM` |
| Cuentas | `GET /accounts`, `POST /accounts`, `PUT /accounts/{id}`, `DELETE /accounts/{id}` |
| Categorías | `GET /categories`, `POST /categories` |
| Reglas | `GET /categorization-rules`, `GET /categorization-rules/{id}`, `POST /categorization-rules`, `PATCH /categorization-rules/{id}`, `DELETE /categorization-rules/{id}` |
| Cartolas | `GET /statements`, `GET /statements/{id}`, `POST /statements`, `PATCH /statements/{id}/status` |
| Importación | `POST /statement-imports/pdf/preview`, `POST /statement-imports/pdf`, `POST /statement-imports/pdf/reviewed` |
| Transacciones | `GET /transactions`, `GET /transactions/{id}`, `POST /transactions`, `POST /transactions/bulk`, `PATCH /transactions/{id}/category` |

`GET /transactions` admite filtros por cuenta, cartola, rango de fechas, tipo y categoría, además de paginación con `limit` y `offset`.

## Estado y hoja de ruta

La base funcional está implementada: cuentas, importación PDF, movimientos, categorización, transferencias internas y dashboard. Para considerar completa una primera versión personal, las prioridades recomendadas son:

### Prioridad alta

- **Respaldo y restauración:** exportar/importar toda la base y descargar movimientos en CSV o Excel.
- **Corrección de datos:** editar y eliminar transacciones, deshacer una importación completa y administrar cartolas importadas.
- **Gestión completa de categorías:** editar, eliminar, combinar y personalizar colores o iconos desde la interfaz.
- **Presupuestos:** límites mensuales por categoría, progreso y alertas de sobreconsumo.
- **Calidad automática:** pruebas del frontend, linting, formateo y CI para validar backend y frontend en cada cambio.

### Prioridad media

- Movimientos recurrentes, suscripciones y proyección del cierre de mes.
- Metas de ahorro y seguimiento de patrimonio, deudas e inversiones.
- Búsqueda por texto y filtros guardados.
- Reglas de categorización administrables completamente desde la interfaz.
- Mejoras de accesibilidad, estados vacíos, diseño móvil y confirmaciones de acciones sensibles.
- Migraciones versionadas de base de datos para evolucionar el esquema sin perder información.

### Si se publicará en internet

- Autenticación, usuarios y aislamiento de datos por usuario.
- Cifrado y política de retención para cartolas almacenadas.
- PostgreSQL, despliegue con contenedores, copias de seguridad y monitoreo.
- Límites de tamaño y tipo de archivo, rate limiting, auditoría y endurecimiento de CORS.

## Limitaciones actuales

- Solo se usa CLP como moneda base.
- La persistencia predeterminada es local con SQLite.
- No hay autenticación ni separación entre usuarios.
- La importación depende del formato de PDF de cada institución; un cambio de diseño puede requerir ajustar su parser.
- No existe todavía una interfaz completa para administrar categorías y reglas.

## Documentación adicional

- [`docs/migration-plan.md`](docs/migration-plan.md): plan de migración del proyecto original.
- [`docs/legacy-data-model.md`](docs/legacy-data-model.md): referencia del modelo de datos anterior.
- [`docs/inspect_pdf_flow.md`](docs/inspect_pdf_flow.md): flujo técnico de inspección de PDFs.
