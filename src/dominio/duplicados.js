/* ============================================================================
   dominio/duplicados.js  —  DETECCIÓN DE LOCALES CARGADOS DOS VECES
   ----------------------------------------------------------------------------
   Sección 9.4 del pliego. El padrón acumula establecimientos cargados más de
   una vez con identificadores distintos, y sus actuaciones quedan repartidas
   entre los dos registros: el local aparece con menos historial del que tiene.

   >>> SIEMPRE CON CONFIRMACIÓN HUMANA <<<
   Esta función solo PROPONE. La fusión la decide una persona y queda
   registrada (qué ids se unificaron), porque después hay que poder rastrear
   una actuación histórica hasta el registro donde se cargó.

   >>> CUÁNDO ES DUPLICADO (criterio 'direccion', el que se usa) <<<
   Solo si coinciden las TRES cosas: nombre comercial, nombre de calle y
   altura (es lo que hace el sistema viejo, sección 9.4). El CUIT solo no
   alcanza: un mismo titular tiene varios locales, y muchos locales se llaman
   igual en distintas direcciones. Con el CUIT o el nombre solos, la pantalla
   se llenaba de pares que no eran duplicados.
     - nombre, calle, altura y además el mismo CUIT ... coincidencia alta
     - nombre, calle y altura .......................... coincidencia media

   El criterio anterior (mismo CUIT, o nombre parecido aunque cambie la
   dirección) sigue disponible con { criterio: 'amplio' }: no se borró.

   QUIÉN SE CONSERVA: el de mayor jerarquía legal (ver jerarquiaLegal),
   porque es el que referencian los actos ya notificados o iniciados.
   ============================================================================ */

/* Deja solo dígitos: '30-12345678-9' y '30123456789' son el mismo CUIT.
   El sistema viejo lo guarda como texto sin normalizar, así que dos cargas del
   mismo local con distinto formato no se cruzaban. */
export function normalizarCuit(cuit) {
  return String(cuit || '').replace(/\D/g, '');
}

/* Minúsculas, sin tildes, sin puntuación y sin las palabras que no distinguen
   nada ('supermercado', 'sa', 'srl'...). */
const RUIDO = ['sa', 'srl', 'sh', 'sas', 'el', 'la', 'los', 'las', 'de', 'del'];

export function normalizarNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !RUIDO.includes(p))
    .join(' ')
    .trim();
}

/* Separa 'Av. Alem 123' en { calle: 'av alem', altura: '123' } */
export function partirDireccion(direccion) {
  const texto = normalizarNombre(direccion);
  const m = texto.match(/^(.*?)\s*(\d+)\s*$/);
  return m ? { calle: m[1].trim(), altura: m[2] } : { calle: texto, altura: '' };
}

/* Similitud de textos por palabras compartidas (índice de Jaccard).
   Devuelve 0 a 1. Alcanza para nombres comerciales cortos y no necesita
   librería: una distancia de edición sería más fina pero mucho más lenta
   sobre 2.000 registros cruzados de a pares. */
