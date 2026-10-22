/* ============================================================================
   AvisoInstalar.jsx  —  "INSTALÁ LA APP EN EL TELÉFONO"
   ----------------------------------------------------------------------------
   Instalada en la pantalla de inicio, la app abre a pantalla completa, arranca
   sin señal y (en el iPhone, sobre todo) el teléfono no borra las cargas que
   esperan para enviarse. Pero nadie la instala si no se le dice cómo.

   Aparece en el Inicio, SOLO en un teléfono o tablet y SOLO si la app todavía
   no está instalada. Se cierra con la X y no vuelve a aparecer en ese teléfono.

   TRES CASOS
     Android / Chrome  el navegador avisa que se puede instalar (evento
                       beforeinstallprompt): botón "Instalar" que abre su
                       ventana.
     iPhone / iPad     Safari no tiene botón: se explica Compartir → Agregar a
                       inicio.
     Otro              se explica el menú ⋮ del navegador.

   Usado en: pages/Home.jsx. En MOSTRAR_AVISO_INSTALAR = false no aparece.
   ============================================================================ */

import { useEffect, useState } from 'react';
import Aviso from './ui/Aviso';

const MOSTRAR_AVISO_INSTALAR = true;
const CLAVE_CERRADO = 'grandes-generadores-aviso-instalar-cerrado';

/* Chrome dispara el evento una sola vez, apenas carga la página: se guarda acá
   aunque el Inicio todavía no esté en pantalla. */
let pedidoDeInstalacion = null;
const avisarCambio = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoDeInstalacion = e;
    avisarCambio.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    pedidoDeInstalacion = null;
    avisarCambio.forEach((fn) => fn());
  });
}

function yaInstalada() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari del iPhone no entiende display-mode: tiene su propia marca.
    window.navigator.standalone === true
  );
}

const esTactil = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const esIphone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  // El iPad nuevo dice ser una Mac, pero tiene pantalla táctil.
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

function leerCerrado() {
  try {
    return localStorage.getItem(CLAVE_CERRADO) === 'si';
  } catch {
    return false;
  }
}

function AvisoInstalar() {
  const [cerrado, setCerrado] = useState(leerCerrado);
  const [, refrescar] = useState(0);

  useEffect(() => {
    const fn = () => refrescar((n) => n + 1);
    avisarCambio.add(fn);
    return () => avisarCambio.delete(fn);
  }, []);

  if (!MOSTRAR_AVISO_INSTALAR || cerrado || !esTactil() || yaInstalada()) return null;

  function cerrar() {
    try {
      localStorage.setItem(CLAVE_CERRADO, 'si');
    } catch {
      // Sin almacenamiento, vuelve a aparecer la próxima vez: no es grave.
    }
    setCerrado(true);
  }

  async function instalar() {
    const pedido = pedidoDeInstalacion;
    if (!pedido) return;
    pedido.prompt();
    const { outcome } = await pedido.userChoice;
    pedidoDeInstalacion = null;
    if (outcome === 'accepted') setCerrado(true);
    else refrescar((n) => n + 1);
  }

  const comoInstalar = pedidoDeInstalacion
    ? null
    : esIphone()
      ? 'Tocá Compartir (el cuadrado con la flecha) y después "Agregar a inicio".'
      : 'Abrí el menú ⋮ del navegador y elegí "Instalar app" o "Agregar a la pantalla principal".';

  return (
    <Aviso
      tipo="info"
      titulo="Instalá la app en el teléfono"
      accion={
        <span className="aviso-instalar-botones">
          {pedidoDeInstalacion && (
            <button type="button" className="btn-primario" onClick={instalar}>
              Instalar
            </button>
          )}
          <button type="button" className="btn-secundario" onClick={cerrar} aria-label="No mostrar más">
            Ahora no
          </button>
        </span>
      }
    >
      Abre más rápido y funciona sin señal. {comoInstalar}
    </Aviso>
  );
}

export default AvisoInstalar;
