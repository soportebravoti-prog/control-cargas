'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  db,
  coleccion,
  Aviso,
  ModuloApp,
} from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  Truck,
  UserCheck,
  Monitor,
  ShieldCheck,
  Settings,
  Bell,
  ChevronRight,
  LogOut,
  AlertCircle,
} from 'lucide-react';

interface ModuloCard {
  id: ModuloApp;
  titulo: string;
  descripcion: string;
  href: string;
  destacado?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const MODULOS_DISPONIBLES: ModuloCard[] = [
  {
    id: 'patio',
    titulo: 'Patio / Encargado',
    descripcion: 'Registrar unidades cargando, remisiones y salidas',
    href: '/patio',
    destacado: true,
    icon: Truck,
  },
  {
    id: 'chofer',
    titulo: 'Portal del Chofer',
    descripcion: 'Iniciar y finalizar ruta, niveles de unidad y carga de gasolina',
    href: '/chofer',
    icon: UserCheck,
  },
  {
    id: 'monitor',
    titulo: 'Monitor Administración',
    descripcion: 'Tablero en tiempo real y búsqueda por remisión',
    href: '/monitor',
    icon: Monitor,
  },
  {
    id: 'flota',
    titulo: 'Control de Flota',
    descripcion: 'Expediente de unidades, seguros, tarjetas y licencias',
    href: '/flota',
    icon: ShieldCheck,
  },
  {
    id: 'catalogos',
    titulo: 'Catálogos y Reporte Diario',
    descripcion: 'Administrar unidades, choferes y descargar Excel del día',
    href: '/catalogos',
    icon: Settings,
  },
];

const RUTA_POR_MODULO: Record<ModuloApp, string> = {
  patio: '/patio',
  monitor: '/monitor',
  flota: '/flota',
  chofer: '/chofer',
  catalogos: '/catalogos',
};

export default function HomePage() {
  const router = useRouter();
  const { user, perfil, cargando, tieneAcceso, cerrarSesion } = useAuth();
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    if (cargando) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (perfil && perfil.activo && perfil.rolBase !== 'sistemas') {
      const modulos = perfil.modulos || [];
      if (modulos.length === 1) {
        router.replace(RUTA_POR_MODULO[modulos[0]] || '/');
      }
    }
  }, [user, perfil, cargando, router]);

  useEffect(() => {
    if (!user) return;

    const qAvisos = query(
      collection(db, coleccion('avisos')),
      where('activo', '==', true),
      orderBy('creadoEn', 'desc')
    );

    const unsub = onSnapshot(
      qAvisos,
      (snap) => {
        const lista = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Aviso, 'id'>),
        }));
        setAvisos(lista);
      },
      () => {
        setAvisos([]);
      }
    );

    return () => unsub();
  }, [user]);

  const handleCerrarSesion = async () => {
    await cerrarSesion();
    router.replace('/login');
  };

  if (cargando || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-4 text-sm">
        Verificando sesión...
      </div>
    );
  }

  if (!perfil || !perfil.activo) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h1 className="text-lg font-bold">
            {perfil && !perfil.activo
              ? 'Cuenta desactivada'
              : 'Cuenta sin perfil asignado'}
          </h1>
          <p className="text-xs text-slate-400">
            Sesión iniciada como <strong className="text-slate-200">{user.email}</strong>.
            Contacta al administrador de Sistemas para habilitar tus módulos.
          </p>
          <button
            type="button"
            onClick={handleCerrarSesion}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const modulosPermitidos = MODULOS_DISPONIBLES.filter((m) =>
    tieneAcceso(m.id)
  );

  return (
    <div className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
      >
        <source src="/video-patio.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/70 to-slate-950/90 pointer-events-none" />

      <header className="relative z-10 max-w-6xl mx-auto px-4 pt-4 flex items-center justify-between gap-3">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-full px-3.5 py-1.5 text-xs text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-semibold text-white">{perfil.nombre}</span>
          <span className="text-slate-500">•</span>
          <span className="uppercase text-[10px] tracking-wider text-amber-400 font-bold">
            {perfil.rolBase}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCerrarSesion}
          className="bg-slate-900/80 hover:bg-red-950/80 backdrop-blur-md border border-slate-800 hover:border-red-800/70 text-slate-200 hover:text-red-200 rounded-full px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center text-center mb-8 sm:mb-10 space-y-2">
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-14 h-14 rounded-2xl object-contain bg-slate-900/90 p-2 border border-slate-700/80 shadow-lg"
          />
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Control de Carga y Despacho
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Selecciona la pantalla según tu área de trabajo
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-3">
            {modulosPermitidos.length === 0 ? (
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                No tienes módulos habilitados en tu perfil.
              </div>
            ) : (
              modulosPermitidos.map((mod) => {
                const Icono = mod.icon;
                return (
                  <Link
                    key={mod.id}
                    href={mod.href}
                    className={`group flex items-center justify-between gap-4 rounded-2xl px-5 py-4 border transition shadow-lg ${
                      mod.destacado
                        ? 'bg-amber-600/90 hover:bg-amber-500 border-amber-400/50 text-white'
                        : 'bg-slate-900/80 hover:bg-slate-800/90 backdrop-blur-md border-slate-800 hover:border-slate-700 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          mod.destacado
                            ? 'bg-white/15 text-white'
                            : 'bg-slate-800/90 text-amber-400 border border-slate-700/70'
                        }`}
                      >
                        <Icono className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-sm sm:text-base font-bold leading-snug">
                          {mod.titulo}
                        </h2>
                        <p
                          className={`text-xs ${
                            mod.destacado ? 'text-amber-100' : 'text-slate-400'
                          }`}
                        >
                          {mod.descripcion}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                        mod.destacado ? 'text-white' : 'text-slate-500'
                      }`}
                    />
                  </Link>
                );
              })
            )}
          </div>

          <aside className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Avisos de Seguimiento
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Pendientes y recordatorios operativos
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {avisos.length}
              </span>
            </div>

            {avisos.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Sin avisos ni pendientes activos en este momento.
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {avisos.map((aviso) => (
                  <li
                    key={aviso.id}
                    className="bg-slate-950/75 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 space-y-1"
                  >
                    <p className="leading-relaxed">{aviso.texto}</p>
                    <p className="text-[10px] text-slate-500">
                      {aviso.fechaOperacion}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}