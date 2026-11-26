'use client';

import { useEffect, useRef, useState } from 'react';
import { db, Aviso } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Bell, AlertCircle, Plus, X, Check, Clock } from 'lucide-react';

interface PanelAvisosProps {
  variante: 'inicio' | 'patio' | 'monitor';
}

export function PanelAvisos({ variante }: PanelAvisosProps) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [textoNuevo, setTextoNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);

  const audioPublicarRef = useRef<HTMLAudioElement | null>(null);
  const audioFinalizadoRef = useRef<HTMLAudioElement | null>(null);
  const idsActivosPreviosRef = useRef<Set<string>>(new Set());
  const cargaInicialRef = useRef<boolean>(true);

  useEffect(() => {
    audioPublicarRef.current = new Audio('/sonido-publicaraviso.mp3');
    audioFinalizadoRef.current = new Audio('/sonido-finalizado.mp3');
  }, []);

  const reproducirSonido = (tipo: 'PUBLICAR' | 'FINALIZADO') => {
    const audio =
      tipo === 'PUBLICAR' ? audioPublicarRef.current : audioFinalizadoRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    cargaInicialRef.current = true;
    idsActivosPreviosRef.current = new Set();

    const q = query(collection(db, 'avisos'), where('activo', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Aviso));
      lista.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

      const idsActuales = new Set(lista.map((item) => item.id));

      if (cargaInicialRef.current) {
        idsActivosPreviosRef.current = idsActuales;
        cargaInicialRef.current = false;
      } else if (variante === 'monitor') {
        const huboNuevoAviso = lista.some((item) => !idsActivosPreviosRef.current.has(item.id));
        const huboAvisoFinalizado = Array.from(idsActivosPreviosRef.current).some(
          (idPrevio) => !idsActuales.has(idPrevio)
        );

        idsActivosPreviosRef.current = idsActuales;

        if (huboNuevoAviso) {
          reproducirSonido('PUBLICAR');
        } else if (huboAvisoFinalizado) {
          reproducirSonido('FINALIZADO');
        }
      } else {
        idsActivosPreviosRef.current = idsActuales;
      }

      setAvisos(lista);
    });

    return () => unsub();
  }, [variante]);

  const guardarAviso = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = textoNuevo.trim();
    if (!limpio || guardando) return;

    try {
      setGuardando(true);
      const hoy = new Date().toLocaleDateString('en-CA');
      await addDoc(collection(db, 'avisos'), {
        texto: limpio,
        activo: true,
        creadoEn: new Date().toISOString(),
        fechaOperacion: hoy,
      });
      if (variante === 'patio') {
        reproducirSonido('PUBLICAR');
      }
      setTextoNuevo('');
      setModalAbierto(false);
    } finally {
      setGuardando(false);
    }
  };

  const marcarAtendido = async (id: string) => {
    try {
      setCerrandoId(id);
      await updateDoc(doc(db, 'avisos', id), {
        activo: false,
      });
      if (variante === 'patio') {
        reproducirSonido('FINALIZADO');
      }
    } finally {
      setCerrandoId(null);
    }
  };

  const formatearHora = (iso: string) => {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const esHoy = (fechaOp: string) => {
    return fechaOp === new Date().toLocaleDateString('en-CA');
  };

  const titulo =
    variante === 'inicio'
      ? 'Avisos de Seguimiento'
      : variante === 'patio'
      ? 'Avisos de Pendientes'
      : 'Anuncios / Avisos';

  const subtitulo =
    variante === 'inicio'
      ? 'Pendientes y recordatorios operativos'
      : variante === 'patio'
      ? 'Notificaciones operativas de carga y entrega'
      : 'Recordatorios activos publicados desde patio';

  return (
    <>
      <section className="bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{titulo}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>
            </div>
          </div>

          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">
            {avisos.length}
          </span>
        </div>

        {variante === 'patio' && (
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-xl text-sm shadow transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generar pendientes
          </button>
        )}

        {avisos.length === 0 ? (
          <div className="text-center py-8 px-4 text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
            Sin avisos ni pendientes activos en este momento.
          </div>
        ) : (
          <div className="space-y-2.5">
            {avisos.map((aviso, index) => {
              const bordes = [
                'border-l-amber-400',
                'border-l-rose-400',
                'border-l-emerald-400',
              ];
              const iconos = [
                'text-amber-400 bg-amber-500/10 border-amber-500/25',
                'text-rose-400 bg-rose-500/10 border-rose-500/25',
                'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
              ];
              const estiloBorde = bordes[index % bordes.length];
              const estiloIcono = iconos[index % iconos.length];

              return (
                <div
                  key={aviso.id}
                  className={`bg-slate-950/75 border border-slate-800 border-l-4 ${estiloBorde} rounded-xl p-3.5 flex items-start justify-between gap-3`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${estiloIcono}`}>
                      <AlertCircle className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-100 leading-snug break-words">
                        {aviso.texto}
                      </p>

                      {variante === 'monitor' && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            Registrado {esHoy(aviso.fechaOperacion) ? 'hoy' : aviso.fechaOperacion}{' '}
                            • {formatearHora(aviso.creadoEn)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {variante === 'patio' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md">
                        {esHoy(aviso.fechaOperacion) ? 'Hoy' : aviso.fechaOperacion}
                      </span>
                      <button
                        type="button"
                        onClick={() => marcarAtendido(aviso.id)}
                        disabled={cerrandoId === aviso.id}
                        title="Marcar pendiente como atendido"
                        className="bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 p-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-4">
          <form
            onSubmit={guardarAviso}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-slate-100"
          >
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white leading-tight">
                    Generar Pendiente / Aviso
                  </h3>
                  <p className="text-xs text-slate-400">
                    Se mostrará al instante en Inicio, Patio y Monitor
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !guardando && setModalAbierto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Descripción del pendiente *
                </label>
                <textarea
                  required
                  autoFocus
                  rows={3}
                  placeholder="Ej. Pendiente entrega de productos a Villahermosa..."
                  value={textoNuevo}
                  onChange={(e) => setTextoNuevo(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 px-3.5 py-2.5 text-sm text-white outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || !textoNuevo.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white shadow-sm inline-flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  {guardando ? 'Publicando...' : 'Publicar Aviso'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}