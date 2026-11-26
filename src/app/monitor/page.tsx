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
  Timer,
  FileCheck2,
  AlertTriangle,
  Activity,
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

function obtenerMinutosDiferencia(desdeIso?: string | null, hastaIso?: string | null): number | null {
  if (!desdeIso) return null;
  const inicio = new Date(desdeIso).getTime();
  const fin = hastaIso ? new Date(hastaIso).getTime() : Date.now();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
  return Math.max(0, Math.floor((fin - inicio) / 60000));
}

function formatearDuracion(minutos: number | null) {
  if (minutos === null) return null;
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${horas}h ${mins}m`;
}

export default function MonitorPage() {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [hoy, setHoy] = useState('');
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [horaActual, setHoraActual] = useState('');
  const [, setTick] = useState(0);

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
      setTick((t) => (t + 1) % 60);
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

  // --- Cálculo de KPIs operativos del día (sin redundancia con los conteos de columnas) ---
  const activasHoy = cargas.filter((c) => c.estado !== 'CANCELADA');
  const todasCargando = activasHoy.filter((c) => c.estado === 'CARGANDO');
  const todasEnRuta = activasHoy.filter((c) => c.estado === 'EN_RUTA');

  // 1. Tiempo promedio de carga (de las que ya salieron hoy)
  const tiemposCarga = todasEnRuta
    .map((c) => obtenerMinutosDiferencia(c.horaInicio, c.horaSalida))
    .filter((m): m is number => m !== null);
  const promedioCargaMin =
    tiemposCarga.length > 0
      ? Math.round(tiemposCarga.reduce((acc, val) => acc + val, 0) / tiemposCarga.length)
      : null;

  // 2. Remisiones despachadas vs pendientes en patio
  const remisionesDespachadas = todasEnRuta.reduce((acc, c) => acc + c.remisiones.length, 0);
  const remisionesEnPatio = todasCargando.reduce((acc, c) => acc + c.remisiones.length, 0);

  // 3. Unidad con mayor tiempo de espera en patio
  interface UnidadDemorada {
    nombre: string;
    minutos: number;
  }

  const unidadMasDemorada: UnidadDemorada | null = todasCargando.reduce<UnidadDemorada | null>(
    (max, c) => {
      const mins = obtenerMinutosDiferencia(c.horaInicio);
      if (mins === null) return max;
      if (!max || mins > max.minutos) {
        return { nombre: c.unidadNombre, minutos: mins };
      }
      return max;
    },
    null
  );

  // 4. Última salida registrada
  const salidasOrdenadas = [...todasEnRuta]
    .filter((c) => Boolean(c.horaSalida))
    .sort((a, b) => (b.horaSalida || '').localeCompare(a.horaSalida || ''));
  const ultimaSalida = salidasOrdenadas[0] || null;
  const haceUltimaSalidaMin = ultimaSalida ? obtenerMinutosDiferencia(ultimaSalida.horaSalida) : null;

  // --- Filtrado por búsqueda ---
  const texto = busqueda.trim().toLowerCase();

  const cargasFiltradas = activasHoy.filter((c) => {
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

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Tira compacta de 4 KPIs operativos */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Tiempo promedio de carga */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Timer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tiempo Prom. Carga
              </p>
              <p className="text-lg font-bold text-white truncate">
                {promedioCargaMin !== null ? formatearDuracion(promedioCargaMin) : 'Sin salidas'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {tiemposCarga.length > 0
                  ? `Basado en ${tiemposCarga.length} ${tiemposCarga.length === 1 ? 'salida' : 'salidas'}`
                  : 'Esperando primer despacho'}
              </p>
            </div>
          </div>

          {/* KPI 2: Remisiones despachadas */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Remisiones en Ruta
              </p>
              <p className="text-lg font-bold text-white truncate">{remisionesDespachadas}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {remisionesEnPatio > 0
                  ? `+ ${remisionesEnPatio} cargándose en patio`
                  : '0 pendientes en patio'}
              </p>
            </div>
          </div>

          {/* KPI 3: Mayor espera en patio */}
          <div
            className={`border rounded-2xl px-4 py-3.5 flex items-center gap-3.5 transition ${
              unidadMasDemorada && unidadMasDemorada.minutos >= 45
                ? 'bg-amber-950/30 border-amber-500/40'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                unidadMasDemorada && unidadMasDemorada.minutos >= 45
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Mayor Espera en Patio
              </p>
              <p className="text-lg font-bold text-white truncate">
                {unidadMasDemorada ? formatearDuracion(unidadMasDemorada.minutos) : 'Patio libre'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {unidadMasDemorada ? unidadMasDemorada.nombre : 'Ninguna unidad esperando'}
              </p>
            </div>
          </div>

          {/* KPI 4: Última salida */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Última Salida
              </p>
              <p className="text-lg font-bold text-white truncate">
                {ultimaSalida
                  ? haceUltimaSalidaMin === 0
                    ? 'Justo ahora'
                    : `Hace ${formatearDuracion(haceUltimaSalidaMin)}`
                  : 'Sin salidas hoy'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {ultimaSalida
                  ? `${ultimaSalida.unidadNombre} (${formatearHoraLocal(ultimaSalida.horaSalida)})`
                  : 'Aún no sale ninguna unidad'}
              </p>
            </div>
          </div>
        </section>

        {/* Columnas principales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  const espera = formatearDuracion(obtenerMinutosDiferencia(c.horaInicio));
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
                  const duracionCarga = formatearDuracion(
                    obtenerMinutosDiferencia(c.horaInicio, c.horaSalida)
                  );
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
        </div>
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