export function similitud(a, b) {
  const A = new Set(normalizarNombre(a).split(' ').filter(Boolean));
  const B = new Set(normalizarNombre(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  A.forEach((p) => {
    if (B.has(p)) comunes += 1;
  });
  return comunes / (A.size + B.size - comunes);
}

/* Qué tan avanzado está el local en el circuito legal: cuanto más alto, más
   actos con efecto sobre el titular tiene (un expediente iniciado pesa más que
   una cédula, una cédula más que un relevamiento). Al unificar dos registros,
   el historial va al de mayor jerarquía. */
const JERARQUIA_POR_ESTADO = {
  EXPEDIENTE: 6,
  GENERAR_EXPEDIENTE: 5,
  PRORROGA_VIGENTE: 5,
  CONTRATO_VIGENTE: 4,
  CONTRATO_9DJ: 4,
  DDJJ_VIGENTE: 4,
  DDJJ_RECICLAJE: 4,
  COMPLETAR_DATOS: 3,
};

export function jerarquiaLegal(local) {
  const estado = String(local?.estado ?? '');
  if (JERARQUIA_POR_ESTADO[estado]) return JERARQUIA_POR_ESTADO[estado];
  if (estado.startsWith('NOTIF2')) return 3;
  if (estado.startsWith('NOTIF1')) return 2;
  if (estado === 'EXENTO_CONFIRMADO' || estado === 'EXENTO_REVISION') return 0;
  return 1;
}

/* [principal, duplicado]: primero la jerarquía legal; si empatan, el que tiene
   más actuaciones, después el que tiene CUIT, y por último el más antiguo. */
export function ordenarPorJerarquia(a, b) {
  const criterios = [
    (x) => jerarquiaLegal(x),
    (x) => x.cantidadActuaciones ?? 0,
    (x) => (normalizarCuit(x.cuit) ? 1 : 0),
    (x) => -(Number(x.id) || 0),
  ];
  for (const c of criterios) {
    if (c(a) !== c(b)) return c(a) > c(b) ? [a, b] : [b, a];
  }
  return [a, b];
}

/* Devuelve los pares candidatos, del más probable al menos.
   criterio 'direccion' (por defecto): nombre + calle + altura.
   criterio 'amplio': el de antes (también CUIT solo o nombre solo). */
export function buscarDuplicados(locales, { umbralNombre = 0.6, criterio = 'direccion' } = {}) {
  if (criterio === 'direccion') return porNombreYDireccion(locales, umbralNombre);
  return amplio(locales, umbralNombre);
}

/* Agrupa por calle y altura antes de comparar nombres: con 2.200 locales,
   comparar todos contra todos son 2,4 millones de pares; así solo se comparan
   los que ya comparten la dirección. */
function porNombreYDireccion(locales, umbralNombre) {
  const porDireccion = new Map();
  for (const local of locales) {
    const { calle, altura } = partirDireccion(local.direccion);
    if (!calle || !altura) continue; // sin altura no se puede afirmar que sea el mismo lugar
    const clave = `${calle}|${altura}`;
    if (!porDireccion.has(clave)) porDireccion.set(clave, []);
    porDireccion.get(clave).push(local);
  }

  const pares = [];
  for (const grupo of porDireccion.values()) {
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        const a = grupo[i];
        const b = grupo[j];
        const parecidoNombre = similitud(a.nombreLocal, b.nombreLocal);
        if (parecidoNombre < umbralNombre) continue;
        const cuitA = normalizarCuit(a.cuit);
        const mismoCuit = Boolean(cuitA) && cuitA === normalizarCuit(b.cuit);
        pares.push({
          id: `${a.id}-${b.id}`,
          principal: a,
          duplicado: b,
          nivel: mismoCuit ? 'alta' : 'media',
          motivo: mismoCuit ? 'Mismo nombre, calle, altura y CUIT.' : 'Mismo nombre, calle y altura.',
          parecido: Math.round(parecidoNombre * 100),
        });
      }
    }
  }
  const orden = { alta: 0, media: 1 };
  return pares.sort((x, y) => orden[x.nivel] - orden[y.nivel] || y.parecido - x.parecido);
}

/* El criterio anterior, sin cambios. */
function amplio(locales, umbralNombre) {
  const pares = [];

  for (let i = 0; i < locales.length; i += 1) {
    for (let j = i + 1; j < locales.length; j += 1) {
      const a = locales[i];
      const b = locales[j];

      const cuitA = normalizarCuit(a.cuit);
      const cuitB = normalizarCuit(b.cuit);
      const dirA = partirDireccion(a.direccion);
      const dirB = partirDireccion(b.direccion);
      const parecidoNombre = similitud(a.nombreLocal, b.nombreLocal);
      const mismaDireccion = dirA.calle && dirA.calle === dirB.calle && dirA.altura === dirB.altura;

      let nivel = null;
      let motivo = '';

      if (cuitA && cuitA === cuitB) {
        nivel = 'alta';
        motivo = 'Mismo CUIT.';
      } else if (parecidoNombre >= umbralNombre && mismaDireccion) {
        nivel = 'media';
        motivo = 'Nombre parecido y misma dirección.';
      } else if (parecidoNombre >= 0.8) {
        nivel = 'baja';
        motivo = 'Nombre muy parecido, dirección distinta.';
      }

      if (nivel) {
        pares.push({
          id: `${a.id}-${b.id}`,
          principal: a,
          duplicado: b,
          nivel,
          motivo,
          parecido: Math.round(parecidoNombre * 100),
        });
      }
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  return pares.sort((x, y) => orden[x.nivel] - orden[y.nivel] || y.parecido - x.parecido);
}
