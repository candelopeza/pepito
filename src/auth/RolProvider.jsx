/* ============================================================================
   auth/RolProvider.jsx  —  GUARDA QUIÉN ES EL USUARIO Y CON QUÉ ROL ENTRÓ
   ----------------------------------------------------------------------------
   Es la mitad ESCRITURA del sistema de roles. Para LEER desde una pantalla se
   usa `useRol()` de auth/rolContexto.js, nunca este archivo.

   QUÉ REPARTE:
     rol       el id del rol activo ('coordinacion', 'relevador', ...)
     datosRol  el objeto completo del rol, con etiqueta y descripción
     usuario   la persona: { id, nombre (el id_persona), nombreCompleto, cuil,
               email, rol, deLaBase }
     agente / elegirAgente  la persona identificada, o null (público).
     sesion    'cargando' | 'identificado' | 'publico', con `motivo` cuando
               es público y había token (para que la consola lo diga).

   >>> DESDE EL 12/11/2026 LA IDENTIDAD LA DA CiDiTuc <<<
   CiDiTuc abre el sistema con un token en la dirección. Al arrancar:
     1. auth/sesion.js captura el token y lo guarda para esta pestaña;
     2. se le pregunta al backend GET /sesion quién es (el backend verifica el
        token, backend/cidituc.js, y busca el número de persona en la tabla
        `usuario`: si está, es personal del área con el rol de su tipo; si no,
        es público = titular);
     3. elegirAgente() carga esa persona y todas las pantallas se enteran por
        useRol(). Sin token, o con token inválido, se queda como público.

   El token vive en localStorage (auth/sesion.js): sigue al cerrar la app.
   Hasta el 06/11/2026 se guardaba ahí el usuario elegido en la barra; esas
   claves viejas se borran al arrancar.

   >>> EN EL CELULAR NO SE QUEDA AFUERA (27/11/2026) <<<
   Pasaba que la app "se cerraba" y no había cómo volver a entrar. Ahora:
     - si el token venció (dura 24 horas), se avisa (sesion.vencio) y la barra
       y el aviso de Layout.jsx ofrecen "Ingresar", que lleva a CiDiTuc;
     - sin señal al abrir, no se pasa a público: se sigue con la última
       persona confirmada con ese token (sesion.sinVerificar) y se vuelve a
       preguntar al volver la señal, al volver a la app y cada minuto;
     - el token solo se borra si CiDiTuc lo rechazó. Antes se borraba también
       cuando el servidor no tenía CiDiTuc configurado (un reinicio mal hecho
       dejaba a todos afuera);
     - si entró por el navegador (o por otra pestaña), la app lo ve al volver
       a primer plano y queda identificada sin cerrar ni recargar.

   POR QUÉ EL USUARIO VIVE ACÁ Y NO EN EL STORE DE DATOS: porque el store lo
   necesita (firma la auditoría con el nombre del usuario), y si el usuario
   viviera adentro del store habría una dependencia circular. Por eso en
   App.jsx el orden es <RolProvider> por fuera y <DatosProvider> por dentro.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';
import {
  alCambiarToken,
  capturarToken,
  ingresarConCidituc,
  leerToken,
  olvidarToken,
  personaRecordada,
  recordarPersona,
  tokenVencido,
} from './sesion';
import { api } from '../datos/api';

/* Con la app abierta, cada cuánto se revisa si el token venció o si volvió la
   señal para confirmar a la persona (milisegundos). */
const REVISAR_CADA = 60_000;

const CLAVES_VIEJAS = ['grandes-generadores-usuario', 'grandes-generadores-rol-de-prueba'];

/* El público (titular) no tiene fila en la tabla usuario: viene sin id. */
function usuarioValido(u) {
  if (!u || !esRolValido(u.rol)) return null;
  return u.id || u.rol === ROLES.titular.id ? u : null;
}

