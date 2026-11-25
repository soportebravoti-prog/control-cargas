'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, Carga } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Search, Truck, CheckCircle, Clock, Settings, Radio, Download } from 'lucide-react';

export default function MonitorPage() {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [horaActual, setHoraActual] = useState('');
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);

    const interval = setInterval(() => {
      setHoraActual(
        new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hoy) return;

    const qCargas = query(collection(db, 'cargas'), where('fechaOperacion', '==', hoy));
    const unsub = onSnapshot(qCargas, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Carga));
      list.sort((a, b) => b.horaInicio.localeCompare(a.horaInicio));
      setCargas(list);
    });

    return () => unsub();
  }, [hoy]);

  const handleDescargar = async () => {
    if (!fechaDescarga || descargando) return;
    setDescargando(true);
    await descargarCargasCSV(fechaDescarga);
    setDescargando(false);
  };

  const filtro = busqueda.trim().toUpperCase();
  const cargasFiltradas = filtro
    ? cargas.filter(
        (c) =>
          c.unidadNombre.toUpperCase().includes(filtro) ||
          c.choferNombre.toUpperCase().includes(filtro) ||
          c.destino.toUpperCase().includes(filtro) ||
          c.remisiones.some((r: string) => r.toUpperCase().includes(filtro))
      )
    : cargas;

  const cargando = cargasFiltradas.filter((c) => c.estado === 'CARGANDO');
  const enRuta = cargasFiltradas.filter((c) => c.estado === 'EN_RUTA');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> EN VIVO
          </div>
          <h1 className="text-xl font-bold tracking-tight">Monitor de Cargas y Salidas</h1>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar remisión, chofer, unidad o destino..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
            <input
              type="date"
              value={fechaDescarga}
              onChange={(e) => setFechaDescarga(e.target.value)}
              className="bg-transparent text-xs text-slate-200 outline-none"
            />
            <button
              type="button"
              onClick={handleDescargar}
              disabled={!fechaDescarga || descargando}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
            >
              <Download className="w-3.5 h-3.5" />
              {descargando ? 'Bajando...' : 'Excel / CSV'}
            </button>
          </div>

          <span className="font-mono text-lg font-semibold text-slate-300">{horaActual}</span>

          <Link
            href="/catalogos"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition"
          >
            <Settings className="w-4 h-4" /> Catálogos
          </Link>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Truck className="w-6 h-6 text-amber-400" />
              <h2 className="text-lg font-bold text-amber-400">CARGANDO EN PATIO</h2>
            </div>
            <span className="bg-amber-500/20 text-amber-300 font-bold px-3 py-1 rounded-full text-sm">
              {cargando.length}
            </span>
          </div>

          <div className="space-y-4 overflow-y-auto">
            {cargando.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                Sin unidades cargando en patio ahora
              </div>
            ) : (
              cargando.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-900 border-l-4 border-l-amber-500 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl font-bold text-white">{c.unidadNombre}</span>
                        <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-md">
                          Vuelta #{c.vuelta}
                        </span>
                      </div>
                      <div className="text-base text-slate-300 mt-0.5">
                        Chofer: <strong className="text-white">{c.choferNombre}</strong> • Destino:{' '}
                        <strong className="text-amber-300">{c.destino}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(c.horaInicio).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1.5">
                      Mercancía / Remisiones ({c.remisiones.length}):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.remisiones.length > 0 ? (
                        c.remisiones.map((r: string) => (
                          <span
                            key={r}
                            className={`px-3 py-1 rounded-lg text-sm font-bold ${
                              filtro && r.toUpperCase().includes(filtro)
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-amber-200 border border-slate-700'
                            }`}
                          >
                            {r}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic">Sin remisiones capturadas aún</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
              <h2 className="text-lg font-bold text-emerald-400">EN RUTA (SALIDAS DE HOY)</h2>
            </div>
            <span className="bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1 rounded-full text-sm">
              {enRuta.length}
            </span>
          </div>

          <div className="space-y-4 overflow-y-auto">
            {enRuta.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                Aún no hay unidades despachadas hoy
              </div>
            ) : (
              enRuta.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-900 border-l-4 border-l-emerald-500 border border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl font-bold text-white">{c.unidadNombre}</span>
                        <span className="bg-slate-800 text-slate-300 text-xs font-bold px-2.5 py-0.5 rounded-md">
                          Vuelta #{c.vuelta}
                        </span>
                      </div>
                      <div className="text-base text-slate-300 mt-0.5">
                        Chofer: <strong className="text-white">{c.choferNombre}</strong> • Destino:{' '}
                        <strong className="text-emerald-300">{c.destino}</strong>
                      </div>
                    </div>

                    <div className="text-right text-xs text-slate-400 space-y-0.5">
                      <div>
                        Cargó:{' '}
                        {new Date(c.horaInicio).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-emerald-400 font-bold">
                        Salió:{' '}
                        {c.horaSalida
                          ? new Date(c.horaSalida).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '--:--'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap gap-2">
                      {c.remisiones.map((r: string) => (
                        <span
                          key={r}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            filtro && r.toUpperCase().includes(filtro)
                              ? 'bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 text-slate-200 border border-slate-700'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}