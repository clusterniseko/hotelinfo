# Hilton Niseko Village — Landing pages + Content Manager

```
hh.html        Landing HH        (inglés + japonés)
non-hh.html    Landing Non-HH    (inglés + japonés)
jtb.html       Landing JTB       (solo japonés)
admin.html     Content Manager   (con login)
server.js      Servidor
package.json   Para que Railway sepa cómo arrancarlo
```

Contenido transcrito de los cinco documentos de agosto 2026 (HH_ENG, HH_JP,
JTB, Non_HH_ENG, Non_HH_JP), incluyendo todos los códigos QR decodificados
como enlaces pulsables.

---

## Desplegar en Railway

1. Sube esta carpeta a un repositorio de GitHub.
2. En Railway: **New Project → Deploy from GitHub repo**. Detecta Node y arranca solo.

### Añade un volumen (importante)

Sin volumen, lo que edites se pierde en cada redespliegue.

1. En tu servicio: **Variables → New Volume**, mount path `/data`.
2. Añade la variable `DATA_DIR` con valor `/data`.

Si se te olvida, el servidor te avisa en los logs al arrancar.

### Usuario y contraseña

El panel pide usuario y contraseña reales (pantalla propia, no el aviso del
navegador). Configúralos con las variables:

- `ADMIN_USER` — usuario (por defecto `admin`)
- `ADMIN_PASSWORD` — contraseña (por defecto `niseko2026` — cámbiala)

La sesión dura 12 horas. Las tres landing pages siguen abiertas para los
huéspedes sin pedir nada.

---

## URLs

| Página  | URL                       |
|---------|---------------------------|
| HH      | `tudominio.com/hh`        |
| Non-HH  | `tudominio.com/non-hh`    |
| JTB     | `tudominio.com/jtb`       |
| Panel   | `tudominio.com/admin`     |

Un QR distinto para cada una de las tres primeras.

---

## Cómo funciona el panel ahora

Ya no hay una pestaña "Shared content". Cada pestaña — **HH**, **Non-HH**,
**JTB** — muestra la landing page real a la izquierda, con su propio selector
de idioma, y los campos de edición a la derecha. Editas un campo y la vista
previa se actualiza al instante, sin necesidad de guardar primero.

Como los restaurantes, instalaciones y varios textos son los mismos en las
tres páginas, editarlos desde cualquier pestaña actualiza las demás — cada
fila te avisa si es *"Shared"* o *"Only on this page"*.

Guarda solo mientras escribes (autosave). El punto verde **Live** confirma que
ya está en el servidor; las páginas lo recogen en unos 15 segundos, incluso
las que un huésped tenga abiertas. Si prefieres controlar cuándo se publica,
desactiva *Autosave* y usa **Save** o `Ctrl`/`Cmd`+`S`.

---

## Enlaces QR (agosto 2026)

| Enlace | Destino | Aparece en |
|---|---|---|
| Impuesto Niseko (EN/JP) | PDF de la web de Niseko | las 3 |
| In-room Settings / 室内空調設定 | `nisekocluster.com/guides/` | las 3 |
| Luggage Assistance / お荷物のお手伝い | `pickup.nisekocluster.com/` | las 3 |
| QR Concierge / QRコンシェルジュ | `nisekovillage.hiltonjapan.co.jp/…/QRconcierge` | las 3 |
| Join Hilton Honors / ヒルトンオーナーズ | `secure3.hilton.com/…?OCODE=I296W` | Non-HH, JTB |
| Room Service (en la tabla) | `hiltonnisekovillage.wi-q.com` | las 3 |

---

## Diferencias entre páginas (agosto 2026)

|  | HH | Non-HH | JTB |
|---|---|---|---|
| Desayuno | Melt 2F | YOTEI 3F | Melt 2F |
| Wi-Fi | código `hhaug` | de pago (¥550/día) o gratis con Hilton Honors | código `2026aug` |
| Alta Hilton Honors | no | sí | sí |
| Bloque JTB Lounge | no | no | sí |
| Club Premium Japan (solo si se lee en japonés) | sí | sí | sí |
| Idiomas | EN + JP | EN + JP | solo JP |

---

## Notas

- Si el servidor no responde, el panel sigue guardando en el navegador para
  que no pierdas nada, y avisa en rojo. Al volver la conexión, pulsa **Save**.
- **Backup** en Settings descarga o restaura una copia completa. Conviene
  bajar una al empezar cada mes.
- **Reset to original** vuelve al contenido de agosto 2026 tal como está en
  esta guía.
- EZO (Pub) ya no aparece en ningún documento fuente y se quitó de las tres
  páginas.

---

## Probar en tu ordenador

```bash
node server.js
```

Y abre `http://localhost:3000/login` (usuario `admin`, contraseña `niseko2026`
salvo que hayas puesto las variables de entorno).
