'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { db, Carga } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import { DesbloqueoAudioModal } from '@/components/DesbloqueoAudioModal';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  Search,
  Truck,
  CheckCircle,
  Clock,
  Settings,
  Radio,
  Download,
  Home,
} from 'lucide-react';

function formatearHoraLocal(iso?: string | null) {
  if (!iso) return '--:--';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '--:--';
  return fecha.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calcularMinutosTranscurridos(desdeIso?: string | null, hastaIso?: string | null) {
  if (!desdeIso) return null;
  const inicio = new Date(desdeIso).getTime();
  const fin = hastaIso ? new Date(hastaIso).getTime() : Date.now();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
  const diffMin = Math.max(0, Math.floor((fin - inicio) / 60000));
  if (diffMin < 60) return `${diffMin} min`;
  const horas = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${horas}h ${mins}m`;
}

export default function MonitorPage() {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [horaActual, setHoraActual] = useState('');

  const audioCargandoRef = useRef<HTMLAudioElement | null>(null);
  const audioSalidaRef = useRef<HTMLAudioElement | null>(null);
  const estadosPreviosRef = useRef<Record<string, Carga['estado']>>({});
  const cargaInicialRef = useRef<boolean>(true);

  useEffect(() => {
    audioCargandoRef.current = new Audio('/sonido-cargando.mp3');
    audioSalidaRef.current = new Audio('/sonido-salida.mp3');
  }, []);

  const desbloquearAudios = () => {
    [audioCargandoRef.current, audioSalidaRef.current].forEach((audio) => {
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
    });
  };

  const reproducirTono = (tipo: 'CARGANDO' | 'SALIDA') => {
    const audio = tipo === 'CARGANDO' ? audioCargandoRef.current : audioSalidaRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const actualizarHora = () => {
      setHoraActual(
        new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);
    actualizarHora();

    const reloj = setInterval(actualizarHora, 1000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    if (!hoy) return;

    cargaInicialRef.current = true;
    if (estadosPreviosRef && typeof estadosPreviosRef === 'object') {
      estadosPreviosRef.current = {};
    }

    const q = query(collection(db, 'cargas'), where('fechaOperacion', '==', hoy));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Carga));
      list.sort((a, b) => b.horaInicio.localeCompare(a.horaInicio));

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

        list.forEach((c) => {
          const previo = mapaActual[c.id];
          if (!previo && c.estado === 'CARGANDO') {
            huboNuevaCarga = true;
          } else if (previo && previo !== 'EN_RUTA' && c.estado === 'EN_RUTA') {
            huboNuevaSalida = true;
          }
        });

        const siguienteMapa: Record<string, Carga['estado']> = {};
        list.forEach((c) => {
          siguienteMapa[c.id] = c.estado;
        });
        if (estadosPreviosRef && typeof estadosPreviosRef === 'object') {
          estadosPreviosRef.current = siguienteMapa;
        }

        if (huboNuevaSalida) {
          reproducirTono('SALIDA');
        } else if (huboNuevaCarga) {
          reproducirTono('CARGANDO');
        }
      }

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

  const texto = busqueda.trim().toLowerCase();

  const cargasFiltradas = cargas.filter((c) => {
    if (c.estado === 'CANCELADA') return false;
    if (!texto) return true;
    const matchUnidad = c.unidadNombre.toLowerCase().includes(texto);
    const matchChofer = c.choferNombre.toLowerCase().includes(texto);
    const matchDestino = c.destino.toLowerCase().includes(texto);
    const matchRemision = c.remisiones.some((r) => r.toLowerCase().includes(texto));
    return matchUnidad || matchChofer || matchDestino || matchRemision;
  });

  const cargando = cargasFiltradas.filter((c) => c.estado === 'CARGANDO');
  const enRuta = cargasFiltradas.filter((c) => c.estado === 'EN_RUTA');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            title="Volver al menú principal"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl text-slate-200 transition"
          >
            <Home className="w-5 h-5" />
          </Link>

          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-10 h-10 rounded-xl object-contain bg-slate-950 p-1 border border-slate-700"
          />

          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h1 className="text-xl font-bold tracking-tight">Monitor de Cargas y Rutas</h1>
            </div>
            <p className="text-xs text-slate-400">
              {hoy || 'Cargando fecha...'}
              {horaActual ? ` • Hora local: ${horaActual}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl justify-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar remisión, unidad, chofer..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5">
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
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              {descargando ? 'Bajando...' : 'CSV'}
            </button>
          </div>

          <Link
            href="/catalogos"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold transition"
          >
            <Settings className="w-4 h-4" /> Catálogos
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <h2 className="text-lg font-bold text-amber-400">Cargando en Patio</h2>
            </div>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm font-bold px-3 py-0.5 rounded-full">
              {cargando.length}
            </span>
          </div>

          {cargando.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Sin unidades cargando en este momento
            </div>
          ) : (
            <div className="space-y-3">
              {cargando.map((c) => {
                const espera = calcularMinutosTranscurridos(c.horaInicio);
                return (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 border-l-4 border-l-amber-400 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-white">{c.unidadNombre}</span>
                          <span className="text-xs font-bold bg-slate-800 text-amber-300 px-2 py-0.5 rounded">
                            Vuelta #{c.vuelta}
                          </span>
                        </div>
                        <div className="text-sm text-slate-300 mt-0.5">
                          Chofer: <span className="font-semibold text-white">{c.choferNombre}</span> •
                          Destino: <span className="font-semibold text-amber-300">{c.destino}</span>
                        </div>
                      </div>

                      <div className="text-right text-xs text-slate-400 shrink-0">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Inicio: {formatearHoraLocal(c.horaInicio)}</span>
                        </div>
                        {espera && (
                          <div className="text-[11px] text-amber-300/90 mt-0.5">
                            En patio: {espera}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-400 mb-1.5">
                        Remisiones ({c.remisiones.length}):
                      </div>
                      {c.remisiones.length === 0 ? (
                        <span className="text-xs italic text-slate-500">
                          Aún sin remisiones capturadas
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {c.remisiones.map((r) => {
                            const coincide = texto && r.toLowerCase().includes(texto);
                            return (
                              <span
                                key={r}
                                className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                                  coincide
                                    ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50'
                                    : 'bg-slate-800 text-slate-100 border-slate-700'
                                }`}
                              >
                                {r}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-emerald-400">En Ruta Hoy</h2>
            </div>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-sm font-bold px-3 py-0.5 rounded-full">
              {enRuta.length}
            </span>
          </div>

          {enRuta.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Aún no hay unidades en ruta hoy
            </div>
          ) : (
            <div className="space-y-3">
              {enRuta.map((c) => {
                const duracionCarga = calcularMinutosTranscurridos(c.horaInicio, c.horaSalida);
                return (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 border-l-4 border-l-emerald-500 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-emerald-400" />
                          <span className="text-lg font-bold text-white">{c.unidadNombre}</span>
                          <span className="text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                            Vuelta #{c.vuelta}
                          </span>
                        </div>
                        <div className="text-sm text-slate-300 mt-0.5">
                          Chofer: <span className="font-semibold text-white">{c.choferNombre}</span> •
                          Destino: <span className="font-semibold text-emerald-300">{c.destino}</span>
                        </div>
                      </div>

                      <div className="text-right text-xs shrink-0 space-y-0.5">
                        <div className="text-slate-400">
                          Cargó: {formatearHoraLocal(c.horaInicio)}
                        </div>
                        <div className="text-emerald-400 font-bold">
                          Salió: {formatearHoraLocal(c.horaSalida)}
                        </div>
                        {duracionCarga && (
                          <div className="text-[11px] text-slate-400">Carga: {duracionCarga}</div>
                        )}
                      </div>
                    </div>

                    {c.remisiones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.remisiones.map((r) => {
                          const coincide = texto && r.toLowerCase().includes(texto);
                          return (
                            <span
                              key={r}
                              className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                                coincide
                                  ? 'bg-emerald-400 text-slate-950 border-emerald-300 ring-2 ring-emerald-400/50'
                                  : 'bg-slate-800 text-slate-200 border-slate-700'
                              }`}
                            >
                              {r}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <DesbloqueoAudioModal
        titulo="Monitor de Operaciones"
        subtitulo="Conecta la sesión en tiempo real para recibir alertas visuales y sonoras de patio."
        textoBoton="Conectar Tablero en Vivo"
        onDesbloquear={desbloquearAudios}
      />
    </div>
  );
}