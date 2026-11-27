'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { db, Unidad, Chofer, Carga } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import { DesbloqueoAudioModal } from '@/components/DesbloqueoAudioModal';
import { PanelAvisos } from '@/components/PanelAvisos';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Plus,
  X,
  CheckCircle2,
  PackagePlus,
  Download,
  Ban,
  Home,
  Pencil,
  Check,
  History,
  ChevronDown,
  ChevronUp,
  Flag,
  Truck,
  RotateCcw,
} from 'lucide-react';

type UnidadExtendida = Unidad & {
  marca?: string;
  modelo?: string;
  submarca?: string;
  version?: string;
  descripcion?: string;
  tipo?: string;
  color?: string;
  anio?: string | number;
};

type CargaExtendida = Carga & {
  unidadId?: string;
  unidadModelo?: string;
};

function normalizar(txt?: string): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function obtenerDetalleModeloUnidad(u: UnidadExtendida): string {
  const nombreNorm = normalizar(u.nombre);
  const candidatos = [
    u.marcaModelo,
    u.modelo,
    u.submarca,
    u.version,
    u.marca,
    u.descripcion,
    u.tipo,
    u.color,
    u.anio ? String(u.anio) : '',
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean);

  const unicos: string[] = [];
  for (const item of candidatos) {
    const itemNorm = normalizar(item);
    if (!itemNorm || itemNorm === nombreNorm) continue;
    if (!unicos.some((existente) => normalizar(existente) === itemNorm)) {
      unicos.push(item);
    }
  }
  return unicos.join(' • ');
}

function formatearEtiquetaUnidad(u: UnidadExtendida, estaEnRuta = false): string {
  const modelo = obtenerDetalleModeloUnidad(u);
  const placas = (u.placas || '').trim();
  const partes = [u.nombre];
  if (modelo) partes.push(modelo);
  if (placas) partes.push(`Placas: ${placas}`);
  let texto = partes.join(' — ');
  if (estaEnRuta) texto += ' [EN RUTA]';
  return texto;
}

function cargaPerteneceAUnidad(carga: CargaExtendida, unidad: UnidadExtendida): boolean {
  if (carga.unidadId) {
    return carga.unidadId === unidad.id;
  }
  const cNombre = normalizar(carga.unidadNombre);
  const uNombre = normalizar(unidad.nombre);
  const uEtiqueta = normalizar(formatearEtiquetaUnidad(unidad, false));
  return Boolean(cNombre && (cNombre === uNombre || cNombre === uEtiqueta));
}

