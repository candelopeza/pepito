/* ============================================================================
   dominio/duplicados.js  —  DETECCIÓN DE LOCALES CARGADOS DOS VECES
   ----------------------------------------------------------------------------
   Sección 9.4 del pliego. El padrón acumula establecimientos cargados más de
   una vez con identificadores distintos, y sus actuaciones quedan repartidas
   entre los dos registros: el local aparece con menos historial del que tiene.

   >>> UN DUPLICADO ES EL MISMO LOCAL DOS VECES, NO DOS LOCALES DEL MISMO DUEÑO <<<
   Esta es LA distinción de todo el archivo, y es la que hacía que la pantalla
   mostrara medio padrón como duplicado.

   Una empresa puede tener muchas sucursales, cada una con su propio CUIT (el
   del titular), su propia dirección y su propio recorrido por el circuito.
   PALPITOS SRL tiene NUEVE locales en el padrón real. Son nueve establecimientos
   distintos: cada uno genera sus residuos, recibe su cédula y acredita por
   separado. Fusionarlos sería destruir ocho expedientes.

   Por eso NINGÚN criterio de acá marca un par por el CUIT solo ni por el
   nombre solo. Siempre hace falta que coincida también LA DIRECCIÓN, porque la
   dirección es lo que identifica al establecimiento.

   >>> SIEMPRE CON CONFIRMACIÓN HUMANA <<<
   Esta función solo PROPONE. La fusión la decide una persona y queda
   registrada (qué ids se unificaron), porque después hay que poder rastrear
   una actuación histórica hasta el registro donde se cargó.

   CRITERIOS, de más fuerte a más débil:
     alta   mismo CUIT y la misma dirección
     media  mismo CUIT y direcciones casi iguales (una escrita más completa que
            la otra, o la altura corrida en pocos números)
     baja   sin CUIT en común, pero mismo nombre y la misma dirección
   ============================================================================ */

/* Deja solo dígitos: '30-12345678-9' y '30123456789' son el mismo CUIT.
   El sistema viejo lo guarda como texto sin normalizar, así que dos cargas del
   mismo local con distinto formato no se cruzaban. */
export function normalizarCuit(cuit) {
  return String(cuit || '').replace(/\D/g, '');
}

/* Minúsculas, sin tildes, sin puntuación y sin las palabras que no distinguen
   nada ('sa', 'srl', 'la'...). */
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

/* Palabras que aparecen en casi todas las direcciones del padrón y no
   distinguen nada: la ciudad y la provincia que arrastran las direcciones
   geocodificadas. Sin sacarlas, "SANTIAGO 419" y "SANTIAGO DEL ESTERO 419,
   SAN MIGUEL DE TUCUMÁN, TUCUMÁN" parecen calles distintas. */
const RUIDO_DIRECCION = ['san', 'miguel', 'tucuman', 'av', 'avenida', 'calle', 'bo', 'barrio'];

/* Separa 'Av. Alem 123' en { calle: 'alem', altura: 123 }.
   La altura sale como número para poder comparar cercanía. */
export function partirDireccion(direccion) {
  const texto = normalizarNombre(direccion)
    .split(' ')
    .filter((p) => !RUIDO_DIRECCION.includes(p))
    .join(' ');
  // La altura es el primer número suelto: en "brigido teran 250 loc 47" es 250.
  const m = texto.match(/\b(\d{1,5})\b/);
  const altura = m ? Number(m[1]) : null;
  const calle = texto.replace(/\b\d+\b.*$/, '').trim();
  return { calle, altura };
}

/* Similitud de textos por palabras compartidas (índice de Jaccard).
   Devuelve 0 a 1. Alcanza para nombres comerciales cortos y no necesita
   librería. */
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

/* ¿Las dos direcciones apuntan al mismo lugar?
   Devuelve 'igual', 'parecida' o null.

   'parecida' cubre los dos casos reales del padrón:
     - la misma altura y una calle contenida en la otra
       ("santiago 419" vs "santiago estero 419")
     - la misma calle con la altura corrida en pocos números
       ("sarmiento 1299" vs "sarmiento 1301"), que suele ser el mismo local con
       dos entradas, pero puede ser el de al lado: por eso no es 'igual'. */
