# Instalacion y configuracion

> Actualización de octubre de 2026: los detalles de autenticación, rutas `/app/*`, persistencia, pruebas y operación de la versión multiusuario están en [Despliegue de la beta](despliegue-beta.md). Este documento conserva el contexto funcional de la versión local anterior; no uses sus instrucciones antiguas de arranque/migración para producción.

## Requisitos

- Windows con PowerShell para seguir los comandos tal como estan escritos.
- Python 3.11 o superior.
- Node.js 22 o superior.
- npm 11 o superior.
- PDFs con texto seleccionable para importar.

## Backend

Desde la raiz del repositorio:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Servicios esperados:

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Health: `http://127.0.0.1:8000/api/v1/health`

Al iniciar se crea el directorio de datos y la base si no existen. No es
necesario ejecutar un comando de migracion inicial.

## Variables del backend

Crea `backend/.env` si necesitas cambiar defaults:

```dotenv
APP_NAME=SoloFinanzas API
APP_ENV=development
DATABASE_PATH=data/solo_finanzas.db
FRONTEND_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]
```

| Variable | Default | Uso |
| --- | --- | --- |
| `APP_NAME` | `SoloFinanzas API` | Titulo OpenAPI. |
| `APP_ENV` | `development` | Etiqueta de entorno; actualmente no cambia comportamiento. |
| `DATABASE_PATH` | `data/solo_finanzas.db` | Absoluta o relativa a `backend/`. |
| `FRONTEND_ORIGINS` | localhost/127.0.0.1:5173 | Lista JSON de origenes CORS. |

No guardes `backend/.env` en Git. El archivo esta ignorado. La aplicacion no
requiere secretos externos en el estado actual.

## Frontend

En otra terminal, desde la raiz:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

La UI queda en `http://127.0.0.1:5173`. En desarrollo, Vite redirige `/api` a
`http://127.0.0.1:8000`, por lo que se puede dejar la URL relativa.

`frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api/v1
```

Si la variable se omite, el default es `/api/v1`. Las variables `VITE_*` se
inyectan en el bundle y nunca deben contener secretos.

## Comandos disponibles

### Backend

```powershell
# Desarrollo
python -m uvicorn app.main:app --reload

# Pruebas completas
python -m unittest discover -s tests -v
```

No hay scripts separados de lint, formato o migracion declarados.

### Frontend

```powershell
npm run dev
npm run build
npm run preview
```

- `dev`: servidor Vite con recarga.
- `build`: `tsc -b` y build de produccion.
- `preview`: sirve localmente el resultado de `dist/`.

No hay scripts de test, lint o formato configurados.

## Verificacion rapida despues de instalar

1. Abre `/api/v1/health` y confirma `status=ok`.
2. Abre Swagger y ejecuta `GET /accounts`.
3. Abre el frontend y crea una cuenta en Configuracion.
4. Confirma que `backend/data/solo_finanzas.db` existe.
5. Ejecuta las pruebas del backend y el build del frontend.

## Datos locales

| Ruta | Contenido | Versionado |
| --- | --- | --- |
| `backend/data/solo_finanzas.db` | Base activa. | No. |
| `backend/data/raw/` | PDFs originales. | No. |
| `backend/data/*.backup-*.db` | Respaldos de scripts. | No. |
| `frontend/dist/` | Build generado. | No. |

Copiar solo el repositorio no copia los datos financieros. Para mover una
instalacion se debe respaldar `backend/data` de forma separada y segura.

## Problemas comunes

### El frontend no conecta

- confirma que FastAPI esta en el puerto 8000;
- revisa `VITE_API_URL`;
- si frontend usa otro host/puerto, agregalo a `FRONTEND_ORIGINS`;
- reinicia Vite despues de modificar `.env`.

### El backend no encuentra la base

Las rutas relativas se resuelven contra `backend/`. Revisa el valor de
`DATABASE_PATH` y permisos del directorio.

### PowerShell no permite activar el entorno

Se puede ejecutar directamente sin activar:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir backend
```

### El PDF no se procesa

- debe terminar en `.pdf` y pesar como maximo 10 MB;
- debe tener texto seleccionable;
- selecciona una cuenta de la institucion correcta;
- ingresa la contraseña si corresponde;
- conserva un ejemplo anonimizado para reproducir el formato en pruebas.

