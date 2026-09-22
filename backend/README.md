# Sistema de Gestión para Salón de Belleza

Aplicación web completa para administrar un salón: agenda, clientes,
profesionales, servicios, comisiones, cobros, reportes, **reservas online de
clientes con pago por QR** y **aviso de cita confirmada**.

- **Backend:** Node.js + Express
- **Base de datos:** SQLite alojada en **Turso** (plan gratuito, sin PostgreSQL)
- **Frontend:** HTML/CSS/JavaScript, responsive (celular y computadora)
- **Despliegue:** Render (plan gratuito, ya no hace falta disco de pago)

---

## ⚠️ Antes que nada: cambia esta contraseña

El proyecto anterior tenía el archivo `backend/.env` subido con la contraseña
real de tu base de datos PostgreSQL de Render **a la vista**. Ese archivo ya no
está en esta versión, pero si ese repositorio es público (o lo fue), **borra esa
base de datos de Render o cambia su contraseña hoy mismo**. Cualquiera que haya
visto el repositorio pudo entrar a ella.

---

## 1. Qué cambió respecto a tu versión anterior

| Antes | Ahora |
|---|---|
| PostgreSQL en Render | SQLite en **Turso**, gratis |
| Archivo SQLite que se borraba al reiniciar | Base en la nube, no se pierde nada |
| "Eliminar" solo cancelaba la cita | **Botón 🗑️ real** en citas, clientes, profesionales, servicios, usuarios y avisos |
| Un solo admin creado a mano | **3 usuarios creados solos** al arrancar |
| La página de reservas no estaba conectada | Reservas públicas funcionando, con **QR de pago** |
| Sin aviso al cliente | **Aviso de cita confirmada** (correo + WhatsApp + página de estado) |

---

## 2. Crear la base de datos en Turso (gratis, 5 minutos)

1. Entra a **https://turso.tech** y crea una cuenta (puedes usar tu GitHub).
2. Crea una base de datos nueva. Ponle de nombre `salon`.
3. Cuando esté creada, Turso te muestra dos datos. Cópialos y guárdalos:
   - **Database URL**, algo como `libsql://salon-tuusuario.turso.io`
   - **Auth Token**, un texto largo que empieza con `eyJ...`

   Si prefieres hacerlo por consola:
   ```bash
   turso db create salon
   turso db show salon --url
   turso db tokens create salon
   ```

El plan gratuito de Turso alcanza de sobra para un salón.

---

## 3. Probarlo en tu computadora (opcional)

