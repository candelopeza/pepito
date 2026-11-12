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

   No se guarda nada en localStorage (hasta el 06/11/2026 se guardaba el
   elegido en la barra; esas claves se borran al arrancar). El token vive en
   sessionStorage: se va al cerrar la pestaña.

   POR QUÉ EL USUARIO VIVE ACÁ Y NO EN EL STORE DE DATOS: porque el store lo
   necesita (firma la auditoría con el nombre del usuario), y si el usuario
   viviera adentro del store habría una dependencia circular. Por eso en
   App.jsx el orden es <RolProvider> por fuera y <DatosProvider> por dentro.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';
import { capturarToken, olvidarToken } from './sesion';
import { api } from '../datos/api';

const CLAVES_VIEJAS = ['grandes-generadores-usuario', 'grandes-generadores-rol-de-prueba'];

/* El público (titular) no tiene fila en la tabla usuario: viene sin id. */
function usuarioValido(u) {
  if (!u || !esRolValido(u.rol)) return null;
  return u.id || u.rol === ROLES.titular.id ? u : null;
}

function RolProvider({ children }) {
  const [agente, setAgente] = useState(null);
  // Si la pestaña tiene token hay que preguntarle al backend quién es; si no,
  // ya se sabe: público. capturarToken() es idempotente (StrictMode lo llama
  // dos veces en desarrollo y da lo mismo).
  const [sesion, setSesion] = useState(() =>
    capturarToken() ? { estado: 'cargando', motivo: null } : { estado: 'publico', motivo: null },
  );

  useEffect(() => {
    try {
      CLAVES_VIEJAS.forEach((c) => localStorage.removeItem(c));
    } catch {
      // Ventana privada o almacenamiento bloqueado: no hay nada que borrar.
    }
  }, []);

  useEffect(() => {
    if (sesion.estado !== 'cargando') return undefined;

    let vigente = true;
    api
      .sesion()
      .then((r) => {
        if (!vigente) return;
        if (r?.persona) {
          setAgente(usuarioValido(r.persona));
          setSesion({ estado: 'identificado', motivo: null });
        } else {
          // El token no sirvió: no se insiste con él en cada pedido.
          olvidarToken();
          setSesion({ estado: 'publico', motivo: r?.motivo ?? 'Sin respuesta' });
          console.warn(`[CiDiTuc] No se pudo identificar a la persona: ${r?.motivo ?? 'sin motivo'}`);
        }
      })
      .catch((e) => {
        if (!vigente) return;
        setSesion({ estado: 'publico', motivo: e.message });
        console.warn(`[CiDiTuc] No se pudo consultar la sesión: ${e.message}`);
      });
    return () => {
      vigente = false;
    };
  }, [sesion.estado]);

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
