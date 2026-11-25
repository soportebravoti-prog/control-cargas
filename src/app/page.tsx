import Link from 'next/link';
import { Truck, Monitor, Settings } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-6 text-center">
        <img
          src="/logo-bravo.png"
          alt="Logo Bravo Control de Cargas"
          className="w-24 h-24 mx-auto rounded-2xl object-contain bg-slate-900 p-2 border border-slate-800 shadow-lg"
        />
        <h1 className="text-3xl font-bold tracking-tight">Control de Carga y Despacho</h1>
        <p className="text-slate-400">Selecciona la pantalla según tu área de trabajo</p>

        <div className="grid gap-4 pt-4">
          <Link
            href="/patio"
            className="flex items-center gap-4 p-5 bg-amber-600 hover:bg-amber-500 rounded-xl transition text-left shadow-lg"
          >
            <Truck className="w-10 h-10 shrink-0" />
            <div>
              <div className="text-xl font-bold">Patio / Encargado (Abajo)</div>
              <div className="text-sm text-amber-100">Registrar unidades cargando, remisiones y salidas</div>
            </div>
          </Link>

          <Link
            href="/monitor"
            className="flex items-center gap-4 p-5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition text-left shadow-lg"
          >
            <Monitor className="w-10 h-10 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xl font-bold">Monitor Administración (Arriba)</div>
              <div className="text-sm text-slate-300">Tablero en tiempo real y búsqueda por remisión</div>
            </div>
          </Link>

          <Link
            href="/catalogos"
            className="flex items-center gap-4 p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition text-left"
          >
            <Settings className="w-7 h-7 text-slate-400 shrink-0" />
            <div>
              <div className="font-semibold">Catálogos y Reporte Diario</div>
              <div className="text-xs text-slate-400">Administrar unidades, choferes y descargar Excel del día</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}