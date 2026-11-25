'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, Unidad, Chofer, Carga } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';

export default function CatalogosPage() {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);

  const [nuevoChofer, setNuevoChofer] = useState('');
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [nuevasPlacas, setNuevasPlacas] = useState('');
  const [choferDefaultId, setChoferDefaultId] = useState('');
  const [fechaReporte, setFechaReporte] = useState('');

  useEffect(() => {
    setFechaReporte(new Date().toLocaleDateString('en-CA'));
  }, []);

  useEffect(() => {
    const qU = query(collection(db, 'unidades'), where('activo', '==', true));
    const qCh = query(collection(db, 'choferes'), where('activo', '==', true));

    const unsubU = onSnapshot(qU, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubCh = onSnapshot(qCh, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    return () => {
      unsubU();
      unsubCh();
    };
  }, []);

  const agregarChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoChofer.trim()) return;
    await addDoc(collection(db, 'choferes'), {
      nombre: nuevoChofer.trim(),
      activo: true,
    });
    setNuevoChofer('');
  };

  const agregarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaUnidad.trim()) return;
    await addDoc(collection(db, 'unidades'), {
      nombre: nuevaUnidad.trim(),
      placas: nuevasPlacas.trim(),
      choferDefaultId,
      activo: true,
    });
    setNuevaUnidad('');
    setNuevasPlacas('');
    setChoferDefaultId('');
  };

  const desactivarChofer = async (id: string) => {
    await updateDoc(doc(db, 'choferes', id), { activo: false });
  };

  const desactivarUnidad = async (id: string) => {
    await updateDoc(doc(db, 'unidades', id), { activo: false });
  };

  const descargarCSV = async () => {
    if (!fechaReporte) return;

    const qCargas = query(collection(db, 'cargas'), where('fechaOperacion', '==', fechaReporte));
    const snap = await getDocs(qCargas);
    const data = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Carga))
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    if (data.length === 0) {
      alert('No hay cargas registradas en esa fecha.');
      return;
    }

    const filas = data.map((c) => [
      c.fechaOperacion,
      `"${c.unidadNombre}"`,
      `"${c.choferNombre}"`,
      `"${c.destino}"`,
      c.vuelta,
      c.estado,
      new Date(c.horaInicio).toLocaleTimeString('es-MX'),
      c.horaSalida ? new Date(c.horaSalida).toLocaleTimeString('es-MX') : 'En patio',
      `"${c.remisiones.join(', ')}"`,
    ]);

    const encabezado = 'Fecha,Unidad,Chofer,Destino,Vuelta,Estado,Hora Inicio,Hora Salida,Remisiones\n';
    const csv = '\uFEFF' + encabezado + filas.map((f) => f.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-cargas-${fechaReporte}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/monitor" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Volver al Monitor
          </Link>
          <h1 className="text-xl font-bold">Catálogos y Reportes</h1>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-base">Descargar Corte Diario (Excel / CSV)</h2>
            <p className="text-xs text-slate-500">Exporta todas las vueltas, horarios y remisiones del día</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fechaReporte}
              onChange={(e) => setFechaReporte(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={descargarCSV}
              disabled={!fechaReporte}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Descargar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h2 className="font-bold text-base">Choferes Activos ({choferes.length})</h2>
            <form onSubmit={agregarChofer} className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del chofer..."
                value={nuevoChofer}
                onChange={(e) => setNuevoChofer(e.target.value)}
                className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <button className="bg-slate-900 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1">
                <Plus className="w-4 h-4" /> Alta
              </button>
            </form>
            <ul className="divide-y divide-slate-100">
              {choferes.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{c.nombre}</span>
                  <button onClick={() => desactivarChofer(c.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h2 className="font-bold text-base">Unidades Activas ({unidades.length})</h2>
            <form onSubmit={agregarUnidad} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej. Unidad 03 - NP300"
                  value={nuevaUnidad}
                  onChange={(e) => setNuevaUnidad(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Placas"
                  value={nuevasPlacas}
                  onChange={(e) => setNuevasPlacas(e.target.value)}
                  className="w-28 border border-slate-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={choferDefaultId}
                  onChange={(e) => setChoferDefaultId(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
                >
                  <option value="">Chofer fijo (opcional)...</option>
                  {choferes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <button className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Alta
                </button>
              </div>
            </form>
            <ul className="divide-y divide-slate-100">
              {unidades.map((u) => (
                <li key={u.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{u.nombre}</div>
                    {u.placas && <div className="text-xs text-slate-400">Placas: {u.placas}</div>}
                  </div>
                  <button onClick={() => desactivarUnidad(u.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}