Necesitas **Node.js 18 o superior** (https://nodejs.org, versión LTS).

```bash
cd backend
npm install
```

Crea el archivo `backend/.env` copiando `.env.example` y pega tus datos:

```
TURSO_DATABASE_URL=libsql://salon-tuusuario.turso.io
TURSO_AUTH_TOKEN=eyJ...
JWT_SECRET=un-texto-largo-y-secreto-que-inventes
ADMIN_PASSWORD=tu-contraseña-de-administrador
```

> Si dejas vacías las dos variables de Turso, el sistema usa un archivo local
> en `data/salon.db`. Sirve para probar sin conexión.

Prepara la base y arranca:

```bash
npm run setup     # crea las tablas y los usuarios administradores
npm run seed      # OPCIONAL: datos de demostración (servicios, citas de ejemplo)
npm start
```

Abre **http://localhost:3000**

---

## 4. Subirlo a GitHub y desplegarlo en Render

1. Sube esta carpeta a tu repositorio de GitHub (reemplazando la versión vieja).
2. En Render: **New +** → **Blueprint** → elige el repositorio.
   Render lee el archivo `render.yaml` y crea el servicio web solo.
3. Entra a tu servicio → pestaña **Environment** y completa:

   | Variable | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | tu URL `libsql://...` |
   | `TURSO_AUTH_TOKEN` | tu token `eyJ...` |
   | `ADMIN_PASSWORD` | la contraseña que quieras para el admin |

   `JWT_SECRET` lo genera Render automáticamente.
4. Guarda. Render reinicia el servicio, crea las tablas y los usuarios solo.

**Ya funciona en el plan Free**, porque los datos viven en Turso y no en el
disco del servidor.

> Nota del plan gratuito de Render: si nadie entra durante un rato, el servicio
> "se duerme" y la primera visita tarda unos 30 segundos en cargar. Es normal.

---

## 5. Usuarios creados automáticamente

Al arrancar se crean estos usuarios si no existen:

| Correo | Rol | Contraseña |
|---|---|---|
| `admin@salon.com` | Administrador | la de `ADMIN_PASSWORD` (por defecto `123456`) |
| `admin2@salon.com` | Administrador | `123456` |
| `recepcion@salon.com` | Recepción | `123456` |

**Entra y cámbialas** desde *Configuración → Usuarios*.

¿Olvidaste la contraseña? Pon `RESET_ADMIN_PASSWORD=true` en las variables de
entorno, reinicia una vez, y vuelve a ponerlo en `false`.

Puedes crear más administradores desde *Configuración → Usuarios → + Nuevo usuario*.

---

## 6. Cargar tu QR de pago (lo hace el administrador)

1. Entra como administrador.
2. Ve a **⚙️ Configuración → 💳 Pago y QR**.
3. Sube la imagen de tu QR (banco o billetera móvil).
4. Completa el titular, el banco y las instrucciones.
5. Elige cuánto debe pagar el cliente para reservar:
   - **Porcentaje del servicio** (ej. 50%)
   - **Monto fijo**
   - **Sin anticipo**
6. Marca *"Exigir que el cliente suba el comprobante"* si quieres que sea
   obligatorio.
7. Pulsa **Guardar configuración**.

El QR queda guardado en la base de datos, así que no se pierde aunque Render
reinicie el servicio.

---

## 7. Cómo reserva el cliente

La página pública es **`tu-sitio.com/reservar.html`** (compártela por WhatsApp,
Instagram, etc.).

1. **Paso 1** — elige servicio, profesional, fecha y uno de los horarios libres.
2. **Paso 2** — escribe su nombre, teléfono y correo (opcional).
3. **Paso 3** — **ve tu QR**, el monto exacto que debe pagar, paga, y sube la
   captura del comprobante.
4. Recibe un **código de reserva** (ej. `K7P2QA`) y un enlace para seguir su cita.

La cita entra como **pendiente**. Nunca se confirma sola.

---

## 8. Cómo confirma el salón y cómo se entera el cliente

1. En el panel verás **🔔 Reservas web** con un contador rojo de pendientes.
2. Pulsa 🧾 para **ver el comprobante** que subió el cliente.
3. Márcalo como *Pago verificado* o *Rechazado*.
4. Pulsa **Confirmar**. En ese momento el cliente se entera por **tres vías**:

   - **Página de estado:** entra a `mi-cita.html` con su código y ve
     "✅ ¡Cita confirmada!". La página se refresca sola cada 30 segundos y le
     muestra un aviso del navegador en cuanto cambia.
   - **WhatsApp:** aparece un botón **📲 Enviar por WhatsApp** con el mensaje ya
     escrito. Un clic y se envía. Es gratis y no requiere contratar nada.
   - **Correo electrónico:** automático, si configuras el SMTP (punto 9).

---

## 9. Correo automático (opcional y gratis)

Si quieres que el cliente reciba el aviso por email sin que hagas nada, agrega
estas variables de entorno en Render (ejemplo con Gmail):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=clave-de-aplicacion-de-16-letras
SMTP_FROM=Mi Salón <tucorreo@gmail.com>
```

La `SMTP_PASS` **no** es tu contraseña de Gmail: es una
"contraseña de aplicación" que se genera en la configuración de seguridad de tu
cuenta de Google (requiere verificación en dos pasos activada).

Si no configuras nada, el sistema sigue funcionando: el aviso queda guardado y
se lo mandas por WhatsApp.

---

## 10. Los botones de eliminar

Todos son exclusivos del **administrador** y piden confirmación.

| Dónde | Qué hace |
|---|---|
| Agenda → abrir cita → 🗑️ Eliminar cita | Borra la cita con sus pagos, comisiones y avisos |
| Reservas web → 🗑️ | Igual, desde la lista de reservas |
| Cobros → 🗑️ | Igual, desde la lista de cobros |
| Clientes → 🗑️ | Borra el cliente. Si tiene citas, te avisa y te pregunta si borras todo |
| Profesionales → 🗑️ | Borra al profesional. Si tiene citas, te ofrece **desactivarlo** para no perder el historial |
| Servicios → 🗑️ | Igual que profesionales |
| Usuarios → 🗑️ | Borra el usuario. No puedes borrarte a ti mismo ni al único administrador |
| Reservas web → avisos → 🗑️ | Borra un aviso del historial |

¿Prefieres cancelar en vez de borrar? Abre la cita y cambia el estado a
**Cancelada**: así sigue apareciendo en los reportes.

---

## 11. Resumen de las páginas

| Dirección | Para quién |
|---|---|
| `/` | Personal del salón (login) |
| `/reservar.html` | Clientes: reservan y pagan con el QR |
| `/mi-cita.html` | Clientes: consultan el estado con su código |

---

## 12. Si algo falla

| Síntoma | Qué revisar |
|---|---|
| "Ocurrió un error en el servidor" al entrar | Faltan `TURSO_DATABASE_URL` o `TURSO_AUTH_TOKEN` en Render |
| "Correo o contraseña incorrectos" | Mira los *Logs* de Render: ahí se imprime qué usuarios se crearon |
| El cliente no ve el QR | No lo has subido en *Configuración → Pago y QR*, o no guardaste |
| "La imagen es demasiado pesada" | Usa una captura más chica; el sistema ya la comprime, pero el límite son ~2 MB |
| La primera carga tarda mucho | Es el plan gratuito de Render "despertando" |
| No llegan correos | Falta el SMTP (punto 9). Usa el botón de WhatsApp mientras tanto |

---

## 13. Estructura del proyecto

```
backend/
  server.js                    arranque del servidor
  src/config/db.js             conexión a Turso / SQLite
  src/routes/                  endpoints de la API
    public.routes.js           reservas de clientes, QR, estado por código
    settings.routes.js         configuración del salón y del QR
  src/utils/                   notificaciones, correo, cálculos
database/
  migrations/                  creación de tablas (se aplican solas)
  seed/seed.sql                datos de demostración
  create-admin.js              usuarios administradores
frontend/
  index.html + js/app.js       panel del salón
  reservar.html                reserva pública con QR
  mi-cita.html                 estado de la cita para el cliente
```
