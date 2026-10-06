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

Para Falabella, crea una cuenta o tarjeta seleccionando **Banco Falabella** y luego usa **Importar PDF**. El formato compatible es la **Cartola de Movimientos de Cuenta Corriente**, con columnas fecha, descripción, cargo, abono y saldo. Los estados de cuenta de crédito CMR todavía no están soportados. Cuando el rango de consulta abarca varios meses, la cartola se registra en el mes del último movimiento y cada transacción conserva su fecha.

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
│   └── tests/          # Pruebas locales, excluidas de Git
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

## Verificación

Si conservas las pruebas en este equipo, desde `backend/` puedes ejecutar `.venv/Scripts/python.exe -m unittest discover -s tests -v`; desde `frontend/`, `npm ci`, `npm run build`, `npx playwright install chromium` y `npx playwright test`. Las carpetas de pruebas y la configuración de Playwright no se versionan.

El workflow de CI comprueba dependencias, sintaxis de Python, migraciones sobre PostgreSQL desechable y compilación del frontend. Las pruebas de aislamiento, respaldo y navegador se ejecutaron localmente, pero no corren en GitHub al permanecer fuera del repositorio. El acceso real de Google y los proveedores se valida al configurar las cuentas externas.

## Documentación

- [Despliegue, seguridad, migración y respaldos de la beta](docs/despliegue-beta.md).
- [Índice de documentación funcional y técnica](docs/README.md).
- [Agregar una institución](arci.md).

Correo/contraseña y espacios compartidos quedan para una etapa posterior. La publicación sigue sujeta a las condiciones de los planes gratuitos y a completar las comprobaciones de la guía.
