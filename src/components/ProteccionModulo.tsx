'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ModuloApp } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert, Home, LogOut } from 'lucide-react';

interface ProteccionModuloProps {
  moduloRequerido?: ModuloApp;
  children: ReactNode;
}

export default function ProteccionModulo({
  moduloRequerido,
  children,
}: ProteccionModuloProps) {
  const router = useRouter();
  const { user, perfil, cargando, tieneAcceso, cerrarSesion } = useAuth();

  useEffect(() => {
    if (!cargando && !user) {
      router.replace('/login');
    }
  }, [cargando, user, router]);

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-4">
        <div className="text-sm font-semibold animate-pulse">
          Verificando credenciales y permisos...
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!perfil || !perfil.activo) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold">Perfil no activo o sin configurar</h2>
          <p className="text-xs text-slate-400">
            Tu cuenta ({user.email}) no tiene un perfil activo asignado. Solicita acceso a
            Sistemas.
          </p>
          <button
            type="button"
            onClick={async () => {
              await cerrarSesion();
              router.replace('/login');
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Cambiar de cuenta
          </button>
        </div>
      </div>
    );
  }

  if (moduloRequerido && !tieneAcceso(moduloRequerido)) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-900/60 rounded-2xl p-6 text-center space-y-4">
          <ShieldAlert className="w-11 h-11 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold">Acceso Restringido</h2>
          <p className="text-xs text-slate-400">
            Tu usuario (<strong className="text-slate-200">{perfil.nombre || perfil.correo}</strong>)
            no tiene permiso para entrar al módulo <strong className="uppercase text-amber-400">{moduloRequerido}</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link
              href="/"
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs inline-flex items-center justify-center gap-1.5"
            >
              <Home className="w-4 h-4" /> Ir a mis módulos
            </Link>
            <button
              type="button"
              onClick={async () => {
                await cerrarSesion();
                router.replace('/login');
              }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs inline-flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}