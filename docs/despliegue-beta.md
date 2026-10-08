# Beta: Vercel + Supabase + Render

Esta guía deja preparada la publicación; no crea recursos ni activa cobros. Primero prueba con usuarios y cartolas ficticios. Los proyectos y el acceso real con Google todavía deben configurarse en tus cuentas.

## Arquitectura y límites

- Vercel publica `frontend/` como sitio Vite estático. `/` es público; `/app/*` exige sesión. `vercel.json` resuelve la recarga de rutas.
- Supabase Auth gestiona Google con PKCE. El navegador solo tiene URL y clave publicable.
- FastAPI recibe el JWT y valida firma ES256/RS256, emisor, audiencia, vencimiento, UUID, rol y proveedor Google. No admite tokens sin firma ni claves HS256 heredadas.
- PostgreSQL guarda las tablas en `finance`. La Data API debe estar deshabilitada. Las cuentas `anon` y `authenticated` no tienen acceso a este esquema; FastAPI usa el rol limitado `finance_api`.
- `TenantSession` filtra consultas, agregados y referencias por propietario. Las claves foráneas compuestas también impiden relaciones entre usuarios en la base. Las operaciones del mismo usuario se serializan mediante un bloqueo PostgreSQL.
- Usa conexión directa o **Session pooler**, nunca Transaction pooler: los bloqueos abarcan varios commits. El pool de la API admite hasta cinco conexiones y el despliegue usa una sola instancia/worker.
- El navegador envía el PDF directamente a Render. Máximo 10 MB, 50 páginas, 30 segundos y un parser simultáneo. El proceso se termina al exceder el tiempo; ni PDF, contraseña ni texto completo se guardan. Los PDFs temporales que usa el parser multipart se cierran al terminar la solicitud.
- Límites iniciales: 120 solicitudes por usuario/minuto y 240 por IP; 5 importaciones o previsualizaciones por usuario/minuto y 10 por IP. Son contadores de una instancia y se reinician al reiniciar el servicio.
- Movimientos y detalle de cuentas usan páginas de 50 filas. Saldos y resumen mensual se agregan en SQL. Análisis carga los meses elegidos (inicialmente el último) para conservar filtros, comparaciones y exclusiones; elegir muchos meses aumenta el tiempo y memoria del navegador. Las preferencias se separan por UUID.

## 1. Preparar Supabase

1. Crea un proyecto **Free**, conserva la contraseña administrativa en tu gestor de contraseñas y espera a que la base esté disponible.
2. En los ajustes de API deshabilita **Data API**. No agregues `finance` a los esquemas expuestos. Auth seguirá usándose mediante su SDK.
3. En Auth habilita **Google** y deshabilita Email/Password y acceso anónimo. En Google Cloud crea un cliente OAuth de tipo web. Copia el callback que muestra Supabase, con forma `https://PROYECTO.supabase.co/auth/v1/callback`, a las URI autorizadas del cliente de Google. El secreto de Google se configura en Supabase, nunca en Vercel.
4. Configura la pantalla de consentimiento de Google primero en modo de prueba y agrega tus identidades de prueba y tu cuenta personal como usuarios autorizados. Mantén habilitada en Supabase Auth la opción **Allow new users to sign up**: de otro modo, el primer acceso con Google no podrá crear el perfil. Mientras Google siga en modo de prueba, su lista de usuarios de prueba limita quién completa este flujo. Publica el consentimiento de Google solo después de completar la lista de comprobaciones.
5. En Auth > URL Configuration establece la Site URL definitiva de Vercel y permite explícitamente:
   - `http://localhost:5173/auth/callback`
   - `http://127.0.0.1:5173/auth/callback`
   - `https://TU-SITIO.vercel.app/auth/callback`
6. Configura una clave de firma asimétrica **ES256 o RS256** en Supabase Auth. Comprueba que su JWKS se publica en `/auth/v1/.well-known/jwks.json`. Si el proyecto venía usando HS256, sigue la rotación indicada por Supabase y vuelve a ingresar.
7. Guarda la URL del proyecto y la clave publicable para el frontend. Crea una clave secreta `sb_secret_...` para Render: permite completar la eliminación del usuario de Auth. La variable `SUPABASE_SECRET_KEY` es la opción principal; el backend también acepta `SUPABASE_SERVICE_ROLE_KEY` antiguo como respaldo temporal. No pegues claves secretas en un chat, repositorio ni variable `VITE_*`.

