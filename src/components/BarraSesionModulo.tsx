'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTemaApp } from '@/components/BotonTema';
import { Home, LogOut, ShieldCheck } from 'lucide-react';

interface BarraSesionModuloProps {
  mostrarInicio?: boolean;
}

export default function BarraSesionModulo({
  mostrarInicio = false,
}: BarraSesionModuloProps) {
  const router = useRouter();
  const tema = useTemaApp();
  const esOscuro = tema === 'dark';
  const { perfil, cerrarSesion } = useAuth();

  const handleCerrarSesion = async () => {
    await cerrarSesion();
    router.replace('/login');
  };

  if (!perfil) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {mostrarInicio && (
        <Link
          href="/"
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
            esOscuro
              ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span>Inicio</span>
        </Link>
      )}

      <div
        className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
          esOscuro
            ? 'bg-slate-900/90 border-slate-800 text-slate-300'
            : 'bg-white/90 border-slate-200 text-slate-700'
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="font-semibold">{perfil.nombre || perfil.correo}</span>
        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-bold">
          {perfil.rolBase}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCerrarSesion}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
          esOscuro
            ? 'bg-red-950/75 hover:bg-red-900/85 border-red-800/70 text-red-200'
            : 'bg-white hover:bg-red-50 border-red-200 text-red-700'
        }`}
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Cerrar sesión</span>
      </button>
    </div>
  );
}