/* Cómo arranca la app. El token de la dirección (si CiDiTuc acaba de abrirla)
   o el guardado. Si ya venció (se sabe sin señal, por su fecha), se olvida y
   se avisa. Si no, se arranca con la última persona confirmada con ese token:
   así la pantalla no pasa por "público" mientras se pregunta, ni se queda así
   si no hay señal. capturarToken() es idempotente (StrictMode lo llama dos
   veces en desarrollo y da lo mismo). */
function arranque() {
  const token = capturarToken();
  if (token && tokenVencido(token)) {
    olvidarToken();
    return { token: null, persona: null, vencio: true };
  }
  return { token, persona: token ? usuarioValido(personaRecordada()) : null, vencio: false };
}

function RolProvider({ children }) {
  const [inicio] = useState(arranque);
  const [agente, setAgente] = useState(inicio.persona);
  /* estado: 'cargando' | 'identificado' | 'publico'. vencio: el token venció o
     CiDiTuc lo rechazó (se muestra "Ingresar"). sinVerificar: no hubo señal
     para preguntar; se sigue con la persona recordada y se reintenta. */
  const [sesion, setSesion] = useState({
    estado: inicio.token ? 'cargando' : 'publico',
    motivo: null,
    vencio: inicio.vencio,
    sinVerificar: false,
  });
  // El último token por el que se preguntó: si aparece otro, se pregunta de nuevo.
  const tokenPreguntado = useRef(inicio.token);

  useEffect(() => {
    try {
      CLAVES_VIEJAS.forEach((c) => localStorage.removeItem(c));
    } catch {
      // Ventana privada o almacenamiento bloqueado: no hay nada que borrar.
    }
  }, []);

  const vencer = useCallback((motivo) => {
    olvidarToken();
    tokenPreguntado.current = null;
    setAgente(null);
    setSesion({ estado: 'publico', motivo, vencio: true, sinVerificar: false });
    console.warn(`[CiDiTuc] ${motivo}`);
  }, []);

  /* Le pregunta al backend quién es la persona de `token`. Todo cambio de
     estado pasa después de la respuesta (por eso se la puede llamar desde un
     efecto). */
  const preguntar = useCallback(async (token) => {
    tokenPreguntado.current = token;
    try {
      const r = await api.sesion();
      if (leerToken() !== token) return; // mientras tanto llegó otro token: vale ese
      if (r?.persona) {
        recordarPersona(r.persona);
        setAgente(usuarioValido(r.persona));
        setSesion({ estado: 'identificado', motivo: null, vencio: false, sinVerificar: false });
      } else if (r?.modo === 'apagado') {
        // El servidor no tiene CiDiTuc configurado: el token no tiene la culpa
        // y no se borra; cuando lo configuren, vuelve a valer.
        setAgente(null);
        setSesion({ estado: 'publico', motivo: r.motivo, vencio: false, sinVerificar: false });
        console.warn(`[CiDiTuc] ${r.motivo}`);
      } else {
        // CiDiTuc no aceptó el token (venció o no vale): se olvida y se avisa.
        vencer(r?.motivo ?? 'El token no es válido o venció');
      }
    } catch (e) {
      // Sin respuesta (sin señal o servidor caído): el token NO se borra. Si la
      // persona ya se había confirmado con este token, se sigue con ella.
      if (leerToken() !== token) return;
      const recordada = usuarioValido(personaRecordada());
      setAgente(recordada);
      setSesion({ estado: recordada ? 'identificado' : 'publico', motivo: e.message, vencio: false, sinVerificar: true });
      console.warn(`[CiDiTuc] No se pudo consultar la sesión: ${e.message}`);
    }
  }, [vencer]);

  /* Revisa el token guardado: sin token, público; vencido (por su fecha, sin
     preguntar), se avisa; si no, se le pregunta al backend.
     Si había un token y ya no está, otra pestaña lo borró porque venció o
     porque CiDiTuc lo rechazó (son los únicos casos en que se borra): se avisa
     igual que si lo hubiera visto esta. */
  const verificar = useCallback(() => {
    const token = leerToken();
    if (!token) {
      const teniaToken = Boolean(tokenPreguntado.current);
      tokenPreguntado.current = null;
      setAgente(null);
      setSesion((s) => ({
        estado: 'publico',
        motivo: teniaToken ? 'La sesión de CiDiTuc venció' : null,
        vencio: s.vencio || teniaToken,
        sinVerificar: false,
      }));
    } else if (tokenVencido(token)) {
      vencer('La sesión de CiDiTuc venció');
    } else {
      preguntar(token);
    }
  }, [preguntar, vencer]);

  // Al arrancar con token. Va por una promesa para que quede explícito que el
  // estado cambia después, con la respuesta, y no dentro del efecto.
  useEffect(() => {
    if (sesion.estado === 'cargando') Promise.resolve(leerToken()).then(preguntar);
  }, [sesion.estado, preguntar]);

  /* Con la app abierta: al volver a primer plano, al volver la señal, cuando
     otra ventana guarda un token y cada minuto, se revisa si apareció otro
     token (entró por el navegador), si el token venció, o si quedó sin
     confirmar por falta de señal. */
  const { sinVerificar } = sesion;
  useEffect(() => {
    function revisar() {
      if (document.visibilityState === 'hidden') return;
      const token = leerToken();
      if (token !== tokenPreguntado.current || (token && sinVerificar)) verificar();
      else if (token && tokenVencido(token)) vencer('La sesión de CiDiTuc venció');
    }
    const reloj = setInterval(revisar, REVISAR_CADA);
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('online', revisar);
    const dejarDeEscuchar = alCambiarToken(revisar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', revisar);
      window.removeEventListener('online', revisar);
      dejarDeEscuchar();
    };
  }, [sinVerificar, verificar, vencer]);

  /* >>> SI LA SESIÓN LLEGÓ SIN NOMBRE NI CUIL, SE VUELVE A PREGUNTAR (19/11/2026) <<<
     El nombre y el CUIL los pide el backend a CiDiTuc, y a veces CiDiTuc tarda
     y no contesta a tiempo. Sin el CUIL el titular no ve sus locales. En vez
     de dejarlo así hasta que recargue, se pregunta otra vez a los 6 y a los
     20 segundos; en cuanto llegan los datos, la pantalla se completa sola. */
  const faltanDatos = sesion.estado === 'identificado' && agente && !agente.cuil && !agente.nombreCompleto;
  useEffect(() => {
    if (!faltanDatos) return undefined;
    let vigente = true;
    const relojes = [6000, 20000].map((espera) =>
      setTimeout(() => {
        api
          .sesion()
          .then((r) => {
            if (vigente && r?.persona && (r.persona.cuil || r.persona.nombreCompleto)) {
              recordarPersona(r.persona);
              setAgente(usuarioValido(r.persona));
            }
          })
          .catch(() => undefined);
      }, espera),
    );
    return () => {
      vigente = false;
      relojes.forEach(clearTimeout);
    };
  }, [faltanDatos]);

  /* u = { id, nombre (el id_persona), rol, cuil, nombreCompleto }, o null
     para volver a público. Lo llama la carga de la sesión de arriba. */
  function elegirAgente(u) {
    setAgente(usuarioValido(u));
  }

  const valor = useMemo(() => {
    const rol = agente?.rol ?? ROL_POR_DEFECTO;
    return {
      rol,
      agente,
      elegirAgente,
      sesion,
      // Lleva a CiDiTuc para entrar de nuevo (el botón "Ingresar").
      ingresar: ingresarConCidituc,
      datosRol: ROLES[rol],
      usuario: agente
        ? {
            id: agente.id ?? null,
            nombre: String(agente.nombre ?? ''),
            nombreCompleto: agente.nombreCompleto ?? '',
            cuil: agente.cuil ?? '',
            email: agente.email ?? '',
            rol,
            deLaBase: Boolean(agente.id),
          }
        : { id: null, nombre: '', nombreCompleto: '', cuil: '', email: '', rol },
    };
  }, [agente, sesion]);

  return <RolContext.Provider value={valor}>{children}</RolContext.Provider>;
}

export default RolProvider;
