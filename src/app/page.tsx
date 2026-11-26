'use client';

import Link from 'next/link';
import { PanelAvisos } from '@/components/PanelAvisos';
import { BotonTema, useTemaApp } from '@/components/BotonTema';
import { Truck, Monitor, Settings, Car, ChevronRight } from 'lucide-react';

export default function HomePage() {
  const tema = useTemaApp();
  const esOscuro = tema === 'dark';

  return (
    <div
      className={`min-h-screen relative overflow-hidden flex flex-col justify-center py-10 transition-colors ${
        esOscuro ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Video de fondo en bucle con mejor visibilidad */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className={`fixed inset-0 w-full h-full object-cover pointer-events-none ${
          esOscuro ? 'opacity-55' : 'opacity-30'
        }`}
      >
        <source src="/video-patio.mp4" type="video/mp4" />
      </video>

      <div
        className={`fixed inset-0 pointer-events-none ${
          esOscuro
            ? 'bg-gradient-to-br from-slate-950/70 via-slate-950/60 to-slate-900/70'
            : 'bg-gradient-to-br from-white/75 via-slate-100/70 to-slate-200/75'
        }`}
      />

      {/* Botón superior derecho para cambiar de tema */}
      <div className="relative z-20 max-w-6xl w-full mx-auto px-4 sm:px-6 flex justify-end mb-4">
        <BotonTema />
      </div>

      {/* Contenido principal */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-6 space-y-8">
        {/* Encabezado centrado arriba */}
        <div className="flex flex-col items-center text-center space-y-3">
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className={`w-16 h-16 rounded-2xl object-contain p-2 border shadow-lg ${
              esOscuro
                ? 'bg-slate-900/90 border-slate-700/80'
                : 'bg-white/95 border-slate-200'
            }`}
          />
          <div>
            <h1
              className={`text-3xl sm:text-4xl font-bold tracking-tight ${
                esOscuro ? 'text-white' : 'text-slate-900'
              }`}
            >
              Control de Carga y Despacho
            </h1>
            <p
              className={`text-sm sm:text-base mt-1 ${
                esOscuro ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              Selecciona la pantalla según tu área de trabajo
            </p>
          </div>
        </div>

        {/* Dos columnas alineadas arriba: botones a la izquierda, avisos a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-3.5">
            <Link
              href="/patio"
              className="group w-full bg-amber-600 hover:bg-amber-500 text-white rounded-2xl p-4 sm:p-5 shadow-lg shadow-amber-950/25 transition flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="bg-amber-700/70 p-3 rounded-xl border border-amber-400/30">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg leading-tight">
                    Patio / Encargado
                  </div>
                  <div className="text-xs sm:text-sm text-amber-100/90 mt-0.5">
                    Registrar unidades cargando, remisiones y salidas
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-100 group-hover:translate-x-1 transition shrink-0" />
            </Link>

            <Link
              href="/monitor"
              className={`group w-full border rounded-2xl p-4 sm:p-5 shadow transition flex items-center justify-between gap-4 ${
                esOscuro
                  ? 'bg-slate-900/90 hover:bg-slate-800/90 text-white border-slate-700/80'
                  : 'bg-white/95 hover:bg-slate-50 text-slate-900 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-xl border ${
                    esOscuro
                      ? 'bg-slate-800 border-slate-700 text-emerald-400'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  }`}
                >
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg leading-tight">
                    Monitor Administración
                  </div>
                  <div
                    className={`text-xs sm:text-sm mt-0.5 ${
                      esOscuro ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Tablero en tiempo real y búsqueda por remisión
                  </div>
                </div>
              </div>
              <ChevronRight
                className={`w-5 h-5 group-hover:translate-x-1 transition shrink-0 ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              />
            </Link>

            <Link
              href="/catalogos"
              className={`group w-full border rounded-2xl p-4 sm:p-5 shadow transition flex items-center justify-between gap-4 ${
                esOscuro
                  ? 'bg-slate-900/90 hover:bg-slate-800/90 text-white border-slate-700/80'
                  : 'bg-white/95 hover:bg-slate-50 text-slate-900 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-xl border ${
                    esOscuro
                      ? 'bg-slate-800 border-slate-700 text-sky-400'
                      : 'bg-sky-50 border-sky-200 text-sky-600'
                  }`}
                >
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg leading-tight">
                    Catálogos y Reporte Diario
                  </div>
                  <div
                    className={`text-xs sm:text-sm mt-0.5 ${
                      esOscuro ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Administrar unidades, choferes y descargar Excel del día
                  </div>
                </div>
              </div>
              <ChevronRight
                className={`w-5 h-5 group-hover:translate-x-1 transition shrink-0 ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              />
            </Link>

            <Link
              href="/flota"
              className={`group w-full border rounded-2xl p-4 sm:p-5 shadow transition flex items-center justify-between gap-4 ${
                esOscuro
                  ? 'bg-slate-900/90 hover:bg-slate-800/90 text-white border-slate-700/80'
                  : 'bg-white/95 hover:bg-slate-50 text-slate-900 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-xl border ${
                    esOscuro
                      ? 'bg-slate-800 border-slate-700 text-amber-400'
                      : 'bg-amber-50 border-amber-200 text-amber-600'
                  }`}
                >
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg leading-tight">
                    Control de Flota
                  </div>
                  <div
                    className={`text-xs sm:text-sm mt-0.5 ${
                      esOscuro ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Expediente de unidades, seguros, tarjetas y licencias
                  </div>
                </div>
              </div>
              <ChevronRight
                className={`w-5 h-5 group-hover:translate-x-1 transition shrink-0 ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              />
            </Link>
          </div>

          <div className="lg:col-span-5">
            <PanelAvisos variante="inicio" />
          </div>
        </div>
      </main>
    </div>
  );
}