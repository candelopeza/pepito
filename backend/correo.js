/* ============================================================================
   backend/correo.js  —  ENVÍO DE CORREO ELECTRÓNICO
   ----------------------------------------------------------------------------
   Lo usa la notificación por correo (rutas/notificaciones.js): cuando el
   local tiene un correo cargado, la cédula se le puede mandar por esa vía,
   además de (o en vez de) la cédula en papel que lleva el notificador.

   CONFIGURACIÓN, en backend/.env (ver .env.ejemplo):
     CORREO_HOST      servidor SMTP del municipio
     CORREO_PUERTO    587 (STARTTLS, lo usual) o 465 (TLS directo)
     CORREO_USUARIO   cuenta con la que se autentica (vacío si no pide)
     CORREO_CLAVE     su clave
     CORREO_DESDE     lo que ve el titular como remitente,
                      por ejemplo "Dirección de Ambiente <ambiente@smt.gob.ar>"

   SIN CORREO_HOST el envío queda APAGADO: la opción no aparece en el front
   (capacidad `correo` en /salud) y la ruta lo rechaza con un mensaje claro.
   Así el sistema anda igual en una máquina sin salida SMTP, que es el caso de
   desarrollo.

   >>> EL ENVÍO NO ES PARTE DE LA TRANSACCIÓN <<<
   La cédula se emite y se guarda primero; el correo sale después. Si el SMTP
   falla, la cédula igual existe (con número) y la pantalla avisa que no se
   pudo mandar, para reintentarlo desde "Enviar por correo" o seguir en papel.
   Al revés sería peor: un correo que llegó con una cédula que no quedó
   registrada.
   ============================================================================ */

import nodemailer from 'nodemailer';

const limpio = (v) => String(v ?? '').trim();

export function correoConfigurado() {
  return Boolean(limpio(process.env.CORREO_HOST) && limpio(process.env.CORREO_DESDE));
}

/* Lo que se muestra en /salud: de dónde salen los correos, sin la clave. */
export function descripcionCorreo() {
  if (!correoConfigurado()) return null;
  return { servidor: limpio(process.env.CORREO_HOST), desde: limpio(process.env.CORREO_DESDE) };
}

let transporte = null;

function transportador() {
  if (transporte) return transporte;
  const puerto = Number(limpio(process.env.CORREO_PUERTO) || 587);
  const usuario = limpio(process.env.CORREO_USUARIO);
  transporte = nodemailer.createTransport({
    host: limpio(process.env.CORREO_HOST),
    port: puerto,
    secure: puerto === 465,
    auth: usuario ? { user: usuario, pass: process.env.CORREO_CLAVE ?? '' } : undefined,
    // Un SMTP que no contesta no puede dejar colgado el pedido del front.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return transporte;
}

/* Manda un correo. Tira si no está configurado o si el servidor lo rechaza:
   quien llama decide cómo contarlo. `texto` es el cuerpo en texto plano (la
   cédula tal cual se imprime); el HTML es el mismo texto con letra fija,
   para que las columnas y los espacios de la plantilla no se desarmen. */
export async function enviarCorreo({ para, asunto, texto, responderA = null }) {
  if (!correoConfigurado()) throw new Error('El envío de correo no está configurado (CORREO_HOST y CORREO_DESDE en .env)');
  const html = `<pre style="font-family: Consolas, 'Courier New', monospace; font-size: 13px; white-space: pre-wrap">${escaparHtml(texto)}</pre>`;
  const info = await transportador().sendMail({
    from: limpio(process.env.CORREO_DESDE),
    to: para,
    replyTo: responderA || undefined,
    subject: asunto,
    text: texto,
    html,
  });
  return { id: info.messageId ?? null };
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
