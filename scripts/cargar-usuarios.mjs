import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const authAdmin = getAuth();
const dbAdmin = getFirestore();

/**
 * true  -> escribe en `dev_usuarios` y busca en `dev_choferes` (localhost / pruebas)
 * false -> escribe en `usuarios` y busca en `choferes` (producción)
 */
const USAR_DEV = false;
const colUsuarios = USAR_DEV ? 'dev_usuarios' : 'usuarios';
const colChoferes = USAR_DEV ? 'dev_choferes' : 'choferes';

const USUARIOS_A_CARGAR = [
  {
    nombre: 'Soporte Bravo TI',
    correo: 'soportebravo.ti@gmail.com',
    password: null, // No modifica tu contraseña actual en Firebase Auth
    rolBase: 'sistemas',
    modulos: ['patio', 'monitor', 'flota', 'chofer', 'catalogos'],
    pin: '',
    nombreChoferVincular: null,
  },
  {
    nombre: 'Luis Osorio (Patio)',
    correo: 'luisosoriohdez244@gmail.com',
    password: 'Bravo2026*',
    rolBase: 'patio',
    modulos: ['patio'],
    pin: '',
    nombreChoferVincular: null,
  },
  {
    nombre: 'Fabiola',
    correo: 'fabiola@cafisu.com.mx',
    password: 'Bravo2026*',
    rolBase: 'monitor',
    modulos: ['monitor', 'chofer'],
    pin: '',
    nombreChoferVincular: null,
  },
  {
    nombre: 'Encargado de Autos',
    correo: 'adminvehiculosbravo@gmail.com',
    password: 'Bravo2026*',
    rolBase: 'flota',
    modulos: ['flota', 'chofer'],
    pin: '',
    nombreChoferVincular: null,
  },
  {
    nombre: 'Manuel',
    correo: 'auditoria.interna@cafisu.com.mx',
    password: 'Bravo2026*',
    rolBase: 'chofer',
    modulos: ['chofer'],
    pin: '',
    nombreChoferVincular: 'Manuel',
  },
];

function normalizarTexto(texto = '') {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function buscarChoferIdPorNombre(nombreBuscado) {
  if (!nombreBuscado) return null;
  const snap = await dbAdmin.collection(colChoferes).get();
  const objetivo = normalizarTexto(nombreBuscado);

  const exacto = snap.docs.find(
    (d) => normalizarTexto(d.data()?.nombre || '') === objetivo
  );
  if (exacto) return exacto.id;

  const parcial = snap.docs.find((d) =>
    normalizarTexto(d.data()?.nombre || '').includes(objetivo)
  );
  return parcial ? parcial.id : null;
}

async function asegurarUsuarioAuth({ correo, password, nombre }) {
  const correoLimpio = correo.trim().toLowerCase();
  try {
    const existente = await authAdmin.getUserByEmail(correoLimpio);
    await authAdmin.updateUser(existente.uid, {
      displayName: nombre,
      ...(password ? { password } : {}),
    });
    return existente.uid;
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      if (!password) {
        throw new Error(
          `El usuario ${correoLimpio} no existe en Auth y no tiene contraseña definida.`
        );
      }
      const creado = await authAdmin.createUser({
        email: correoLimpio,
        password,
        displayName: nombre,
      });
      return creado.uid;
    }
    throw err;
  }
}

async function ejecutar() {
  for (const item of USUARIOS_A_CARGAR) {
    if (!item.correo || !item.correo.includes('@')) {
      console.warn(`Saltando "${item.nombre}": correo inválido.`);
      continue;
    }

    if (item.password !== null && item.password.length < 6) {
      console.warn(
        `Saltando "${item.correo}": la contraseña debe tener al menos 6 caracteres.`
      );
      continue;
    }

    const uid = await asegurarUsuarioAuth(item);
    const choferId = await buscarChoferIdPorNombre(item.nombreChoferVincular);
    const ahora = new Date().toISOString();

    const modulosFinales =
      item.rolBase === 'sistemas'
        ? ['patio', 'monitor', 'flota', 'chofer', 'catalogos']
        : item.modulos;

    await dbAdmin
      .collection(colUsuarios)
      .doc(uid)
      .set(
        {
          uid,
          nombre: item.nombre,
          correo: item.correo.trim().toLowerCase(),
          rolBase: item.rolBase,
          modulos: modulosFinales,
          pin: item.pin || '',
          activo: true,
          choferId,
          actualizadoEn: ahora,
          creadoEn: ahora,
        },
        { merge: true }
      );

    console.log(
      `Listo (${colUsuarios}) -> ${item.correo.trim().toLowerCase()} | uid: ${uid} | rol: ${item.rolBase} | módulos: [${modulosFinales.join(', ')}] | choferId: ${choferId || 'ninguno'}`
    );
  }
}

ejecutar()
  .then(() => {
    console.log('Proceso terminado.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error al cargar usuarios:', err);
    process.exit(1);
  });