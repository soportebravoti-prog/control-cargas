'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { db, coleccion, Carga } from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import { DesbloqueoAudioModal } from '@/components/DesbloqueoAudioModal';
import { PanelAvisos } from '@/components/PanelAvisos';
import ProteccionModulo from '@/components/ProteccionModulo';
import BarraSesionModulo from '@/components/BarraSesionModulo';
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
  Flag,
  CalendarSync,
} from 'lucide-react';

interface UnidadDemorada {
  nombre: string;
  minutos: number;
}

interface ChoferMonitor {
  id: string;
  nombre?: string;
  licencia?: string;
  licenciaUrl?: string;
  fotoLicencia?: string;
  numeroLicencia?: string;
  folioLicencia?: string;
  vigenciaLicencia?: string;
  fechaVencimientoLicencia?: string;
  licenciaVencida?: boolean;
  tieneLicencia?: boolean;
}

type CargaExtendida = Carga & {
  choferId?: string;
};

function obtenerFechaLocalIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

function normalizarTexto(txt?: string | null): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function choferSinLicenciaRegistrada(ch?: ChoferMonitor | null): boolean {
  if (!ch) return true;
  if (ch.tieneLicencia === false || ch.licenciaVencida === true) return true;

  const tieneDatoLicencia = Boolean(
    (ch.licencia && String(ch.licencia).trim()) ||
      (ch.licenciaUrl && String(ch.licenciaUrl).trim()) ||
      (ch.fotoLicencia && String(ch.fotoLicencia).trim()) ||
      (ch.numeroLicencia && String(ch.numeroLicencia).trim()) ||
      (ch.folioLicencia && String(ch.folioLicencia).trim()) ||
      (ch.vigenciaLicencia && String(ch.vigenciaLicencia).trim()) ||
      (ch.fechaVencimientoLicencia && String(ch.fechaVencimientoLicencia).trim())
  );

  if (!tieneDatoLicencia) return true;

  const fechaVigencia = ch.fechaVencimientoLicencia || ch.vigenciaLicencia;
  if (fechaVigencia) {
    const parsed = Date.parse(fechaVigencia);
    if (!Number.isNaN(parsed)) {
      const hoyFin = new Date();
      hoyFin.setHours(0, 0, 0, 0);
      if (parsed < hoyFin.getTime()) return true;
    }
  }

  return false;
}

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

