'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  coleccionUsuarios,
  PerfilUsuario,
  ModuloApp,
} from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  perfil: PerfilUsuario | null;
  cargando: boolean;
  tieneAcceso: (modulo: ModuloApp) => boolean;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  perfil: null,
  cargando: true,
  tieneAcceso: () => false,
  cerrarSesion: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    let unsubAuth: (() => void) | null = null;
    let unsubPerfil: (() => void) | null = null;

    const iniciar = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // Ignorar si ya está configurada
      }

      if (!activo) return;

      unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
        if (unsubPerfil) {
          unsubPerfil();
          unsubPerfil = null;
        }

        setUser(firebaseUser);

        if (!firebaseUser) {
          setPerfil(null);
          setCargando(false);
          return;
        }

        setCargando(true);
        const refPorUid = doc(db, coleccionUsuarios(), firebaseUser.uid);

        unsubPerfil = onSnapshot(
          refPorUid,
          (snapUid) => {
            if (snapUid.exists()) {
              const data = snapUid.data() as PerfilUsuario;
              setPerfil({ ...data, uid: snapUid.id });
              setCargando(false);
              return;
            }

            if (firebaseUser.email) {
              const qCorreo = query(
                collection(db, coleccionUsuarios()),
                where('correo', '==', firebaseUser.email.toLowerCase())
              );

              if (unsubPerfil) unsubPerfil();
              unsubPerfil = onSnapshot(
                qCorreo,
                (snapCorreo) => {
                  if (!snapCorreo.empty) {
                    const docEncontrado = snapCorreo.docs[0];
                    const data = docEncontrado.data() as PerfilUsuario;
                    setPerfil({ ...data, uid: docEncontrado.id });
                  } else {
                    setPerfil(null);
                  }
                  setCargando(false);
                },
                () => {
                  setCargando(false);
                }
              );
              return;
            }

            setPerfil(null);
            setCargando(false);
          },
          () => {
            setCargando(false);
          }
        );
      });
    };

    iniciar();

    return () => {
      activo = false;
      if (unsubPerfil) unsubPerfil();
      if (unsubAuth) unsubAuth();
    };
  }, []);

  const tieneAcceso = (modulo: ModuloApp): boolean => {
    if (!perfil || !perfil.activo) return false;
    if (perfil.rolBase === 'sistemas') return true;
    return Array.isArray(perfil.modulos) && perfil.modulos.includes(modulo);
  };

  const cerrarSesion = async () => {
    await signOut(auth);
    setUser(null);
    setPerfil(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, perfil, cargando, tieneAcceso, cerrarSesion }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}