'use client';

import { useEffect, useState } from 'react';
import { db, Unidad, Chofer, Carga } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Plus, Truck, X, CheckCircle2, PackagePlus, Download } from 'lucide-react';

export default function PatioPage() {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargasHoy, setCargasHoy] = useState<Carga[]>([]);
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);

  const [unidadId, setUnidadId] = useState('');
  const [choferId, setChoferId] = useState('');
  const [destino, setDestino] = useState('');
  const [remisionInput, setRemisionInput] = useState('');
  const [remisiones, setRemisiones] = useState<string[]>([]);
  const [extraRemision, setExtraRemision] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);
  }, []);

  useEffect(() => {
    if (!hoy) return;

    const qUnidades = query(collection(db, 'unidades'), where('activo', '==', true));
    const qChoferes = query(collection(db, 'choferes'), where('activo', '==', true));
    const qCargas = query(collection(db, 'cargas'), where('fechaOperacion', '==', hoy));

    const unsubU = onSnapshot(qUnidades, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubCh = onSnapshot(qChoferes, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    const unsubCa = onSnapshot(qCargas, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Carga));
      list.sort((a, b) => b.horaInicio.localeCompare(a.horaInicio));
      setCargasHoy(list);
    });

    return () => {
      unsubU();
      unsubCh();
      unsubCa();
    };
  }, [hoy]);

  const handleDescargar = async () => {
    if (!fechaDescarga || descargando) return;
    setDescargando(true);
    await descargarCargasCSV(fechaDescarga);
    setDescargando(false);
  };

  const handleSelectUnidad = (id: string) => {
    setUnidadId(id);
    const unidad = unidades.find((u) => u.id === id);
    if (unidad?.choferDefaultId) {
      setChoferId(unidad.choferDefaultId);
    }
  };

  const agregarRemision = () => {
    const val = remisionInput.trim().toUpperCase();
    if (!val || remisiones.includes(val)) return;
    setRemisiones([...remisiones, val]);
    setRemisionInput('');
  };

  const unidadSeleccionada = unidades.find((u) => u.id === unidadId);
  const vueltaCalculada = unidadSeleccionada
    ? cargasHoy.filter((c) => c.unidadNombre === unidadSeleccionada.nombre).length + 1
    : 1;

  const iniciarCarga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadId || !choferId || !destino.trim() || !hoy) return;

    const unidad = unidades.find((u) => u.id === unidadId)!;
    const chofer = choferes.find((c) => c.id === choferId)!;

    const listaFinal = remisionInput.trim()
      ? Array.from(new Set([...remisiones, remisionInput.trim().toUpperCase()]))
      : remisiones;

    setLoading(true);
    await addDoc(collection(db, 'cargas'), {
      unidadNombre: unidad.nombre,
      choferNombre: chofer.nombre,
      destino: destino.trim(),
      remisiones: listaFinal,
      vuelta: vueltaCalculada,
      estado: 'CARGANDO',
      horaInicio: new Date().toISOString(),
      horaSalida: null,
      fechaOperacion: hoy,
    });

    setUnidadId('');
    setChoferId('');
    setDestino('');
    setRemisiones([]);
    setRemisionInput('');
    setLoading(false);
  };

  const agregarRemisionACargaActiva = async (carga: Carga) => {
    const nueva = (extraRemision[carga.id] || '').trim().toUpperCase();
    if (!nueva || carga.remisiones.includes(nueva)) return;

    await updateDoc(doc(db, 'cargas', carga.id), {
      remisiones: [...carga.remisiones, nueva],
    });

    setExtraRemision({ ...extraRemision, [carga.id]: '' });
  };

  const despacharUnidad = async (id: string) => {
    await updateDoc(doc(db, 'cargas', id), {
      estado: 'EN_RUTA',
      horaSalida: new Date().toISOString(),
    });
  };

  const cargandoAhora = cargasHoy.filter((c) => c.estado === 'CARGANDO');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      <header className="bg-slate-900 text-white px-4 py-4 shadow sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-amber-400" />
          <h1 className="font-bold text-lg">Patio — Registro de Carga</h1>
        </div>
        <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300">
          {cargandoAhora.length} en patio
        </span>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">Descargar Reporte (Excel / CSV)</div>
            <div className="text-xs text-slate-500">
              {fechaDescarga === hoy ? 'Corte del día de hoy' : `Corte de fecha: ${fechaDescarga}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fechaDescarga}
              onChange={(e) => setFechaDescarga(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
            <button
              type="button"
              onClick={handleDescargar}
              disabled={!fechaDescarga || descargando}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl text-sm flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" />
              {descargando ? 'Descargando...' : 'Descargar'}
            </button>
          </div>
        </div>

        <form onSubmit={iniciarCarga} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-slate-800">1. Iniciar Nueva Carga</h2>
            {unidadSeleccionada && (
              <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                Será Vuelta #{vueltaCalculada}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unidad *</label>
              <select
                required
                value={unidadId}
                onChange={(e) => handleSelectUnidad(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-base bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              >
                <option value="">Seleccionar unidad...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.placas ? `(${u.placas})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Chofer *</label>
              <select
                required
                value={choferId}
                onChange={(e) => setChoferId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-base bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              >
                <option value="">Seleccionar chofer...</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Destino / Ruta *</label>
            <input
              type="text"
              required
              placeholder="Ej. Cárdenas, Centro, Villahermosa Norte..."
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-base focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Remisiones / Mercancía (escribe y presiona + o Enter)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Folio remisión (ej. REM-1045)"
                value={remisionInput}
                onChange={(e) => setRemisionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarRemision();
                  }
                }}
                className="flex-1 rounded-xl border border-slate-300 p-3 text-base uppercase focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <button
                type="button"
                onClick={agregarRemision}
                className="bg-slate-800 text-white px-4 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-1"
              >
                <Plus className="w-5 h-5" /> Agregar
              </button>
            </div>

            {remisiones.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {remisiones.map((rem: string) => (
                  <span
                    key={rem}
                    className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-900 px-3 py-1 rounded-lg text-sm font-semibold"
                  >
                    {rem}
                    <button
                      type="button"
                      onClick={() => setRemisiones(remisiones.filter((r) => r !== rem))}
                      className="text-amber-700 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base shadow transition flex items-center justify-center gap-2"
          >
            <PackagePlus className="w-5 h-5" />
            {loading ? 'Guardando...' : 'Registrar Unidad Cargando'}
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="font-bold text-base text-slate-800 px-1">
            2. Cargando en Patio Ahora ({cargandoAhora.length})
          </h2>

          {cargandoAhora.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-dashed border-slate-300">
              No hay unidades cargando en este momento.
            </div>
          ) : (
            cargandoAhora.map((carga) => (
              <div
                key={carga.id}
                className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-l-amber-500 border border-slate-200 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-slate-900">{carga.unidadNombre}</span>
                      <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        Vuelta #{carga.vuelta}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 font-medium">
                      Chofer: <span className="text-slate-900">{carga.choferNombre}</span> • Destino:{' '}
                      <span className="text-slate-900">{carga.destino}</span>
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    Inicio:{' '}
                    {new Date(carga.horaInicio).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5">
                    Remisiones ({carga.remisiones.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {carga.remisiones.map((r: string) => (
                      <span
                        key={r}
                        className="bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md"
                      >
                        {r}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="+ Añadir otra remisión..."
                      value={extraRemision[carga.id] || ''}
                      onChange={(e) =>
                        setExtraRemision({ ...extraRemision, [carga.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          agregarRemisionACargaActiva(carga);
                        }
                      }}
                      className="flex-1 text-sm rounded-lg border border-slate-300 px-3 py-2 uppercase outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => agregarRemisionACargaActiva(carga)}
                      className="text-xs font-bold bg-slate-200 hover:bg-slate-300 px-3 py-2 rounded-lg"
                    >
                      Sumar
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => despacharUnidad(carga.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Listo / Salió a Ruta
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}