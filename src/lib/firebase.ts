import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

export interface Chofer {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Unidad {
  id: string;
  nombre: string;
  placas?: string;
  choferDefaultId?: string;
  activo: boolean;
}

export interface Carga {
  id: string;
  unidadNombre: string;
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

export interface Unidad {
  id: string;
  nombre: string;
  activo: boolean;
  choferDefaultId?: string;
  tipoUnidad?: string;
  placas?: string;
  serieVin?: string;
  marcaModelo?: string;
  anio?: string;
  estatusOperativo?: 'ACTIVA' | 'MANTENIMIENTO';
  aseguradora?: string;
  polizaSeguro?: string;
  vencimientoSeguro?: string;
  tarjetaCirculacion?: string;
  vencimientoTarjeta?: string;
  notas?: string;
  // Fotos de la unidad (Data URL comprimida)
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
  numeroLicencia?: string;
  tipoLicencia?: string;
  vencimientoLicencia?: string;
  unidadAsignadaId?: string;
  notas?: string;
  // Foto de perfil (rostro) y documentos
  fotoPerfil?: string;
  fotoLicenciaFrente?: string;
  fotoLicenciaReverso?: string;
  fotoIneFrente?: string;
  fotoIneReverso?: string;
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