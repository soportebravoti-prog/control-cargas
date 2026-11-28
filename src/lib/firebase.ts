import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

/**
 * En localhost usa prefijo `dev_` para separar pruebas de la operación real en Vercel.
 * En producción (Vercel u otro dominio) devuelve el nombre exacto de la colección.
 */
export function coleccion(base: string): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `dev_${base}`;
    }
  }
  return base;
}

/**
 * Perfiles de usuario y permisos por módulo (usa `dev_usuarios` en local y `usuarios` en producción).
 */
export function coleccionUsuarios(): string {
  return coleccion('usuarios');
}

export type ModuloApp = 'patio' | 'monitor' | 'flota' | 'chofer' | 'catalogos';

export type RolBaseUsuario =
  | 'sistemas'
  | 'admin'
  | 'patio'
  | 'monitor'
  | 'flota'
  | 'chofer';

export interface PerfilUsuario {
  uid: string;
  nombre: string;
  correo: string;
  rolBase: RolBaseUsuario;
  modulos: ModuloApp[];
  pin?: string;
  activo: boolean;
  choferId?: string | null;
  unidadId?: string | null;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface FotosUnidad {
  frente?: string;
  trasera?: string;
  costadoIzq?: string;
  costadoDer?: string;
  tarjetaCirculacion?: string;
  polizaSeguro?: string;
}

export interface Unidad {
  id: string;
  nombre: string;
  activo: boolean;
  choferDefaultId?: string | null;
  tipo?: string;
  tipoUnidad?: string;
  placas?: string;
  serie?: string;
  serieVin?: string;
  marcaModelo?: string;
  anio?: string | number | null;
  estatusOperativo?: 'ACTIVA' | 'MANTENIMIENTO';
  aseguradora?: string;
  poliza?: string;
  polizaSeguro?: string;
  seguroVence?: string | null;
  vencimientoSeguro?: string | null;
  tarjetaFolio?: string;
  tarjetaCirculacion?: string;
  tarjetaVence?: string | null;
  vencimientoTarjeta?: string | null;
  notas?: string;
  fotos?: FotosUnidad;
  fotoFrente?: string;
  fotoTrasero?: string;
  fotoCostadoIzq?: string;
  fotoCostadoDer?: string;
}

export interface Chofer {
  id: string;
  nombre: string;
  activo: boolean;
  telefono?: string;
  licenciaNumero?: string;
  numeroLicencia?: string;
  licenciaTipo?: string;
  tipoLicencia?: string;
  licenciaVence?: string | null;
  vencimientoLicencia?: string | null;
  ineFolio?: string;
  unidadAsignadaId?: string | null;
  notas?: string;
  fotoPerfil?: string;
  fotoLicencia?: string;
  fotoLicenciaFrente?: string;
  fotoLicenciaReverso?: string;
  fotoIne?: string;
  fotoIneFrente?: string;
  fotoIneReverso?: string;
}

export interface Carga {
  id: string;
  unidadId?: string;
  unidadNombre: string;
  unidadModelo?: string;
  choferId?: string | null;
  choferNombre: string;
  destino: string;
  remisiones: string[];
  vuelta: number;
  estado: 'CARGANDO' | 'EN_RUTA' | 'FINALIZADA' | 'CANCELADA';
  horaInicio: string;
  horaSalida: string | null;
  horaRegreso?: string | null;
  horaCancelacion?: string | null;
  motivoCancelacion?: string;
  fechaOperacion: string;
}

export interface Aviso {
  id: string;
  texto: string;
  activo: boolean;
  creadoEn: string;
  fechaOperacion: string;
}

export type NivelRevision = 'OK' | 'BAJO' | 'ATENCION';

export interface RegistroCombustible {
  id: string;
  unidadId: string;
  unidadNombre: string;
  choferId: string;
  choferNombre: string;
  litros: number;
  monto?: number;
  odometro?: number;
  fechaIso: string;
  horaTexto: string;
  notas?: string;
  ticketImagen?: string;
}

export interface ReporteRevisionUnidad {
  id: string;
  unidadId: string;
  unidadNombre: string;
  choferId: string;
  choferNombre: string;
  cargaId?: string;
  momento: 'SALIDA' | 'REGRESO' | 'REVISION';
  nivelCombustible: 'VACIO' | '1/4' | '1/2' | '3/4' | 'LLENO';
  aceite: NivelRevision;
  anticongelante: NivelRevision;
  llantas: NivelRevision;
  limpieza: NivelRevision;
  kilometraje?: number;
  observaciones?: string;
  fechaIso: string;
  horaTexto: string;
}