# Sistema de Gestión para Salón de Belleza

Aplicación web completa para administrar un salón de belleza: agenda de citas,
clientes, profesionales, servicios, comisiones, cobros, pagos parciales,
reportes, estimación de cobros futuros y notificaciones internas.

- **Backend:** Node.js + Express
- **Base de datos:** SQLite (un solo archivo, sin servidor de base de datos separado)
- **Frontend:** HTML/CSS/JavaScript, responsive (funciona en celular y computadora)
- **Despliegue recomendado:** [Render](https://render.com)

Estas instrucciones están escritas para alguien que **no** es programador.
Sigue los pasos en orden y no te lo saltes.

---

## 1. ¿Qué necesitas instalar en tu computadora? (solo para probarlo localmente)

Si solo quieres subirlo directo a Render, puedes saltar al **paso 7**.

1. **Node.js** (versión 18 o superior): descárgalo de https://nodejs.org (elige la versión "LTS").
2. **Git**: https://git-scm.com/downloads (para subir el proyecto a GitHub).

No necesitas instalar ninguna base de datos por separado: SQLite es solo un
archivo (`data/salon.db`) que se crea automáticamente.

---

## 2. Instalar el proyecto localmente

1. Descarga o descomprime esta carpeta del proyecto (`salon-app`).
2. Abre una terminal (en Windows: "Símbolo del sistema" o "PowerShell"; en Mac: "Terminal").
3. Entra a la carpeta del backend:

   ```bash
   cd salon-app/backend
   npm install
   ```

   Esto descarga todas las librerías necesarias. Puede tardar uno o dos minutos.

---

## 3. Configurar el archivo `.env`

1. Ve a la carpeta raíz del proyecto (`salon-app/`) y copia el archivo `.env.example`.
2. Pega la copia dentro de la carpeta `backend/` y renómbrala a `.env` (así: `salon-app/backend/.env`).
3. Ábrelo con cualquier editor de texto y completa:

   ```env
   DATABASE_URL=
   JWT_SECRET=escribe-aqui-cualquier-texto-largo-y-secreto
   NODE_ENV=development
   PORT=3000
   ```

   Deja `DATABASE_URL` vacío para desarrollo local: el sistema creará solo el
   archivo `data/salon.db` en la raíz del proyecto la primera vez que corras
   las migraciones.

---

## 5. Ejecutar las migraciones (crear las tablas)

Desde la carpeta `salon-app/backend`, ejecuta:

```bash
npm run migrate
```

Esto crea automáticamente todas las tablas necesarias (clientes, citas,
profesionales, servicios, pagos, comisiones, notificaciones, etc.).

Opcionalmente, para cargar datos de ejemplo y ver el sistema funcionando
de inmediato (clientes, profesionales, servicios y citas de prueba):

```bash
npm run seed
```

Esto crea usuarios de prueba (contraseña `123456` para todos):

- `admin@salon.com` — acceso total (administrador)
- `recepcion@salon.com` — agenda, clientes y cobros
- `maria@salon.com` — solo su agenda y comisiones (profesional)

---

## 6. Iniciar la aplicación localmente

Desde `salon-app/backend`:

```bash
npm start
```

Verás el mensaje `Servidor escuchando en el puerto 3000`. Abre tu navegador en:

```
http://localhost:3000
```

El frontend y el backend corren juntos en un solo servidor, así que no necesitas
configurar nada más.

---

## 7. Subir el proyecto a GitHub

1. Crea una cuenta en https://github.com si no tienes una.
2. Crea un repositorio nuevo (botón verde "New").
3. En tu computadora, dentro de la carpeta `salon-app`, ejecuta:

   ```bash
   git init
   git add .
   git commit -m "Primera versión del sistema del salón"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
   git push -u origin main
   ```

   Reemplaza `TU-USUARIO/TU-REPOSITORIO` por los datos de tu repositorio.

> **Importante:** el archivo `.env` con tus contraseñas reales **no se sube**
> a GitHub (está protegido por el archivo `.gitignore`). Solo se sube
> `.env.example`, que no tiene datos sensibles.

---

## 8. Crear el servicio en Render (despliegue automático)

Este proyecto incluye un archivo `render.yaml` que le dice a Render exactamente
qué crear, para que no tengas que configurar nada manualmente.

1. Crea una cuenta en https://render.com (puedes entrar con tu cuenta de GitHub).
2. Dentro de Render, haz clic en **"New +"** y elige **"Blueprint"**.
3. Selecciona el repositorio de GitHub que acabas de crear.
4. Render detectará el archivo `render.yaml` y te mostrará lo que va a crear:
   - Un **Web Service** llamado `salon-app` (tu aplicación), con un **Disco
     persistente** de 1 GB donde vive el archivo `salon.db`.

   > **Importante:** los Discos persistentes de Render requieren al menos el
   > plan **Starter** (de pago) para el Web Service; no están disponibles en
   > el plan Free. Si usas el plan Free, el archivo SQLite se perderá cada
   > vez que el servicio se reinicie.
5. Haz clic en **"Apply"** / **"Create"**.
6. Render instalará las dependencias, y al arrancar el servicio ejecutará las
   migraciones automáticamente sobre el disco persistente (esto ya está
   configurado en `render.yaml`: las migraciones corren al inicio, no durante
   el build, porque el disco solo está disponible en tiempo de ejecución).
   Este primer despliegue puede tardar unos minutos.

---

## 9. Cómo queda configurado `DATABASE_URL`

En `render.yaml`, `DATABASE_URL` ya está fijado a `/var/data/salon.db`, que es
un archivo dentro del Disco persistente que Render crea junto con el servicio.
`JWT_SECRET` se genera solo, de forma segura y aleatoria.

---

## 10. Primer despliegue: cargar datos de prueba (opcional)

Una vez que el servicio esté "Live" (activo) en Render:

1. Entra al servicio `salon-app` dentro de tu panel de Render.
2. Ve a la pestaña **"Shell"** (consola).
3. Ejecuta:

   ```bash
   npm run seed
   ```

4. Abre la URL pública que te dio Render (algo como
   `https://salon-app.onrender.com`) e inicia sesión con:

   - Correo: `admin@salon.com`
   - Contraseña: `123456`

   **Cambia esta contraseña de inmediato** desde la sección Configuración,
   o crea tu propio usuario administrador y elimina el de prueba.

---

## 11. Actualizaciones futuras

Cada vez que subas cambios nuevos a la rama `main` de GitHub (`git push`),
Render vuelve a desplegar la aplicación automáticamente y ejecuta las
migraciones pendientes (si agregas nuevos archivos `.sql` dentro de
`database/migrations/`, se aplicarán solos en el siguiente despliegue).

---

## Estructura del proyecto

```text
salon-app/
├── backend/            → API en Node.js/Express
│   ├── server.js
│   ├── src/
│   │   ├── config/      → conexión a SQLite (better-sqlite3)
│   │   ├── middleware/  → autenticación y roles
│   │   ├── routes/      → endpoints de la API
│   │   └── utils/       → cálculos de comisiones y saldos
│   └── package.json
├── database/
│   ├── migrations/      → scripts SQL que crean las tablas
│   ├── seed/            → datos de demostración
│   ├── migrate.js
│   └── seed.js
├── frontend/            → interfaz web (HTML/CSS/JS)
├── .env.example
├── render.yaml
└── README.md
```

## Roles de usuario

| Rol          | Acceso                                                       |
|--------------|----------------------------------------------------------------|
| Administrador | Todo el sistema                                               |
| Recepción     | Agenda, clientes y cobros                                     |
| Profesional   | Su propia agenda, sus citas y sus comisiones (solo lectura)   |

## Preguntas frecuentes

**¿Puedo rentar este sistema a varios salones distintos?**
Sí: como cada instalación usa su propio archivo SQLite, la forma recomendada
es desplegar una instancia (Web Service + Disco) separada por cada salón/marca
que te rente el sistema, cada una con su propio `DATABASE_URL` y sus propios
datos, completamente aislados entre sí.

**¿Cómo agrego WhatsApp o correo a las notificaciones más adelante?**
Las notificaciones ya se guardan en la tabla `notifications` con toda la
información necesaria (mensaje, cliente, cita). Más adelante solo hay que
agregar el código que las envíe por WhatsApp/correo en
`backend/src/routes/notifications.routes.js` y `appointments.routes.js`,
sin cambiar la base de datos.

**¿Cómo agrego un servicio o profesional después del primer despliegue?**
Desde la propia aplicación web, en las secciones "Servicios" y
"Profesionales" (solo el rol Administrador puede crearlos/editarlos).