const TOLERANCIA_ALTURA = 4;

export function compararDirecciones(a, b) {
  const A = partirDireccion(a);
  const B = partirDireccion(b);
  if (!A.calle || !B.calle) return null;

  const mismaCalle = A.calle === B.calle;
  const calleContenida = A.calle.includes(B.calle) || B.calle.includes(A.calle);

  if (mismaCalle && A.altura === B.altura) return 'igual';
  if (calleContenida && A.altura === B.altura && A.altura !== null) return 'parecida';
  if (
    mismaCalle &&
    A.altura !== null &&
    B.altura !== null &&
    Math.abs(A.altura - B.altura) <= TOLERANCIA_ALTURA
  ) {
    return 'parecida';
  }
  return null;
}

/* ============================================================================
   LA BÚSQUEDA
   ----------------------------------------------------------------------------
   Agrupa primero y compara después. Comparar todos los locales contra todos son
   2.200 × 2.200 ≈ 2,4 millones de pares, que en el navegador se nota; agrupando
   por CUIT y por dirección, cada grupo tiene dos o tres elementos.
   ============================================================================ */
export function buscarDuplicados(locales, { umbralNombre = 0.8 } = {}) {
  const pares = [];
  const yaVisto = new Set();

  const agregar = (a, b, nivel, motivo) => {
    const clave = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (yaVisto.has(clave)) return;
    yaVisto.add(clave);
    pares.push({
      id: clave,
      principal: a,
      duplicado: b,
      nivel,
      motivo,
      parecido: Math.round(similitud(a.nombreLocal, b.nombreLocal) * 100),
    });
  };

  /* --- 1 y 2. Por CUIT: entre los locales del mismo titular, los que además
     comparten dirección son el mismo establecimiento cargado dos veces. Los que
     tienen direcciones distintas son SUCURSALES y no se tocan. */
  const porCuit = new Map();
  for (const l of locales) {
    const cuit = normalizarCuit(l.cuit);
    if (!cuit) continue;
    if (!porCuit.has(cuit)) porCuit.set(cuit, []);
    porCuit.get(cuit).push(l);
  }

  for (const grupo of porCuit.values()) {
    if (grupo.length < 2) continue;
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        const comparacion = compararDirecciones(grupo[i].direccion, grupo[j].direccion);
        if (comparacion === 'igual') {
          agregar(grupo[i], grupo[j], 'alta', 'Mismo CUIT y la misma dirección.');
        } else if (comparacion === 'parecida') {
          agregar(grupo[i], grupo[j], 'media', 'Mismo CUIT y direcciones casi iguales.');
        }
        // Direcciones distintas: son dos sucursales del mismo titular. No es
        // un duplicado y no se propone.
      }
    }
  }

  /* --- 3. Por dirección: locales en el mismo domicilio con el mismo nombre,
     cuando el CUIT falta o difiere. Es el caso de la carga manual repetida
     antes de completar los datos registrales. */
  const porDireccion = new Map();
  for (const l of locales) {
    const { calle, altura } = partirDireccion(l.direccion);
    if (!calle || altura === null) continue;
    const clave = `${calle} ${altura}`;
    if (!porDireccion.has(clave)) porDireccion.set(clave, []);
    porDireccion.get(clave).push(l);
  }

  for (const grupo of porDireccion.values()) {
    if (grupo.length < 2) continue;
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        const a = grupo[i];
        const b = grupo[j];
        const cuitA = normalizarCuit(a.cuit);
        const cuitB = normalizarCuit(b.cuit);
        // Si los dos tienen CUIT y son distintos, son dos comercios en el mismo
        // domicilio (una galería, dos locales a la calle). No es duplicado.
        if (cuitA && cuitB && cuitA !== cuitB) continue;
        if (similitud(a.nombreLocal, b.nombreLocal) >= umbralNombre) {
          agregar(a, b, 'baja', 'Mismo nombre y la misma dirección, sin CUIT que los distinga.');
        }
      }
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  return pares.sort((x, y) => orden[x.nivel] - orden[y.nivel] || y.parecido - x.parecido);
}
