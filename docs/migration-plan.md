# Plan de migracion desde Streamlit

## Objetivo

Separar la aplicacion en:

- `FastAPI` para exponer reglas de negocio y datos.
- `React` para la experiencia de usuario.

## Mapeo recomendado

### Desde Streamlit

- `st.session_state` -> estado local de React o contexto global.
- funciones de calculo -> servicios de FastAPI.
- carga de archivos / CSV / Excel -> endpoints del backend.
- tablas y graficos -> componentes React con fetch al backend.

## Flujo sugerido

1. Identificar el punto de entrada del proyecto legacy.
2. Extraer funciones puras de negocio y dejarlas en `backend/app/services/`.
3. Crear esquemas Pydantic para entradas y salidas.
4. Exponer endpoints REST por dominio.
5. Rehacer cada pantalla de Streamlit como una vista React.

## Carpetas preparadas para crecer

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `frontend/src/components/`
- `frontend/src/features/`
