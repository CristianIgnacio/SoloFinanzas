# Pruebas y calidad

> Actualización de octubre de 2026: los detalles de autenticación, rutas `/app/*`, persistencia, pruebas y operación de la versión multiusuario están en [Despliegue de la beta](despliegue-beta.md). Este documento conserva el contexto funcional de la versión local anterior; no uses sus instrucciones antiguas de arranque/migración para producción.

## Ejecutar verificaciones

Backend:

```powershell
cd backend
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Un modulo concreto:

```powershell
cd backend
.venv\Scripts\python.exe -m unittest tests.test_pdf_importer -v
```

Frontend:

```powershell
cd frontend
npm run build
```

El build es hoy la unica verificacion automatizada del frontend: comprueba tipos
TypeScript y que Vite pueda empaquetar. No existen pruebas unitarias o de UI
configuradas.

## Cobertura del backend por archivo

| Archivo | Responsabilidad cubierta |
| --- | --- |
| `test_accounts.py` | Creacion para todas las instituciones soportadas. |
| `test_categories_and_rules.py` | Nombres/keywords vacios y normalizacion. |
| `test_chilean_business_calendar.py` | Fines de semana, feriados y años desconocidos. |
| `test_dashboard.py` | Seleccion de periodo y exclusion de transferencias internas. |
| `test_database_seeding.py` | Siembra, idempotencia y preservacion de prioridad. |
| `test_internal_transfers.py` | Monto, cuenta, categoria, ventana habil y emparejamiento uno a uno. |
| `test_pdf_importer.py` | Contraseñas, perfiles, periodos, layout, totales y validacion institucional. |
| `test_statement_import.py` | Duplicados, reglas, preview, revisiones y filas identicas. |
| `test_statement_deletion.py` | Borrado, reimportacion, archivos compartidos y proteccion de rutas. |

## Principios para nuevas pruebas

- Una correccion de parser debe incluir una muestra sintetica minima que falle
  antes del cambio.
- Si el problema depende de columnas, usa `LayoutLine`/`LayoutWord`; el texto
  plano por si solo no reproduce la geometria.
- Los ejemplos reales deben anonimizar nombres, numeros de cuenta y datos
  personales antes de agregarse al repositorio.
- Usa bases temporales o motores de prueba; nunca ejecutes pruebas destructivas
  contra `backend/data/solo_finanzas.db`.
- Comprueba tanto el resultado como invariantes: signo, categoria compatible,
  conteos, ausencia de duplicados y rollback.
- Al modificar modelos o enums, agrega pruebas de persistencia con SQLite y no
  solo validacion Pydantic.

## Checklist por tipo de cambio

### Parser PDF

- registro de institucion, parser, perfil y validador;
- PDF correcto aceptado y otra institucion rechazada;
- periodo, fecha, descripcion y signo;
- cargo/abono/saldo y numeros dentro de descripcion;
- filas multilinea si aplica;
- cuadratura contra resumen si existe;
- PDF protegido y error de contraseña si el formato lo requiere;
- build frontend por cambios de enums/labels.

### Categorizacion

- keyword normalizada;
- prioridad y desempate por longitud;
- palabra completa, no substring;
- categoria compatible e incompatible;
- override manual y preservacion durante recategorizacion;
- recalculo de transferencias si cambia la categoria.

### Eliminacion

- impacto antes de borrar;
- claves foraneas y orden de eliminacion;
- reconstruccion de matches restantes;
- PDF compartido conservado;
- rutas externas nunca eliminadas;
- posibilidad de reimportar el checksum borrado.

### Frontend

- `npm run build` sin errores;
- estados de carga, vacio, error y exito;
- navegacion con query parameters;
- comportamiento movil y escritorio;
- teclado, foco, labels y cierre de modales;
- contrato TypeScript alineado con OpenAPI.

## Calidad no automatizada actualmente

No hay configuracion visible de CI, cobertura, ESLint, Prettier, Ruff, mypy,
Black ni validacion OpenAPI cliente-servidor. Antes de aceptar contribuciones o
publicar, conviene agregar al menos:

1. lint y formato para Python y TypeScript;
2. pruebas de componentes y flujos criticos del frontend;
3. CI que ejecute unittest y build;
4. reporte de cobertura;
5. migraciones de base probadas sobre copias;
6. test end-to-end de crear cuenta, preview, importar y deshacer.

## Datos y tiempo en pruebas

Algunos calculos dependen del mes actual y del calendario chileno. Los tests
deben construir fechas explicitas y considerar que el calendario incluido solo
declara feriados 2025 y 2026. Para años futuros, el comportamiento cae a dias de
semana sin feriados especiales.