export default function PatioPage() {
  const [unidades, setUnidades] = useState<UnidadExtendida[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargasHoy, setCargasHoy] = useState<CargaExtendida[]>([]);
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);

  const [unidadId, setUnidadId] = useState('');
  const [choferId, setChoferId] = useState('');
  const [destino, setDestino] = useState('');
  const [remisionInput, setRemisionInput] = useState('');
  const [remisiones, setRemisiones] = useState<string[]>([]);
  const [extraRemision, setExtraRemision] = useState<Record<string, string>>({});
  const [editandoDestinoId, setEditandoDestinoId] = useState<string | null>(null);
  const [nuevoDestino, setNuevoDestino] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal cuando seleccionan una unidad que sigue EN_RUTA
  const [cargaEnRutaPorFinalizar, setCargaEnRutaPorFinalizar] = useState<CargaExtendida | null>(
    null
  );
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);
  const [retomandoId, setRetomandoId] = useState<string | null>(null);

  // Modal de cancelación integrado
  const [cargaACancelar, setCargaACancelar] = useState<CargaExtendida | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  const [mostrarFinalizadas, setMostrarFinalizadas] = useState(false);
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);

  // Alertas sonoras en Patio
  const audioCargandoRef = useRef<HTMLAudioElement | null>(null);
  const audioSalidaRef = useRef<HTMLAudioElement | null>(null);
  const audioFinalizadoRef = useRef<HTMLAudioElement | null>(null);
  const estadosPreviosRef = useRef<Record<string, Carga['estado']>>({});
  const cargaInicialRef = useRef<boolean>(true);

  useEffect(() => {
    audioCargandoRef.current = new Audio('/sonido-cargando.mp3');
    audioSalidaRef.current = new Audio('/sonido-salida.mp3');
    audioFinalizadoRef.current = new Audio('/sonido-finalizado.mp3');
  }, []);

  const desbloquearAudios = () => {
    [audioCargandoRef.current, audioSalidaRef.current, audioFinalizadoRef.current].forEach(
      (audio) => {
        if (!audio) return;
        audio.volume = 0;
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1;
          })
          .catch(() => {
            audio.volume = 1;
          });
      }
    );
  };

  const reproducirTono = (tipo: 'CARGANDO' | 'SALIDA' | 'FINALIZADA') => {
    const audio =
      tipo === 'FINALIZADA'
        ? audioFinalizadoRef.current
        : tipo === 'SALIDA'
        ? audioSalidaRef.current
        : audioCargandoRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);
  }, []);

  useEffect(() => {
    if (!hoy) return;

    cargaInicialRef.current = true;
    if (estadosPreviosRef && typeof estadosPreviosRef === 'object') {
      estadosPreviosRef.current = {};
    }

    const qUnidades = query(collection(db, 'unidades'), where('activo', '==', true));
    const qChoferes = query(collection(db, 'choferes'), where('activo', '==', true));
    const qCargas = query(collection(db, 'cargas'), where('fechaOperacion', '==', hoy));

    const unsubU = onSnapshot(qUnidades, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UnidadExtendida));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubCh = onSnapshot(qChoferes, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    const unsubCa = onSnapshot(qCargas, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CargaExtendida));
      list.sort((a, b) => (b.horaInicio || '').localeCompare(a.horaInicio || ''));

      const mapaActual =
        estadosPreviosRef &&
        typeof estadosPreviosRef === 'object' &&
        estadosPreviosRef.current &&
        typeof estadosPreviosRef.current === 'object'
          ? estadosPreviosRef.current
          : {};

      if (cargaInicialRef.current) {
        const snapshotInicial: Record<string, Carga['estado']> = {};
        list.forEach((c) => {
          snapshotInicial[c.id] = c.estado;
        });
        if (estadosPreviosRef && typeof estadosPreviosRef === 'object') {
          estadosPreviosRef.current = snapshotInicial;
        }
        cargaInicialRef.current = false;
      } else {
        let huboNuevaCarga = false;
        let huboNuevaSalida = false;
        let huboFinalizacion = false;

        list.forEach((c) => {
          const previo = mapaActual[c.id];
          if (!previo && c.estado === 'CARGANDO') {
            huboNuevaCarga = true;
          } else if (previo && previo !== 'EN_RUTA' && c.estado === 'EN_RUTA') {
            huboNuevaSalida = true;
          } else if (previo && previo !== 'FINALIZADA' && c.estado === 'FINALIZADA') {
            huboFinalizacion = true;
          }
        });

        const siguienteMapa: Record<string, Carga['estado']> = {};
        list.forEach((c) => {
          siguienteMapa[c.id] = c.estado;
        });
        if (estadosPreviosRef && typeof estadosPreviosRef === 'object') {
          estadosPreviosRef.current = siguienteMapa;
        }

        if (huboFinalizacion) {
          reproducirTono('FINALIZADA');
        } else if (huboNuevaSalida) {
          reproducirTono('SALIDA');
        } else if (huboNuevaCarga) {
          reproducirTono('CARGANDO');
        }
      }

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
    if (!unidad) return;

    if (unidad.choferDefaultId) {
      setChoferId(unidad.choferDefaultId);
    }

    const activaEnRuta = cargasHoy.find(
      (c) => cargaPerteneceAUnidad(c, unidad) && c.estado === 'EN_RUTA'
    );
    if (activaEnRuta) {
      setCargaEnRutaPorFinalizar(activaEnRuta);
    }
  };

  const finalizarRuta = async (cargaId: string) => {
    try {
      setFinalizandoId(cargaId);
      await updateDoc(doc(db, 'cargas', cargaId), {
        estado: 'FINALIZADA',
        horaRegreso: new Date().toISOString(),
      });
    } finally {
      setFinalizandoId(null);
    }
  };

  const retomarRuta = async (cargaId: string) => {
    try {
      setRetomandoId(cargaId);
      await updateDoc(doc(db, 'cargas', cargaId), {
        estado: 'EN_RUTA',
        horaRegreso: null,
      });
    } finally {
      setRetomandoId(null);
    }
  };

  const confirmarFinalizarDesdeSelector = async () => {
    if (!cargaEnRutaPorFinalizar) return;
    await finalizarRuta(cargaEnRutaPorFinalizar.id);
    setCargaEnRutaPorFinalizar(null);
  };

  const rechazarFinalizarDesdeSelector = () => {
    setCargaEnRutaPorFinalizar(null);
    setUnidadId('');
  };

  const agregarRemision = () => {
    const val = remisionInput.trim().toUpperCase();
    if (!val || remisiones.includes(val)) return;
    setRemisiones([...remisiones, val]);
    setRemisionInput('');
  };

  const unidadSeleccionada = unidades.find((u) => u.id === unidadId);
  const modeloUnidadSeleccionada = unidadSeleccionada
    ? obtenerDetalleModeloUnidad(unidadSeleccionada)
    : '';

  const vueltaCalculada = unidadSeleccionada
    ? cargasHoy.filter(
        (c) => cargaPerteneceAUnidad(c, unidadSeleccionada) && c.estado !== 'CANCELADA'
      ).length + 1
    : 1;

  const iniciarCarga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadId || !choferId || !destino.trim() || !hoy) return;

    const unidad = unidades.find((u) => u.id === unidadId)!;
    const chofer = choferes.find((c) => c.id === choferId)!;
    const modeloUnidad = obtenerDetalleModeloUnidad(unidad);

    const sigueEnRuta = cargasHoy.find(
      (c) => cargaPerteneceAUnidad(c, unidad) && c.estado === 'EN_RUTA'
    );
    if (sigueEnRuta) {
      setCargaEnRutaPorFinalizar(sigueEnRuta);
      return;
    }

    const listaFinal = remisionInput.trim()
      ? Array.from(new Set([...remisiones, remisionInput.trim().toUpperCase()]))
      : remisiones;

    setLoading(true);
    await addDoc(collection(db, 'cargas'), {
      unidadId: unidad.id,
      unidadNombre: unidad.nombre,
      unidadModelo: modeloUnidad,
      choferId: chofer.id,
      choferNombre: chofer.nombre,
      destino: destino.trim(),
      remisiones: listaFinal,
      vuelta: vueltaCalculada,
      estado: 'CARGANDO',
      horaInicio: new Date().toISOString(),
      horaSalida: null,
      horaRegreso: null,
      fechaOperacion: hoy,
    });

    setUnidadId('');
    setChoferId('');
    setDestino('');
    setRemisiones([]);
    setRemisionInput('');
    setLoading(false);
  };

  const agregarRemisionACarga = async (carga: Carga) => {
    const nueva = (extraRemision[carga.id] || '').trim().toUpperCase();
    if (!nueva || carga.remisiones.includes(nueva)) return;

    await updateDoc(doc(db, 'cargas', carga.id), {
      remisiones: [...carga.remisiones, nueva],
    });

    setExtraRemision({ ...extraRemision, [carga.id]: '' });
  };

  const quitarRemisionDeCarga = async (carga: Carga, remisionAQuitar: string) => {
    await updateDoc(doc(db, 'cargas', carga.id), {
      remisiones: carga.remisiones.filter((r) => r !== remisionAQuitar),
    });
  };

  const iniciarEdicionDestino = (carga: Carga) => {
    setEditandoDestinoId(carga.id);
    setNuevoDestino(carga.destino);
  };

  const guardarDestino = async (cargaId: string) => {
    const limpio = nuevoDestino.trim();
    if (!limpio) return;

    await updateDoc(doc(db, 'cargas', cargaId), {
      destino: limpio,
    });

    setEditandoDestinoId(null);
    setNuevoDestino('');
  };

  const despacharUnidad = async (id: string) => {
    await updateDoc(doc(db, 'cargas', id), {
      estado: 'EN_RUTA',
      horaSalida: new Date().toISOString(),
    });
  };

  const abrirModalCancelacion = (carga: CargaExtendida) => {
    setCargaACancelar(carga);
    setMotivoCancelacion('');
  };

  const cerrarModalCancelacion = () => {
    if (cancelandoId) return;
    setCargaACancelar(null);
    setMotivoCancelacion('');
  };

  const confirmarCancelacionSalida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cargaACancelar) return;

    try {
      setCancelandoId(cargaACancelar.id);
      await updateDoc(doc(db, 'cargas', cargaACancelar.id), {
        estado: 'CANCELADA',
        horaCancelacion: new Date().toISOString(),
        motivoCancelacion: motivoCancelacion.trim(),
      });
      setCargaACancelar(null);
      setMotivoCancelacion('');
    } finally {
      setCancelandoId(null);
    }
  };

  const resolverModeloDeCarga = (carga: CargaExtendida): string => {
    if (carga.unidadModelo && carga.unidadModelo.trim()) {
      return carga.unidadModelo.trim();
    }
    const u = unidades.find(
      (item) =>
        (carga.unidadId && item.id === carga.unidadId) ||
        normalizar(item.nombre) === normalizar(carga.unidadNombre)
    );
    return u ? obtenerDetalleModeloUnidad(u) : '';
  };

  const cargandoAhora = cargasHoy.filter((c) => c.estado === 'CARGANDO');
  const enRutaHoy = cargasHoy.filter((c) => c.estado === 'EN_RUTA');
  const finalizadasHoy = cargasHoy.filter((c) => c.estado === 'FINALIZADA');
  const canceladasHoy = cargasHoy.filter((c) => c.estado === 'CANCELADA');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
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
          <h1 className="font-bold text-base sm:text-lg">Patio — Registro</h1>
        </div>
        <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 shrink-0">
          {cargandoAhora.length} en patio • {enRutaHoy.length} en ruta
        </span>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
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

          <form
            onSubmit={iniciarCarga}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
          >
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Unidad y Modelo *
                </label>
                <select
                  required
                  value={unidadId}
                  onChange={(e) => handleSelectUnidad(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-3 text-base bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="">Seleccionar unidad...</option>
                  {unidades.map((u) => {
                    const estaEnRuta = cargasHoy.some(
                      (c) => cargaPerteneceAUnidad(c, u) && c.estado === 'EN_RUTA'
                    );
                    return (
                      <option key={u.id} value={u.id}>
                        {formatearEtiquetaUnidad(u, estaEnRuta)}
                      </option>
                    );
                  })}
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

            {unidadSeleccionada && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="bg-amber-600 text-white p-2 rounded-lg shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900 truncate">
                      {unidadSeleccionada.nombre}
                      {modeloUnidadSeleccionada ? ` — ${modeloUnidadSeleccionada}` : ''}
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      Placas:{' '}
                      <span className="font-semibold">
                        {unidadSeleccionada.placas || 'Sin placas'}
                      </span>
                      {!modeloUnidadSeleccionada && (
                        <span className="text-amber-700">
                          {' '}
                          • (Sin modelo capturado en Control de Flota)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Destino / Ruta *
              </label>
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
              cargandoAhora.map((carga) => {
                const modeloUnidad = resolverModeloDeCarga(carga);
                return (
                  <div
                    key={carga.id}
                    className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-l-amber-500 border border-slate-200 space-y-4"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-lg text-slate-900">
                            {carga.unidadNombre}
                            {modeloUnidad ? ` — ${modeloUnidad}` : ''}
                          </span>
                          <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            Vuelta #{carga.vuelta}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 font-medium mt-0.5">
                          Chofer: <span className="text-slate-900">{carga.choferNombre}</span>
                        </p>

                        {editandoDestinoId === carga.id ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <input
                              type="text"
                              value={nuevoDestino}
                              onChange={(e) => setNuevoDestino(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  guardarDestino(carga.id);
                                }
                              }}
                              className="flex-1 text-sm rounded-lg border border-amber-400 px-2.5 py-1.5 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => guardarDestino(carga.id)}
                              className="bg-emerald-600 text-white p-1.5 rounded-lg hover:bg-emerald-500"
                              title="Guardar destino"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoDestinoId(null)}
                              className="bg-slate-200 text-slate-700 p-1.5 rounded-lg hover:bg-slate-300"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-slate-600 font-medium">
                              Destino: <span className="text-slate-900">{carga.destino}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => iniciarEdicionDestino(carga)}
                              className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 font-semibold"
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </button>
                          </div>
                        )}
                      </div>

                      <span className="text-xs text-slate-500 shrink-0">
                        Inicio:{' '}
                        {carga.horaInicio
                          ? new Date(carga.horaInicio).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '--:--'}
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
                            className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md"
                          >
                            {r}
                            <button
                              type="button"
                              onClick={() => quitarRemisionDeCarga(carga, r)}
                              title={`Quitar ${r}`}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
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
                              agregarRemisionACarga(carga);
                            }
                          }}
                          className="flex-1 text-sm rounded-lg border border-slate-300 px-3 py-2 uppercase outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => agregarRemisionACarga(carga)}
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
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-base text-slate-800 px-1">
              3. En Ruta Hoy ({enRutaHoy.length})
            </h2>

            {enRutaHoy.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-dashed border-slate-300">
                No hay unidades en ruta en este momento.
              </div>
            ) : (
              enRutaHoy.map((carga) => {
                const modeloUnidad = resolverModeloDeCarga(carga);
                return (
                  <div
                    key={carga.id}
                    className="bg-white rounded-2xl p-5 shadow-sm border-l-4 border-l-emerald-500 border border-slate-200 space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-lg text-slate-900">
                            {carga.unidadNombre}
                            {modeloUnidad ? ` — ${modeloUnidad}` : ''}
                          </span>
                          <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                            Vuelta #{carga.vuelta || 1}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 font-medium mt-0.5">
                          Chofer: <span className="text-slate-900">{carga.choferNombre}</span>
                        </p>

                        {editandoDestinoId === carga.id ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <input
                              type="text"
                              value={nuevoDestino}
                              onChange={(e) => setNuevoDestino(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  guardarDestino(carga.id);
                                }
                              }}
                              className="flex-1 text-sm rounded-lg border border-emerald-400 px-2.5 py-1.5 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => guardarDestino(carga.id)}
                              className="bg-emerald-600 text-white p-1.5 rounded-lg hover:bg-emerald-500"
                              title="Guardar destino"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoDestinoId(null)}
                              className="bg-slate-200 text-slate-700 p-1.5 rounded-lg hover:bg-slate-300"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-slate-600 font-medium">
                              Destino: <span className="text-slate-900">{carga.destino}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => iniciarEdicionDestino(carga)}
                              className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 font-semibold"
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="text-right text-xs text-slate-500 shrink-0">
                        <div>
                          Cargó:{' '}
                          {carga.horaInicio
                            ? new Date(carga.horaInicio).toLocaleTimeString('es-MX', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '--:--'}
                        </div>
                        <div className="text-emerald-700 font-bold">
                          Salió:{' '}
                          {carga.horaSalida
                            ? new Date(carga.horaSalida).toLocaleTimeString('es-MX', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '--:--'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {carga.remisiones.map((r: string) => (
                          <span
                            key={r}
                            className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md"
                          >
                            {r}
                            <button
                              type="button"
                              onClick={() => quitarRemisionDeCarga(carga, r)}
                              title={`Quitar ${r}`}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          placeholder="+ Añadir remisión olvidada..."
                          value={extraRemision[carga.id] || ''}
                          onChange={(e) =>
                            setExtraRemision({ ...extraRemision, [carga.id]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              agregarRemisionACarga(carga);
                            }
                          }}
                          className="flex-1 text-sm rounded-lg border border-slate-300 px-3 py-2 uppercase outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => agregarRemisionACarga(carga)}
                          className="text-xs font-bold bg-slate-200 hover:bg-slate-300 px-3 py-2 rounded-lg"
                        >
                          Sumar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => finalizarRuta(carga.id)}
                        disabled={finalizandoId === carga.id}
                        className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm transition"
                      >
                        <Flag className="w-4 h-4" />
                        {finalizandoId === carga.id ? 'Finalizando...' : 'Finalizar Ruta'}
                      </button>

                      <button
                        type="button"
                        onClick={() => abrirModalCancelacion(carga)}
                        disabled={cancelandoId === carga.id}
                        className="w-full bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 border border-red-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition"
                      >
                        <Ban className="w-4 h-4" />
                        {cancelandoId === carga.id ? 'Cancelando...' : 'Cancelar Salida'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setMostrarFinalizadas(!mostrarFinalizadas)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-sky-600" />
                <span className="font-bold text-sm text-slate-700">
                  Rutas Finalizadas Hoy ({finalizadasHoy.length})
                </span>
              </div>
              {mostrarFinalizadas ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {mostrarFinalizadas && (
              <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-3">
                {finalizadasHoy.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    Aún no hay rutas finalizadas hoy.
                  </p>
                ) : (
                  finalizadasHoy.map((carga) => {
                    const modeloUnidad = resolverModeloDeCarga(carga);
                    return (
                      <div
                        key={carga.id}
                        className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3.5 space-y-2.5 text-sm"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="font-bold text-slate-800">
                              {carga.unidadNombre}
                              {modeloUnidad ? ` — ${modeloUnidad}` : ''}
                            </span>{' '}
                            <span className="text-xs text-slate-500">
                              - Vuelta #{carga.vuelta || 1} • {carga.choferNombre}
                            </span>
                            <div className="text-xs text-slate-600">
                              Ruta / Destino: {carga.destino}
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-sky-700 shrink-0">
                            Regresó{' '}
                            {carga.horaRegreso
                              ? new Date(carga.horaRegreso).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>

                        {carga.remisiones.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {carga.remisiones.map((r: string) => (
                              <span
                                key={r}
                                className="text-xs bg-white border border-sky-200 text-slate-700 px-2 py-0.5 rounded font-medium"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => retomarRuta(carga.id)}
                          disabled={retomandoId === carga.id}
                          className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs shadow-sm transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {retomandoId === carga.id ? 'Retomando...' : 'Retomar Ruta'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setMostrarCanceladas(!mostrarCanceladas)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="font-bold text-sm text-slate-700">
                  Historial de Cancelaciones Hoy ({canceladasHoy.length})
                </span>
              </div>
              {mostrarCanceladas ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {mostrarCanceladas && (
              <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-3">
                {canceladasHoy.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No hay salidas canceladas hoy.
                  </p>
                ) : (
                  canceladasHoy.map((carga) => {
                    const modeloUnidad = resolverModeloDeCarga(carga);
                    return (
                      <div
                        key={carga.id}
                        className="bg-red-50/50 border border-red-200/80 rounded-xl p-3.5 space-y-1.5 text-sm"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="font-bold text-slate-800">
                              {carga.unidadNombre}
                              {modeloUnidad ? ` — ${modeloUnidad}` : ''}
                            </span>{' '}
                            <span className="text-xs text-slate-500">
                              - Vuelta #{carga.vuelta || 1} • {carga.choferNombre}
                            </span>
                            <div className="text-xs text-slate-600">Destino: {carga.destino}</div>
                          </div>
                          <span className="text-xs font-semibold text-red-700 shrink-0">
                            Cancelada{' '}
                            {carga.horaCancelacion
                              ? new Date(carga.horaCancelacion).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>

                        {carga.motivoCancelacion && (
                          <p className="text-xs text-red-800 bg-red-100/70 rounded-lg px-2.5 py-1">
                            Motivo: {carga.motivoCancelacion}
                          </p>
                        )}

                        {carga.remisiones.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {carga.remisiones.map((r: string) => (
                              <span
                                key={r}
                                className="text-xs bg-white border border-red-200 text-slate-700 px-2 py-0.5 rounded"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 lg:sticky lg:top-20">
          <PanelAvisos variante="patio" />
        </aside>
      </div>

      {cargaEnRutaPorFinalizar && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center gap-3">
              <div className="bg-sky-500/20 border border-sky-400/40 text-sky-300 p-2 rounded-xl">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">Esta unidad está en ruta</h3>
                <p className="text-xs text-slate-300">
                  {cargaEnRutaPorFinalizar.unidadNombre}
                  {resolverModeloDeCarga(cargaEnRutaPorFinalizar)
                    ? ` — ${resolverModeloDeCarga(cargaEnRutaPorFinalizar)}`
                    : ''}{' '}
                  • Vuelta #{cargaEnRutaPorFinalizar.vuelta || 1}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900 text-sm">
                  Esta unidad está en ruta, ¿deseas finalizar?
                </p>
                <p>
                  Ruta actual:{' '}
                  <span className="font-semibold">{cargaEnRutaPorFinalizar.destino}</span> •
                  Chofer:{' '}
                  <span className="font-semibold">{cargaEnRutaPorFinalizar.choferNombre}</span>
                </p>
                {cargaEnRutaPorFinalizar.remisiones.length > 0 && (
                  <p className="text-slate-500">
                    Folios: {cargaEnRutaPorFinalizar.remisiones.join(', ')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={rechazarFinalizarDesdeSelector}
                  disabled={Boolean(finalizandoId)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={confirmarFinalizarDesdeSelector}
                  disabled={Boolean(finalizandoId)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white shadow-sm flex items-center justify-center gap-1.5 transition"
                >
                  <Flag className="w-4 h-4" />
                  {finalizandoId ? 'Finalizando...' : 'Sí, finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cargaACancelar && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center p-4">
          <form
            onSubmit={confirmarCancelacionSalida}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo-bravo.png"
                  alt="Logo Bravo"
                  className="w-8 h-8 rounded-lg object-contain bg-slate-800 p-1"
                />
                <div>
                  <h3 className="font-bold text-base leading-tight">Cancelar Salida a Ruta</h3>
                  <p className="text-xs text-slate-300">
                    {cargaACancelar.unidadNombre}
                    {resolverModeloDeCarga(cargaACancelar)
                      ? ` — ${resolverModeloDeCarga(cargaACancelar)}`
                      : ''}{' '}
                    • Vuelta #{cargaACancelar.vuelta || 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModalCancelacion}
                disabled={Boolean(cancelandoId)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 space-y-1">
                <p className="font-bold">¿Confirmas cancelar esta salida?</p>
                <p className="text-red-800">
                  Chofer: <span className="font-semibold">{cargaACancelar.choferNombre}</span> •
                  Destino: <span className="font-semibold">{cargaACancelar.destino}</span>. Saldrá
                  del Monitor, pero quedará en el historial.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Motivo de cancelación (opcional)
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ej. Error de remisión, cambio de unidad..."
                  value={motivoCancelacion}
                  onChange={(e) => setMotivoCancelacion(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={cerrarModalCancelacion}
                  disabled={Boolean(cancelandoId)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={Boolean(cancelandoId)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white shadow-sm inline-flex items-center gap-1.5 transition"
                >
                  <Ban className="w-4 h-4" />
                  {cancelandoId ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <DesbloqueoAudioModal
        titulo="Control de Patio"
        subtitulo="Confirma tu ingreso para sincronizar registros y alertas de salida en tiempo real."
        textoBoton="Iniciar Operación"
        onDesbloquear={desbloquearAudios}
      />
    </div>
  );
}