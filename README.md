# SoloFinanzas

Aplicación web para centralizar finanzas personales en Chile. Permite registrar cuentas, importar cartolas bancarias en PDF, revisar y categorizar movimientos, detectar transferencias entre cuentas propias y visualizar resultados mensuales.

> Beta multiusuario con Google (Supabase Auth), PostgreSQL privado, React en Vercel y FastAPI en Render. Configuración y puesta en marcha: [Guía de despliegue de la beta](docs/despliegue-beta.md). Los proyectos externos aún deben crearse y validarse antes de abrir el registro.

## Funcionalidades

- Dashboard por período con ingresos, gastos, balance, evolución mensual y distribución por categoría.
- Gestión de cuentas bancarias y billeteras digitales.
- Detalle por cuenta con cartolas y movimientos asociados.
- Importación de cartolas PDF con vista previa antes de guardar.
- Corrección manual del tipo y la categoría durante la importación.
- Categorización automática mediante reglas por palabras clave y prioridades.
- Categorías y subcategorías de dos niveles, con archivado, fusión y administración de reglas.
- Edición manual de categorías desde el listado de movimientos.
- Filtros por período, cuenta, tipo y categoría.
- Detección de transferencias internas entre cuentas, considerando fines de semana y feriados bancarios chilenos.
- Prevención de cartolas duplicadas mediante checksum.
- Soporte para documentos PDF protegidos con contraseña; la contraseña no se almacena.

### Instituciones compatibles

- Banco de Chile
- Banco Santander
- BancoEstado
- Banco Falabella (Cartola de Movimientos de Cuenta Corriente)
- Mercado Pago
- CopecPay

Los parsers admiten distintos formatos de cartola: montos con signo, indicadores de cargo/abono y tablas con columnas separadas. El parser de Santander también valida los totales detectados contra el resumen de la cartola.

Para Falabella, crea una cuenta o tarjeta seleccionando **Banco Falabella** y luego usa **Importar PDF**. La **Cartola de Movimientos de Cuenta Corriente** usa su propio parser, con columnas fecha, descripción, cargo, abono y saldo. Cuando el rango de consulta abarca varios meses, la cartola se registra en el mes del último movimiento y cada transacción conserva su fecha. La **CMR Mastercard** admite el estado de cuenta nacional de la muestra recibida; Premium y Elite reutilizan ese parser de forma provisional y quedan pendientes de verificación.

En CMR se importan compras, cuotas y cargos facturados del período. El pago de la tarjeta, el saldo anterior y los vencimientos futuros no se registran como movimientos nuevos. El parser compara esos cargos más el saldo anterior con el monto total facturado; una diferencia se muestra para revisión antes de importar.

Para la tarjeta **WorldMember Santander LATAM Pass**, se admite el estado de cuenta nacional en pesos. Se importan las operaciones y cargos facturados del mes, incluidas las cuotas que vencen en ese período. El pago anterior, el comprobante de pago y las cuotas futuras no se registran como gastos. El estado internacional aún no está soportado.

Para tarjetas de crédito de **Banco de Chile**, se admite provisionalmente el estado de cuenta nacional en pesos. Se registran las compras, cuotas y comisiones facturadas; el pago anterior queda fuera. Todas las variantes del catálogo están pendientes de verificación individual, así que revisa el resultado antes de confirmar. El estado internacional aún no está soportado.

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, ECharts, Axios |
| Backend | FastAPI, SQLModel, Pydantic |
| Persistencia | PostgreSQL + Alembic; SQLite separado para desarrollo |
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
│   └── tests/          # Pruebas de backend
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

## Ejecutar y desplegar

Sigue la [guía de la beta](docs/despliegue-beta.md) para crear los tres proyectos, configurar Google y variables, ejecutar Alembic, publicar, migrar tu historial y programar respaldos cifrados.

La home se puede ver sin configurar Supabase. Las pantallas de gestión están en `/app/*` y requieren Google; las rutas anteriores redirigen. No existe acceso local sin autenticación. La base anterior `backend/data/solo_finanzas.db` no se abre ni modifica al iniciar esta versión; desarrollo usa `cloud_dev.db`.

### Desarrollo local en Windows

Verifica que `backend/.env` apunte a `sqlite:///data/cloud_dev.db` antes de migrar. Desde `backend/`, instala las dependencias si faltan y actualiza esa base local; la API no ejecuta migraciones al arrancar:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

En otra terminal, desde `frontend/`:

```powershell
npm ci
npm run dev
```

Abre `http://127.0.0.1:5173`. Vite envía `/api` al backend local. `GET http://127.0.0.1:8000/api/v1/health` comprueba que la API responde; entrar a `/app/*` requiere la configuración de Supabase/Google de `frontend/.env` y `backend/.env`, además del callback local autorizado en Supabase. Si el puerto 5173 ya está ocupado por otra instancia de Vite, detén la anterior antes de volver a iniciar.

## Verificación

Desde `backend/` puedes ejecutar `.venv/Scripts/python.exe -m unittest discover -s tests -v`; desde `frontend/`, `npm ci`, `npm run build`, `npx playwright install chromium` y `npx playwright test`. Las pruebas de ambas capas y la configuración de Playwright están versionadas.

El workflow de CI comprueba dependencias, sintaxis de Python, migraciones y pruebas de backend sobre PostgreSQL desechable, además de compilación y pruebas de navegador del frontend. El acceso real de Google y los proveedores se valida al configurar las cuentas externas.

## Documentación

- [Despliegue, seguridad, migración y respaldos de la beta](docs/despliegue-beta.md).
- [Índice de documentación funcional y técnica](docs/README.md).
- [Agregar una institución](arci.md).

Correo/contraseña y espacios compartidos quedan para una etapa posterior. La publicación sigue sujeta a las condiciones de los planes gratuitos y a completar las comprobaciones de la guía.