function MonitorContenido() {
  const [cargas, setCargas] = useState<CargaExtendida[]>([]);
  const [choferes, setChoferes] = useState<ChoferMonitor[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [hoy, setHoy] = useState('');
  const [fechaConsulta, setFechaConsulta] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [horaActual, setHoraActual] = useState('');
  const [, setTick] = useState(0);

  const hoyRef = useRef<string>('');
  const fechaConsultaRef = useRef<string>('');
  const audioCargandoRef = useRef<HTMLAudioElement | null>(null);
  const audioSalidaRef = useRef<HTMLAudioElement | null>(null);
  const audioFinalizadoRef = useRef<HTMLAudioElement | null>(null);
  const estadosPreviosRef = useRef<Record<string, Carga['estado']>>({});
  const cargaInicialRef = useRef<boolean>(true);

  useEffect(() => {
    hoyRef.current = hoy;
  }, [hoy]);

  useEffect(() => {
    fechaConsultaRef.current = fechaConsulta;
  }, [fechaConsulta]);

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
    const src =
      tipo === 'FINALIZADA'
        ? '/sonido-finalizado.mp3'
        : tipo === 'SALIDA'
        ? '/sonido-salida.mp3'
        : '/sonido-cargando.mp3';
    const audio =
      tipo === 'FINALIZADA'
        ? audioFinalizadoRef.current
        : tipo === 'SALIDA'
        ? audioSalidaRef.current
        : audioCargandoRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(() => {
      const respaldo = new Audio(src);
      respaldo.volume = 1;
      respaldo.play().catch(() => {});
    });
  };

  useEffect(() => {
    const fechaInicial = obtenerFechaLocalIso();
    setHoy(fechaInicial);
    setFechaConsulta(fechaInicial);
    hoyRef.current = fechaInicial;
    fechaConsultaRef.current = fechaInicial;

    const actualizarRelojYDia = () => {
      const ahora = new Date();
      setHoraActual(
        ahora.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );

      const fechaCalendario = ahora.toLocaleDateString('en-CA');
      if (hoyRef.current && fechaCalendario !== hoyRef.current) {
        const diaAnterior = hoyRef.current;
        hoyRef.current = fechaCalendario;
        setHoy(fechaCalendario);

        // Reinicia el tablero al cambiar de día para arrancar limpio el nuevo día operativo
        estadosPreviosRef.current = {};
        cargaInicialRef.current = true;
        setCargas([]);

        if (!fechaConsultaRef.current || fechaConsultaRef.current === diaAnterior) {
          fechaConsultaRef.current = fechaCalendario;
          setFechaConsulta(fechaCalendario);
        }
      }

      setTick((t) => (t + 1) % 60);
    };

    actualizarRelojYDia();
    const reloj = setInterval(actualizarRelojYDia, 1000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    const unsubChoferes = onSnapshot(collection(db, coleccion('choferes')), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChoferMonitor));
      setChoferes(lista);
    });
    return () => unsubChoferes();
  }, []);

  useEffect(() => {
    if (!fechaConsulta) return;

    const esDiaEnVivo = fechaConsulta === hoy;
    cargaInicialRef.current = true;
    estadosPreviosRef.current = {};

    const q = query(
      collection(db, coleccion('cargas')),
      where('fechaOperacion', '==', fechaConsulta)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CargaExtendida));
      list.sort((a, b) => (b.horaInicio || '').localeCompare(a.horaInicio || ''));

      const mapaActual = estadosPreviosRef.current || {};

      if (cargaInicialRef.current || !esDiaEnVivo) {
        const snapshotInicial: Record<string, Carga['estado']> = {};
        list.forEach((c) => {
          snapshotInicial[c.id] = c.estado;
        });
        estadosPreviosRef.current = snapshotInicial;
        cargaInicialRef.current = false;
      } else {
        let huboNuevaCarga = false;
        let huboNuevaSalida = false;
        let huboFinalizacion = false;

        list.forEach((c) => {
          const previo = mapaActual[c.id];
          if (!previo && c.estado === 'CARGANDO') {
            huboNuevaCarga = true;
          } else if ((!previo || previo !== 'EN_RUTA') && c.estado === 'EN_RUTA') {
            huboNuevaSalida = true;
          } else if (previo && previo !== 'FINALIZADA' && c.estado === 'FINALIZADA') {
            huboFinalizacion = true;
          }
        });

        const siguienteMapa: Record<string, Carga['estado']> = {};
        list.forEach((c) => {
          siguienteMapa[c.id] = c.estado;
        });
        estadosPreviosRef.current = siguienteMapa;

        if (huboFinalizacion) {
          reproducirTono('FINALIZADA');
        } else if (huboNuevaSalida) {
          reproducirTono('SALIDA');
        } else if (huboNuevaCarga) {
          reproducirTono('CARGANDO');
        }
      }

      setCargas(list);
    });

    return () => unsub();
  }, [fechaConsulta, hoy]);

  const buscarChoferDeCarga = (carga: CargaExtendida): ChoferMonitor | undefined => {
    if (carga.choferId) {
      const porId = choferes.find((ch) => ch.id === carga.choferId);
      if (porId) return porId;
    }
    const nombreCarga = normalizarTexto(carga.choferNombre);
    if (!nombreCarga) return undefined;
    return choferes.find((ch) => normalizarTexto(ch.nombre) === nombreCarga);
  };

  const handleDescargar = async () => {
    if (!fechaConsulta || descargando) return;
    setDescargando(true);
    await descargarCargasCSV(fechaConsulta);
    setDescargando(false);
  };

  const esHoyConsultado = Boolean(hoy && fechaConsulta === hoy);

  // --- Cálculo de KPIs operativos de la fecha consultada ---
  const activasDia = cargas.filter((c) => c.estado !== 'CANCELADA');
  const todasCargando = activasDia.filter((c) => c.estado === 'CARGANDO');
  const todasDespachadas = activasDia.filter(
    (c) => c.estado === 'EN_RUTA' || c.estado === 'FINALIZADA'
  );

  const tiemposCarga = todasDespachadas
    .map((c) => obtenerMinutosDiferencia(c.horaInicio, c.horaSalida))
    .filter((m): m is number => m !== null);
  const promedioCargaMin =
    tiemposCarga.length > 0
      ? Math.round(tiemposCarga.reduce((acc, val) => acc + val, 0) / tiemposCarga.length)
      : null;

  const remisionesDespachadas = todasDespachadas.reduce((acc, c) => acc + c.remisiones.length, 0);
  const remisionesEnPatio = todasCargando.reduce((acc, c) => acc + c.remisiones.length, 0);

  const unidadMasDemorada: UnidadDemorada | null = todasCargando.reduce<UnidadDemorada | null>(
    (max, c) => {
      const finRef = esHoyConsultado ? undefined : c.horaSalida || c.horaRegreso || c.horaInicio;
      const mins = obtenerMinutosDiferencia(c.horaInicio, finRef);
      if (mins === null) return max;
      if (!max || mins > max.minutos) {
        return { nombre: c.unidadNombre, minutos: mins };
      }
      return max;
    },
    null
  );

  const salidasOrdenadas = [...todasDespachadas]
    .filter((c) => Boolean(c.horaSalida))
    .sort((a, b) => (b.horaSalida || '').localeCompare(a.horaSalida || ''));
  const ultimaSalida = salidasOrdenadas[0] || null;
  const haceUltimaSalidaMin =
    ultimaSalida && esHoyConsultado
      ? obtenerMinutosDiferencia(ultimaSalida.horaSalida)
      : null;

  // --- Filtrado por búsqueda ---
  const texto = busqueda.trim().toLowerCase();

  const cargasFiltradas = activasDia.filter((c) => {
    if (!texto) return true;
    const matchUnidad = c.unidadNombre.toLowerCase().includes(texto);
    const matchChofer = c.choferNombre.toLowerCase().includes(texto);
    const matchDestino = c.destino.toLowerCase().includes(texto);
    const matchRemision = c.remisiones.some((r) => r.toLowerCase().includes(texto));
    return matchUnidad || matchChofer || matchDestino || matchRemision;
  });

  const cargando = cargasFiltradas.filter((c) => c.estado === 'CARGANDO');
  const enRuta = cargasFiltradas.filter((c) => c.estado === 'EN_RUTA');
  const finalizadas = cargasFiltradas
    .filter((c) => c.estado === 'FINALIZADA')
    .sort((a, b) => (b.horaRegreso || b.horaInicio).localeCompare(a.horaRegreso || a.horaInicio));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-10">
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
            <div className="flex items-center gap-2 flex-wrap">
              <Radio
                className={`w-4 h-4 ${
                  esHoyConsultado ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <h1 className="text-xl font-bold tracking-tight">Monitor de Cargas y Rutas</h1>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  esHoyConsultado
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                }`}
              >
                {esHoyConsultado ? 'En vivo • Hoy' : `Histórico • ${fechaConsulta}`}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Operación: {hoy || 'Cargando fecha...'} • Viendo: {fechaConsulta || '---'}
              {horaActual ? ` • Hora local: ${horaActual}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-4xl justify-end">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
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
              value={fechaConsulta}
              onChange={(e) => {
                if (e.target.value) setFechaConsulta(e.target.value);
              }}
              className="bg-transparent text-xs text-slate-200 outline-none"
            />
            {!esHoyConsultado && hoy && (
              <button
                type="button"
                onClick={() => setFechaConsulta(hoy)}
                title="Volver al día de hoy en vivo"
                className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 text-white px-2 py-1.5 rounded-lg text-xs font-semibold transition"
              >
                <CalendarSync className="w-3.5 h-3.5" />
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={handleDescargar}
              disabled={!fechaConsulta || descargando}
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

          <BarraSesionModulo />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Remisiones Despachadas
              </p>
              <p className="text-lg font-bold text-white truncate">{remisionesDespachadas}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {remisionesEnPatio > 0
                  ? `+ ${remisionesEnPatio} cargándose en patio`
                  : '0 pendientes en patio'}
              </p>
            </div>
          </div>

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
                  ? esHoyConsultado && haceUltimaSalidaMin !== null
                    ? haceUltimaSalidaMin === 0
                      ? 'Justo ahora'
                      : `Hace ${formatearDuracion(haceUltimaSalidaMin)}`
                    : formatearHoraLocal(ultimaSalida.horaSalida)
                  : 'Sin salidas'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {ultimaSalida
                  ? `${ultimaSalida.unidadNombre} (${formatearHoraLocal(ultimaSalida.horaSalida)})`
                  : 'Sin unidades despachadas en la fecha'}
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
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
                Sin unidades cargando en esta fecha
              </div>
            ) : (
              <div className="space-y-3">
                {cargando.map((c) => {
                  const finRef = esHoyConsultado
                    ? undefined
                    : c.horaSalida || c.horaRegreso || c.horaInicio;
                  const espera = formatearDuracion(obtenerMinutosDiferencia(c.horaInicio, finRef));
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

          <section className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-emerald-400">
                  {esHoyConsultado ? 'En Ruta Hoy' : `En Ruta (${fechaConsulta})`}
                </h2>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-sm font-bold px-3 py-0.5 rounded-full">
                {enRuta.length}
              </span>
            </div>

            {enRuta.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Sin unidades en ruta en esta fecha
              </div>
            ) : (
              <div className="space-y-3">
                {enRuta.map((c) => {
                  const duracionCarga = formatearDuracion(
                    obtenerMinutosDiferencia(c.horaInicio, c.horaSalida)
                  );
                  const choferDoc = buscarChoferDeCarga(c);
                  const sinLicencia = choferSinLicenciaRegistrada(choferDoc);

                  return (
                    <div
                      key={c.id}
                      className={`relative overflow-hidden bg-slate-900 border rounded-xl p-4 space-y-3 ${
                        sinLicencia
                          ? 'border-red-500/40 border-l-4 border-l-red-500'
                          : 'border-slate-800 border-l-4 border-l-emerald-500'
                      }`}
                    >
                      {sinLicencia && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-red-500 animate-pulse"
                        />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Truck
                              className={`w-4 h-4 ${
                                sinLicencia ? 'text-red-400' : 'text-emerald-400'
                              }`}
                            />
                            <span className="text-lg font-bold text-white">{c.unidadNombre}</span>
                            <span className="text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                              Vuelta #{c.vuelta}
                            </span>
                          </div>
                          <div className="text-sm text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>
                              Chofer:{' '}
                              <span className="font-semibold text-white">{c.choferNombre}</span>
                            </span>
                            {sinLicencia && (
                              <span className="text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.2 rounded bg-red-500/15 text-red-400 border border-red-500/40 animate-pulse">
                                sin licencia
                              </span>
                            )}
                            <span>
                              - Destino:{' '}
                              <span className="font-semibold text-emerald-300">{c.destino}</span>
                            </span>
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

          <aside className="lg:col-span-3">
            <PanelAvisos variante="monitor" />
          </aside>
        </div>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Flag className="w-5 h-5 text-sky-400" />
              <div>
                <h2 className="text-base font-bold text-sky-300">
                  {esHoyConsultado
                    ? 'Rutas Finalizadas Hoy'
                    : `Rutas Finalizadas (${fechaConsulta})`}
                </h2>
                <p className="text-xs text-slate-400">
                  Unidades que ya concluyeron su recorrido y regresaron a patio
                </p>
              </div>
            </div>
            <span className="bg-sky-500/20 text-sky-300 border border-sky-500/40 text-sm font-bold px-3 py-0.5 rounded-full">
              {finalizadas.length}
            </span>
          </div>

          {finalizadas.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Sin rutas finalizadas en la fecha seleccionada
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {finalizadas.map((c) => {
                const duracionRuta = formatearDuracion(
                  obtenerMinutosDiferencia(c.horaSalida, c.horaRegreso)
                );
                return (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 border-l-4 border-l-sky-500 rounded-xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-base text-white truncate">
                            {c.unidadNombre}
                          </span>
                          <span className="text-[11px] font-bold bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded shrink-0">
                            Vuelta #{c.vuelta}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-sky-400 shrink-0">
                          Regresó: {formatearHoraLocal(c.horaRegreso)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 space-y-0.5">
                        <div>
                          Chofer: <span className="font-semibold text-white">{c.choferNombre}</span>
                        </div>
                        <div>
                          Ruta: <span className="font-semibold text-sky-300">{c.destino}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Cargó {formatearHoraLocal(c.horaInicio)} • Salió{' '}
                          {formatearHoraLocal(c.horaSalida)}
                          {duracionRuta ? ` • Recorrido: ${duracionRuta}` : ''}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">
                        Folios ({c.remisiones.length}):
                      </div>
                      {c.remisiones.length === 0 ? (
                        <span className="text-[11px] italic text-slate-500">Sin folios</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.remisiones.map((r) => {
                            const coincide = texto && r.toLowerCase().includes(texto);
                            return (
                              <span
                                key={r}
                                className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  coincide
                                    ? 'bg-sky-400 text-slate-950 border-sky-300'
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

export default function MonitorPage() {
  return (
    <ProteccionModulo moduloRequerido="monitor">
      <MonitorContenido />
    </ProteccionModulo>
  );
}