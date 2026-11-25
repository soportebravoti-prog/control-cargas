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
  estado: 'CARGANDO' | 'EN_RUTA' | 'CANCELADA';
  horaInicio: string;
  horaSalida: string | null;
  horaCancelacion?: string | null;
  motivoCancelacion?: string;
  fechaOperacion: string;
}