Referencias: [Google con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [claves de firma](https://supabase.com/docs/guides/auth/signing-keys), [conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 2. Preparar la base, sin migraciones al arrancar la API

Desde `backend/`, crea el entorno e instala dependencias:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

No sobrescribas un `.env` existente. Edítalo localmente. Para migrar, `DATABASE_URL` debe usar la conexión administrativa que ofrece **Connect > Session pooler** (puerto 5432), con `sslmode=require`. Codifica los caracteres especiales de usuario/contraseña en la URL. No imprimas ni incluyas la URL real en comandos compartidos.

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Ejecuta `scripts/runtime-role.sql` en el SQL Editor de Supabase, después de la migración. Si el editor dice «Success. No rows returned», terminó correctamente. Desde `backend/`, asigna una contraseña propia al rol en Windows:

```powershell
.\.venv\Scripts\python.exe scripts/set_runtime_password.py
```

El script la solicita dos veces sin mostrarla ni guardarla. También puedes usar `\password finance_api` en `psql` si lo tienes. No guardes contraseñas en el archivo SQL. Para Render usa la misma conexión Session pooler con usuario `finance_api.REFERENCIA-PROYECTO` y su contraseña. El administrador conserva su conexión exclusivamente para migraciones y respaldo. Reaplica los grants del script tras futuras migraciones que creen tablas.

La API nunca crea ni actualiza tablas al arrancar. Para desarrollo sin PostgreSQL, el valor predeterminado crea **`backend/data/cloud_dev.db`**, separado de la base anterior. Ejecuta Alembic también para esa base. SQLite se usa para desarrollo y pruebas, no para Render.

### Actualizar una base de producción existente

Si un cambio incluye una migración Alembic, coordina el push con el despliegue: deja en pausa los despliegues automáticos de Render y Vercel hasta terminar la migración. El backend nuevo puede consultar columnas que todavía no existen si se publica antes. Con el mismo commit que vas a desplegar:

1. Espera a que CI termine correctamente y crea/verifica un respaldo cifrado reciente del esquema `finance` con el procedimiento de la sección 6. Guarda la clave fuera del repositorio.
2. Desde `backend/`, configura **solo para esta operación** `DATABASE_URL` con la conexión administrativa PostgreSQL de Supabase (Session pooler y TLS). No uses el usuario limitado `finance_api` ni incluyas la URL en el historial de comandos o en Git.
3. Comprueba la revisión actual y aplica las migraciones pendientes:

```powershell
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

4. Confirma que la última revisión coincide con `head` (para esta entrega, `b427eac61230`). Si la migración crea tablas o secuencias, vuelve a ejecutar `scripts/runtime-role.sql` como administrador para dar acceso al rol de la API; el script no cambia su contraseña.
5. Despliega primero Render y después Vercel. Comprueba una consulta autenticada de cuentas y la creación/edición de una cuenta de prueba antes de reanudar los despliegues automáticos.

Agregar productos al catálogo sin alterar tablas no requiere otra migración. Las cuentas antiguas que no tengan `product_code` conservan sus movimientos y pueden asociarse a un producto desde el formulario de edición. Si producción aún no tiene el esquema `finance`, sigue primero la instalación inicial de esta sección: `upgrade head` aplicará todas las revisiones en orden.

## 3. Publicar Render Free

Usa `render.yaml` como Blueprint o crea un Web Service con Docker, contexto `backend/` y Dockerfile `backend/Dockerfile`. El archivo fija el plan Free; no agregues discos ni instancias de pago.

Si creaste el Web Service manualmente, `render.yaml` no configura sus variables: agrégalas en **Environment** del servicio que sirve la URL pública y elige **Save and deploy**. En Render, la API rechaza el arranque si `APP_ENV` no es exactamente `production`; así no puede publicar por accidente los valores locales predeterminados.

| Variable exclusiva del backend | Valor |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL Session pooler del rol `finance_api`, con TLS |
| `SUPABASE_URL` | `https://PROYECTO.supabase.co` |
| `SUPABASE_SECRET_KEY` | Clave secreta `sb_secret_...` de Supabase, solo para eliminación administrativa en Auth |
| `FRONTEND_ORIGINS` | JSON de orígenes exactos, por ejemplo `["https://TU-SITIO.vercel.app"]` |
| `TRUST_PROXY_HEADERS` | `true` solo detrás del ingreso HTTP administrado de Render |

El último ajuste toma la IP original desde la cabecera suministrada por el proxy de Render. Déjalo `false` en servidores accesibles directamente y comprueba el comportamiento antes de abrir registro. No expongas el puerto interno por otra vía. [Cabeceras y protección de Render](https://render.com/articles/how-render-handles-ddos-attacks).

La URL del servicio tendrá forma `https://TU-API.onrender.com`. La API no conserva archivos en el disco efímero. Los logs de acceso están deshabilitados y los errores públicos no incluyen parámetros SQL ni salidas del parser. No habilites logs de cuerpos, cabeceras Authorization o contraseñas.

`/api/v1/health` es una comprobación de proceso, no una prueba de conexión a Supabase. Después de desplegar, valida `/api/v1/me` y una lectura de cuentas mediante una sesión real. El primer acceso puede tardar por la reactivación del servicio; la interfaz espera y permite reintentar.

## 4. Publicar Vercel Hobby

Importa el repositorio y elige **Root Directory: `frontend`**, framework Vite, comando `npm run build` y salida `dist`. Se usará `frontend/vercel.json`.

| Variable pública del frontend | Valor |
| --- | --- |
| `VITE_API_URL` | `https://TU-API.onrender.com/api/v1` |
| `VITE_SUPABASE_URL` | `https://PROYECTO.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del proyecto |

Estas variables se incluyen en el JavaScript público. No pongas aquí contraseñas PostgreSQL, claves `service_role` ni el secreto OAuth de Google. Las variables se incorporan al compilar; vuelve a desplegar después de cambiarlas.

Completa el origen exacto en Render y el callback exacto en Supabase cuando tengas la URL definitiva. No autorices todos los previews de Vercel contra la base real. La CSP admite los subdominios de Supabase y Render; si adoptas dominios propios, ajusta `connect-src` y los callbacks.

## 5. Migrar tu historial desde una copia SQLite

Haz esto antes de abrir el registro. No se ha ejecutado una migración de tus datos reales. Conserva la instalación anterior y sus PDFs como respaldo; no ejecutes Alembic sobre `solo_finanzas.db`.

1. Detén la API anterior y crea una copia consistente del SQLite. Si hay archivos WAL, usa la API `sqlite3.Connection.backup()` o la orden `.backup` de SQLite; copiar solo el `.db` mientras hay escrituras puede perder datos.
2. Ingresa una vez con Google en la beta y consulta tu UUID en Supabase Auth. No crees cuentas ni importes cartolas en ese usuario antes de migrar. El script reemplaza únicamente sus categorías/reglas iniciales sin uso y rechaza un destino que ya tenga cuentas.
3. Apunta `DATABASE_URL` local a PostgreSQL con credenciales de migración y ejecuta desde `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts/migrate_sqlite.py --source 'C:\ruta\copia-consistente.db' --owner 'UUID-DE-SUPABASE'
```

Sin `--apply`, ejecuta toda la importación y **revierte la transacción**. El reporte confirma cantidades de las seis tablas, agrupaciones de cuenta/mes, ingresos, egresos, saldo y clasificaciones. Remapea IDs y referencias, conserva categorías, reglas, clasificaciones y coincidencias de transferencias; no importa rutas de archivos ni texto bruto. No elimina transacciones repetidas del origen. Verifica también visualmente tus cuentas, meses y categorías.

4. Repite el mismo comando agregando `--apply` solo después de revisar el ensayo. Conserva el reporte y el hash de la copia de origen. El script exige el UUID explícito; no adivina la identidad por correo y no sobrescribe cuentas existentes. Un segundo intento sobre el mismo usuario se rechaza.
5. Si hay categorías duplicadas, referencias inválidas o checksums de cartolas incompatibles, el ensayo falla y revierte. Corrige una **nueva copia**, documentando los cambios; conserva el original.

## 6. Respaldos diarios cifrados en Windows

Instala las herramientas cliente PostgreSQL `pg_dump`, `pg_restore` y `psql` de una versión igual o posterior a la del servidor y agrégalas al PATH. El respaldo cubre `finance`, incluyendo perfiles internos y la versión Alembic. **No copia la configuración ni los usuarios del servicio Supabase Auth**: conserva ese proyecto y sus UUID para una recuperación completa.

Desde la raíz ejecuta manualmente, una vez:

```powershell
.\scripts\install-backup-task.ps1
```

El instalador pide la URL administrativa mediante entrada oculta, genera una clave de cifrado y guarda la configuración protegida por DPAPI de tu usuario Windows fuera del repositorio. Muestra la clave una sola vez: cópiala a tu gestor de contraseñas, separado de las copias. Si pierdes el equipo y la clave, no podrás recuperar los archivos cifrados.

La tarea `SoloFinanzasBackup` corre a las 09:00, al iniciar sesión y al recuperar una ejecución pendiente. Reintenta tres veces si falla. Necesita que el equipo se encienda, tu sesión esté disponible y haya conexión. Conserva siete archivos diarios verificados y no repite una copia del mismo día. Revisa en el Programador de tareas el resultado de la última ejecución; no se ha instalado esta tarea automáticamente ni configurado una conexión real.

Para un ensayo de restauración configura en el proceso local `BACKUP_DATABASE_URL` (base de prueba vacía), `BACKUP_KEY` (clave guardada) y ejecuta desde `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts/backup.py --restore 'C:\ruta\solofinanzas-AAAAMMDD.enc'
```

El script valida cifrado y checksum, rechaza una base con tablas de usuario y restaura en una sola transacción. No usa `--clean` ni reemplaza una base existente. Ensaya en PostgreSQL vacío separado; una base Supabase nueva puede tener tablas de Auth y será rechazada por esta protección. Compara cuentas, movimientos y totales; reaplica los permisos del rol antes de usar un destino restaurado. Para una recuperación real de Supabase planifica la incorporación del esquema restaurado preservando Auth y sus UUID. El archivo financiero por sí solo no recrea accesos de Google.

## 7. Pruebas y apertura

```powershell
# backend/
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
# frontend/
npm ci
npm run build
npx playwright install chromium
npx playwright test
```

Las pruebas de `backend/tests/`, `frontend/tests/` y la configuración de Playwright están versionadas. Playwright simula las respuestas de Auth/API para probar rutas, cancelación, sesión vencida, recarga, cambio de identidad y cierre de sesión en móvil/escritorio; no acredita que Google esté bien configurado. Para probar PostgreSQL define `TEST_DATABASE_URL` en una base desechable: sus tablas se crean y eliminan. `TEST_POSTGRES_ADMIN_URL` habilita el ensayo de migraciones, permisos, dump cifrado y restauración en dos bases temporales. **Nunca uses una base personal o de producción para estas variables.** El workflow `.github/workflows/ci.yml` prepara PostgreSQL y ejecuta estas pruebas, además de comprobar dependencias, migraciones y compilación.

Antes de abrir nuevos registros, confirma:

- Acceso real con Google con dos usuarios de prueba, cancelación, recarga directa de `/app/accounts`, salida y cambio de usuario.
- Cada usuario ve solo sus cuentas, categorías, reglas, cartolas, exportación y transferencias. Intenta consultar y modificar IDs del otro.
- Preview/importación real con PDF ficticio; duplicado en la misma cuenta; la misma cartola en otro usuario; archivo inválido, límite de páginas/peso y dos importaciones simultáneas.
- Eliminación desde Perfil tras volver a autenticar con Google. Una baja pendiente bloquea recursos financieros y permite reintentar la eliminación si Auth falla. El UUID de bloqueo permanece para invalidar JWT aún vigentes; una cuenta recreada recibe otra identidad.
- Comparación de migración y restauración ensayada; primera copia diaria ejecutada y clave guardada.
- Data API deshabilitada, callbacks y CORS exactos, claves ausentes del bundle y del repositorio.
- Revisa el texto público de privacidad y agrega un canal de contacto propio antes de invitar usuarios externos.

## Costos y decisiones pendientes

No se han contratado planes ni dominios. Vercel Hobby limita su uso a proyectos personales no comerciales: una beta sin cobros no basta para garantizar esa clasificación. Supabase Free y Render Free tienen límites de recursos y suspensión; revisa las condiciones antes de publicar. Fuentes: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase](https://supabase.com/pricing), [Render Free](https://render.com/docs/free).

La auditoría de dependencias debe revisarse en CI. La cadena de desarrollo Tailwind 3 contiene avisos de `braces`; no se procesa entrada de usuarios mediante esas herramientas en producción. Su resolución requiere actualizar esa cadena (posiblemente Tailwind 4) y una revisión visual separada. No uses `npm audit fix --force` sin comprobar el diseño.

Correo/contraseña, espacios compartidos, múltiples instancias y un respaldo administrado fuera de tu equipo quedan fuera de esta beta.
