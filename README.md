# Mini Social (demo)

Pequeña demo tipo Facebook. Incluye crear posts, dar like y comentar. Pensada solo para correr localmente.

Requisitos: Node.js

Instalación:

```powershell
npm install
npm start
```

Abre http://localhost:3000
Usuario de prueba:

Notas:

# Mini Social (demo)

Pequeña aplicación demo tipo "Facebook" para uso local. Incluye registro/login, creación de posts, likes, comentarios y avatares.

Requisitos
- Node.js (14+ recomendado)

Instalación

```powershell
npm install
```

Iniciar la app

```powershell
# Arranca el servidor (puerto 3000 por defecto)
node server.js

# o en desarrollo (si está configurado)
npm run dev
```

Accede a: http://localhost:3000

Endpoints principales

- POST /api/register { username, password }
- POST /api/login { username, password }
- POST /api/logout
- GET /api/me
- POST /api/posts { content } (auth required)
- GET /api/posts
- POST /api/posts/:id/like (auth required)
- POST /api/posts/:id/comments { text } (auth required)

Avatares

- Upload multipart: POST /api/me/avatar-file (campo `avatar`, tipo multipart/form-data)
	- Límites: sólo JPEG/PNG, tamaño máximo 200 KB
	- El servidor redimensiona a 256×256 y convierte a PNG optimizado antes de guardar.
	- Los avatares se sirven desde `/uploads/<file>.png`.
- DataURL (alternativa): POST /api/me/avatar { dataUrl }

Limpieza de uploads

- Endpoint manual: POST /api/cleanup-uploads (requiere sesión válida)
	- Borra archivos en `public/uploads` que no estén referenciados por ningún usuario.
- Limpieza automática: programada cada 24 horas por `server.js`.

Pruebas E2E (local)

```powershell
# Ejecuta el script E2E que prueba registro/login/post/like/comment
node test_e2e.js
```

Ejemplos rápidos (PowerShell)

- Registrar:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/register -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{ username='alice'; password='secret' }) -UseBasicParsing
```

- Login (capturar cookie):

```powershell
$r = Invoke-WebRequest -Uri http://localhost:3000/api/login -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{ username='alice'; password='secret' }) -SessionVariable s -UseBasicParsing
# la cookie queda en $s
```

- Crear post (usar la sesión guardada en $s):

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/posts -Method Post -Body (ConvertTo-Json @{ content='Hola desde PowerShell' }) -WebSession $s -ContentType 'application/json' -UseBasicParsing
```

- Subir avatar (multipart):

```powershell
#$file = 'C:\ruta\a\avatar.png'
Invoke-RestMethod -Uri http://localhost:3000/api/me/avatar-file -Method Post -WebSession $s -Form @{ avatar = Get-Item $file } -UseBasicParsing
```

- Disparar limpieza manual:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/cleanup-uploads -Method Post -WebSession $s -UseBasicParsing
```

Ejemplos rápidos (curl)

- Registrar:

```bash
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" -d '{"username":"alice","password":"secret"}' -c cookies.txt
```

- Login (guarda cookie en cookies.txt si no registraste):

```bash
curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"username":"alice","password":"secret"}' -c cookies.txt -b cookies.txt
```

- Crear post (usa cookie):

```bash
curl -X POST http://localhost:3000/api/posts -H "Content-Type: application/json" -d '{"content":"Hola desde curl"}' -b cookies.txt
```

- Subir avatar (multipart):

```bash
curl -X POST http://localhost:3000/api/me/avatar-file -F "avatar=@avatar.png" -b cookies.txt
```

- Disparar limpieza manual:

```bash
curl -X POST http://localhost:3000/api/cleanup-uploads -b cookies.txt
```

Notas de seguridad y siguientes pasos

- Esta app es una demo y no está lista para producción.
- Mejoras recomendadas:
	- Usar variables de entorno para `SESSION_SECRET` y otros secretos.
	- Habilitar HTTPS y marcar cookies como secure/sameSite.
	- Añadir control de roles (admin) para operaciones sensibles (p. ej. limpieza manual).
	- Registrar auditoría (tabla DB) para archivos borrados por la limpieza.

Estado actual

- Persistencia: SQLite (`data.sqlite`) con migración desde `data.json` si existe.
- Validación de uploads y procesamiento con `sharp` (redimensionado/compress).

Administración / roles

- El proyecto crea un admin por defecto si la base de datos está vacía: `admin` / `admin` (cambiar en producción).
- Promover a otro usuario a admin (requiere ser admin): POST /api/make-admin/:id


Contacto

- Proyecto creado como demo. Puedes editarlo y adaptarlo para tus necesidades.
