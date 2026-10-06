# Documentacion de SoloFinanzas

> Actualización de octubre de 2026: los detalles de autenticación, rutas `/app/*`, persistencia, pruebas y operación de la versión multiusuario están en [Despliegue de la beta](despliegue-beta.md). Este documento conserva el contexto funcional de la versión local anterior; no uses sus instrucciones antiguas de arranque/migración para producción.

Este directorio concentra la documentacion funcional y tecnica del proyecto. El
punto de partida recomendado depende de lo que necesites hacer:

| Necesidad | Documento |
| --- | --- |
| Publicar la beta multiusuario | [Vercel, Supabase y Render](despliegue-beta.md) |
| Ver pruebas realizadas y pendientes | [Verificación de la beta](verificacion-beta.md) |
| Entender que resuelve el producto | [Vision, alcance y conceptos](01-vision-y-alcance.md) |
| Ubicarse en el repositorio | [Arquitectura y estructura](02-arquitectura-y-estructura.md) |
| Modificar la API o la logica de negocio | [Backend](03-backend.md) |
| Modificar pantallas o integraciones HTTP | [Frontend](04-frontend.md) |
| Entender tablas, relaciones y reglas de integridad | [Modelo de datos](05-modelo-de-datos.md) |
| Consumir o probar endpoints | [API REST](06-api-rest.md) |
| Seguir un proceso de punta a punta | [Flujos de negocio](07-flujos-de-negocio.md) |
| Instalar y ejecutar el proyecto | [Instalacion y configuracion](08-instalacion-y-configuracion.md) |
| Ejecutar y ampliar pruebas | [Pruebas y calidad](09-pruebas-y-calidad.md) |
| Respaldar, reparar u operar datos locales | [Operacion y mantenimiento](10-operacion-y-mantenimiento.md) |
| Agregar funcionalidad o una institucion | [Guia de extension](11-guia-de-extension.md) |
| Evaluar riesgos antes de publicar | [Seguridad y limitaciones](12-seguridad-y-limitaciones.md) |

## Documentos especializados e historicos

- [Flujo tecnico de inspeccion PDF](inspect_pdf_flow.md): detalle interno de
  `inspect_pdf`, extraccion de texto, layout y resolucion de montos.
- [Modelo de datos legacy](legacy-data-model.md): decisiones heredadas durante
  la migracion.
- [Plan de migracion desde Streamlit](migration-plan.md): contexto historico de
  la separacion FastAPI/React.
- [Guia para agregar un banco](../arci.md): checklist detallado de parsers y
  pruebas con PDFs reales.

## Estado que documenta este conjunto

La documentacion describe el codigo presente en el repositorio al 16 de agosto
de 2026, incluidos los flujos de analisis, eliminacion de cartolas y la pantalla
de analitica que estan actualmente en el arbol de trabajo. Si el codigo y un
documento discrepan, el codigo y sus pruebas son la fuente ejecutable de verdad;
la documentacion debe actualizarse en el mismo cambio.

## Convenciones

- Los importes se almacenan como enteros CLP: ingresos positivos y egresos
  negativos.
- Las fechas de movimientos usan `YYYY-MM-DD`; los periodos usan `YYYY-MM`.
- Los ejemplos de comandos asumen PowerShell en Windows y se ejecutan desde la
  raiz del repositorio, salvo indicacion contraria.
- Las rutas de API de negocio tienen el prefijo `/api/v1`.
- `cartola` y `statement` se usan como equivalentes.
- `movimiento` y `transaction` se usan como equivalentes.

## Mantenimiento de la documentacion

Al cambiar alguno de estos elementos, revisa tambien el documento asociado:

| Cambio | Documentos a revisar |
| --- | --- |
| Endpoint, parametro o respuesta | `06-api-rest.md`, `03-backend.md` |
| Tabla, campo, enum o relacion | `05-modelo-de-datos.md` |
| Ruta, pantalla o componente | `04-frontend.md` |
| Parser o institucion | `07-flujos-de-negocio.md`, `11-guia-de-extension.md`, `inspect_pdf_flow.md` |
| Variable de entorno o requisito | `08-instalacion-y-configuracion.md` |
| Script operativo o estrategia de respaldo | `10-operacion-y-mantenimiento.md` |
| Riesgo, autenticacion o despliegue | `12-seguridad-y-limitaciones.md` |

