'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth, ModuloApp } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Lock, Mail, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';

const RUTA_POR_MODULO: Record<ModuloApp, string> = {
  patio: '/patio',
  monitor: '/monitor',
  flota: '/flota',
  chofer: '/chofer',
  catalogos: '/catalogos',
};

export default function LoginPage() {
  const router = useRouter();
  const { user, perfil, cargando, cerrarSesion } = useAuth();

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEnviando(false);
      return;
    }

    if (cargando || !perfil) return;

    if (!perfil.activo) {
      setEnviando(false);
      setError('Tu cuenta está desactivada. Contacta a Sistemas.');
      return;
    }

    const modulos = perfil.modulos || [];
    if (perfil.rolBase !== 'sistemas' && modulos.length === 1) {
      router.replace(RUTA_POR_MODULO[modulos[0]] || '/');
    } else {
      router.replace('/');
    }
  }, [user, perfil, cargando, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, correo.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        setError('Correo o contraseña incorrectos.');
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Espera un momento e intenta de nuevo.');
      } else {
        setError('No se pudo iniciar sesión. Verifica tu conexión.');
      }
      setEnviando(false);
    }
  };

  const handleCerrarSesion = async () => {
    setEnviando(false);
    setError(null);
    await cerrarSesion();
  };

  if (!cargando && user && !perfil) {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
        >
          <source src="/video-patio.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/65 to-slate-950/90 pointer-events-none" />

        <div className="relative z-10 max-w-md w-full bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-4 text-center shadow-2xl">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h1 className="text-lg font-bold">Cuenta sin permisos asignados</h1>
          <p className="text-xs text-slate-300">
            Iniciaste sesión como <strong className="text-white">{user.email}</strong>, pero tu
            usuario aún no tiene módulos configurados en <strong>Catálogos</strong>.
          </p>
          <p className="text-[11px] bg-slate-950/90 border border-slate-800 rounded-lg p-2 font-mono text-slate-300 select-all">
            UID: {user.uid}
          </p>
          <button
            type="button"
            onClick={handleCerrarSesion}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
      >
        <source src="/video-patio.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/90 pointer-events-none" />

      <div className="relative z-10 max-w-md w-full bg-slate-900/80 backdrop-blur-md border border-slate-700/70 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-16 h-16 rounded-2xl object-contain bg-slate-800/90 p-2 border border-slate-700"
          />
          <h1 className="text-xl font-bold tracking-tight">Control Vehicular Bravo</h1>
          <p className="text-xs text-slate-300">
            Ingresa con tu correo y contraseña asignados
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="usuario@empresa.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full bg-slate-950/85 border border-slate-700 focus:border-amber-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={mostrarPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/85 border border-slate-700 focus:border-amber-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white outline-none transition"
              />
              <button
                type="button"
                onClick={() => setMostrarPass(!mostrarPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {mostrarPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium px-3.5 py-2.5 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm shadow-lg transition flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {enviando ? 'Verificando acceso...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}