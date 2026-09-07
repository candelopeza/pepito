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

   CRITERIOS, de más fuerte a más débil:
     1. mismo CUIT normalizado ..................... coincidencia alta
     2. nombre parecido + misma calle y altura ..... coincidencia media
     3. nombre parecido a secas .................... coincidencia baja
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

/* Devuelve los pares candidatos, del más probable al menos. */
export function buscarDuplicados(locales, { umbralNombre = 0.6 } = {}) {
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
