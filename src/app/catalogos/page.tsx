'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, Unidad, Chofer } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
} from 'firebase/firestore';
import {
  Home,
  Download,
  Truck,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Power,
  PowerOff,
} from 'lucide-react';

export default function CatalogosPage() {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);

  // Reporte CSV / Excel
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);

  // Crear nueva unidad
  const [nombreUnidad, setNombreUnidad] = useState('');
  const [placasUnidad, setPlacasUnidad] = useState('');
  const [choferDefaultId, setChoferDefaultId] = useState('');
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  // Editar unidad existente
  const [editUnidadId, setEditUnidadId] = useState<string | null>(null);
  const [editNombreUnidad, setEditNombreUnidad] = useState('');
  const [editPlacasUnidad, setEditPlacasUnidad] = useState('');
  const [editChoferDefaultId, setEditChoferDefaultId] = useState('');

  // Crear nuevo chofer
  const [nombreChofer, setNombreChofer] = useState('');
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  // Editar chofer existente
  const [editChoferId, setEditChoferId] = useState<string | null>(null);
  const [editNombreChofer, setEditNombreChofer] = useState('');

  useEffect(() => {
    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);

    const unsubU = onSnapshot(query(collection(db, 'unidades')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubCh = onSnapshot(query(collection(db, 'choferes')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    return () => {
      unsubU();
      unsubCh();
    };
  }, []);

  const handleDescargar = async () => {
    if (!fechaDescarga || descargando) return;
    setDescargando(true);
    await descargarCargasCSV(fechaDescarga);
    setDescargando(false);
  };

  // --- CRUD VEHÍCULOS / UNIDADES ---
  const crearUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = nombreUnidad.trim();
    if (!limpio) return;

    setGuardandoUnidad(true);
    await addDoc(collection(db, 'unidades'), {
      nombre: limpio,
      placas: placasUnidad.trim().toUpperCase(),
      choferDefaultId: choferDefaultId || '',
      activo: true,
    });
    setNombreUnidad('');
    setPlacasUnidad('');
    setChoferDefaultId('');
    setGuardandoUnidad(false);
  };

  const empezarEditarUnidad = (u: Unidad) => {
    setEditUnidadId(u.id);
    setEditNombreUnidad(u.nombre);
    setEditPlacasUnidad(u.placas || '');
    setEditChoferDefaultId(u.choferDefaultId || '');
  };

  const guardarEdicionUnidad = async (unidadId: string) => {
    const limpio = editNombreUnidad.trim();
    if (!limpio) return;

    await updateDoc(doc(db, 'unidades', unidadId), {
      nombre: limpio,
      placas: editPlacasUnidad.trim().toUpperCase(),
      choferDefaultId: editChoferDefaultId || '',
    });
    setEditUnidadId(null);
  };

  const toggleActivoUnidad = async (u: Unidad) => {
    await updateDoc(doc(db, 'unidades', u.id), {
      activo: !u.activo,
    });
  };

  const eliminarUnidad = async (u: Unidad) => {
    const ok = window.confirm(`¿Eliminar definitivamente el vehículo "${u.nombre}"?`);
    if (!ok) return;
    await deleteDoc(doc(db, 'unidades', u.id));
  };

  // --- CRUD CHOFERES ---
  const crearChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = nombreChofer.trim();
    if (!limpio) return;

    setGuardandoChofer(true);
    await addDoc(collection(db, 'choferes'), {
      nombre: limpio,
      activo: true,
    });
    setNombreChofer('');
    setGuardandoChofer(false);
  };

  const empezarEditarChofer = (c: Chofer) => {
    setEditChoferId(c.id);
    setEditNombreChofer(c.nombre);
  };

  const guardarEdicionChofer = async (choferId: string) => {
    const limpio = editNombreChofer.trim();
    if (!limpio) return;

    await updateDoc(doc(db, 'choferes', choferId), {
      nombre: limpio,
    });
    setEditChoferId(null);
  };

  const toggleActivoChofer = async (c: Chofer) => {
    await updateDoc(doc(db, 'choferes', c.id), {
      activo: !c.activo,
    });
  };

  const eliminarChofer = async (c: Chofer) => {
    const ok = window.confirm(`¿Eliminar definitivamente al chofer "${c.nombre}"?`);
    if (!ok) return;
    await deleteDoc(doc(db, 'choferes', c.id));
  };

  const choferesActivos = choferes.filter((c) => c.activo);
  const unidadesActivas = unidades.filter((u) => u.activo);

  const obtenerNombreChofer = (id?: string) => {
    if (!id) return null;
    return choferes.find((c) => c.id === id)?.nombre || null;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      {/* Header con botón Home hacia / y logo Bravo */}
      <header className="bg-slate-900 text-white px-4 py-3.5 shadow sticky top-0 z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            title="Volver al menú principal"
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-200 transition"
          >
            <Home className="w-5 h-5" />
          </Link>
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-9 h-9 rounded-lg object-contain bg-slate-800 p-1"
          />
          <h1 className="font-bold text-base sm:text-lg">Catálogos y Reportes</h1>
        </div>
        <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 shrink-0">
          {unidadesActivas.length} vehículos • {choferesActivos.length} choferes
        </span>
      </header>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Barra superior de descarga de reporte */}
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

        {/* Vista lado a lado: Vehículos (izquierda) y Choferes (derecha) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Columna izquierda: CRUD Vehículos / Unidades */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-base text-slate-800">
                  Vehículos / Unidades ({unidades.length})
                </h2>
              </div>
              <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                {unidadesActivas.length} activos
              </span>
            </div>

            <form onSubmit={crearUnidad} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nombre / Unidad *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. NP300 Blanca"
                    value={nombreUnidad}
                    onChange={(e) => setNombreUnidad(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Placas (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. VM-4821-A"
                    value={placasUnidad}
                    onChange={(e) => setPlacasUnidad(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm uppercase bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Chofer predeterminado (opcional)
                </label>
                <select
                  value={choferDefaultId}
                  onChange={(e) => setChoferDefaultId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="">Sin chofer asignado...</option>
                  {choferesActivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={guardandoUnidad}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {guardandoUnidad ? 'Guardando...' : 'Agregar Vehículo'}
              </button>
            </form>

            <div className="space-y-2.5">
              {unidades.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                  No hay vehículos registrados.
                </p>
              ) : (
                unidades.map((u) => {
                  const choferAsignado = obtenerNombreChofer(u.choferDefaultId);
                  const editando = editUnidadId === u.id;

                  return (
                    <div
                      key={u.id}
                      className={`rounded-xl p-3.5 border transition ${
                        u.activo
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-100/70 border-slate-200 opacity-65'
                      }`}
                    >
                      {editando ? (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editNombreUnidad}
                              onChange={(e) => setEditNombreUnidad(e.target.value)}
                              placeholder="Nombre vehículo"
                              className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm outline-none"
                            />
                            <input
                              type="text"
                              value={editPlacasUnidad}
                              onChange={(e) => setEditPlacasUnidad(e.target.value)}
                              placeholder="Placas"
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm uppercase outline-none"
                            />
                          </div>
                          <select
                            value={editChoferDefaultId}
                            onChange={(e) => setEditChoferDefaultId(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white outline-none"
                          >
                            <option value="">Sin chofer asignado</option>
                            {choferesActivos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditUnidadId(null)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => guardarEdicionUnidad(u.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">{u.nombre}</span>
                              {u.placas && (
                                <span className="text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 rounded">
                                  {u.placas}
                                </span>
                              )}
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  u.activo
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {u.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            {choferAsignado && (
                              <p className="text-xs text-slate-500">
                                Chofer fijo: <span className="font-semibold text-slate-700">{choferAsignado}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => empezarEditarUnidad(u)}
                              title="Editar vehículo"
                              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivoUnidad(u)}
                              title={u.activo ? 'Desactivar' : 'Activar'}
                              className={`p-2 rounded-lg transition ${
                                u.activo
                                  ? 'text-amber-700 hover:bg-amber-50'
                                  : 'text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {u.activo ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => eliminarUnidad(u)}
                              title="Eliminar vehículo"
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Columna derecha: CRUD Choferes */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-base text-slate-800">Choferes ({choferes.length})</h2>
              </div>
              <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                {choferesActivos.length} activos
              </span>
            </div>

            <form onSubmit={crearChofer} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre del chofer *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Hernández"
                  value={nombreChofer}
                  onChange={(e) => setNombreChofer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={guardandoChofer}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {guardandoChofer ? 'Guardando...' : 'Agregar Chofer'}
              </button>
            </form>

            <div className="space-y-2.5">
              {choferes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                  No hay choferes registrados.
                </p>
              ) : (
                choferes.map((c) => {
                  const editando = editChoferId === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl p-3.5 border transition ${
                        c.activo
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-100/70 border-slate-200 opacity-65'
                      }`}
                    >
                      {editando ? (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            value={editNombreChofer}
                            onChange={(e) => setEditNombreChofer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                guardarEdicionChofer(c.id);
                              }
                            }}
                            className="flex-1 rounded-lg border border-emerald-400 px-3 py-1.5 text-sm outline-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditChoferId(null)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => guardarEdicionChofer(c.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{c.nombre}</span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                c.activo
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {c.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => empezarEditarChofer(c)}
                              title="Editar chofer"
                              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivoChofer(c)}
                              title={c.activo ? 'Desactivar' : 'Activar'}
                              className={`p-2 rounded-lg transition ${
                                c.activo
                                  ? 'text-amber-700 hover:bg-amber-50'
                                  : 'text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {c.activo ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => eliminarChofer(c)}
                              title="Eliminar chofer"
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}