'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db, Chofer, Unidad, NivelRevision } from '@/lib/firebase';
import { BotonTema, useTemaApp } from '@/components/BotonTema';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Home,
  Truck,
  Play,
  SquareCheck,
  Fuel,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  MapPin,
  FileText,
  Save,
  QrCode,
  X,
  RefreshCw,
  Flag,
  Camera,
  Trash2,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

interface CargaDoc {
  id: string;
  unidad?: string;
  unidadNombre?: string;
  unidadId?: string;
  chofer?: string;
  choferNombre?: string;
  choferId?: string;
  destino?: string;
  remisiones?: string[];
  estado?: string;
  fechaIso?: string;
  fechaOperacion?: string;
  horaLlegada?: string;
  horaSalida?: string;
  horaRegreso?: string;
}

const CLAVE_CHOFER_STORAGE = 'chofer-seleccionado-bravo';
const CLAVE_UNIDAD_STORAGE = 'unidad-seleccionada-bravo';

function obtenerFechaHoyIso(): string {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function obtenerHoraActualTexto(): string {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizarTexto(txt?: string): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function coincideNombre(a?: string, b?: string): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const primerA = na.split(/\s+/)[0];
  const primerB = nb.split(/\s+/)[0];
  return primerA.length >= 4 && primerA === primerB;
}

function obtenerUnidadDeCarga(cg: CargaDoc): string {
  return (cg.unidadNombre || cg.unidad || '').trim();
}

function obtenerChoferDeCarga(cg: CargaDoc): string {
  return (cg.choferNombre || cg.chofer || '').trim();
}

function esCargaAbierta(estado?: string): boolean {
  const e = normalizarTexto(estado).replace(/\s+/g, '_');
  if (!e) return false;
  return ![
    'finalizada',
    'finalizado',
    'completada',
    'completado',
    'cancelada',
    'cancelado',
  ].includes(e);
}

function esCargaEnRuta(estado?: string): boolean {
  const e = normalizarTexto(estado).replace(/\s+/g, '_');
  return e.includes('ruta') || e.includes('salio') || e.includes('transito');
}

function extraerIdUnidadDeQr(textoCrudo: string): string {
  const limpio = textoCrudo.trim();
  try {
    const url = new URL(limpio);
    const param = url.searchParams.get('unidad');
    if (param) return param.trim();
  } catch {
    // No es URL completa
  }
  if (limpio.startsWith('unidad:')) {
    return limpio.replace('unidad:', '').trim();
  }
  return limpio;
}

function comprimirFotoDano(file: File, maxDim = 800, calidad = 0.65): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la foto'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

function ContenidoChofer() {
  const tema = useTemaApp();
  const esOscuro = tema === 'dark';
  const searchParams = useSearchParams();
  const unidadQueryParam = searchParams.get('unidad') || '';

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [cargas, setCargas] = useState<CargaDoc[]>([]);

  const [choferId, setChoferId] = useState<string>('');
  const [unidadId, setUnidadId] = useState<string>('');
  const [cambiandoUnidad, setCambiandoUnidad] = useState<boolean>(false);
  const [origenAsignacion, setOrigenAsignacion] = useState<
    'QR' | 'PATIO' | 'BASE' | 'MANUAL' | null
  >(null);

  const [pestana, setPestana] = useState<'ruta' | 'gasolina' | 'cierre'>('ruta');
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [errorEscaner, setErrorEscaner] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Revisión de Salida
  const [mostrarCheckSalida, setMostrarCheckSalida] = useState(false);
  const [salidaEnviadaHoy, setSalidaEnviadaHoy] = useState(false);
  const [kmInicialHoy, setKmInicialHoy] = useState<number | null>(null);
  const [nivelCombustibleSalida, setNivelCombustibleSalida] = useState<
    'VACIO' | '1/4' | '1/2' | '3/4' | 'LLENO'
  >('3/4');
  const [aceite, setAceite] = useState<NivelRevision>('OK');
  const [anticongelante, setAnticongelante] = useState<NivelRevision>('OK');
  const [llantas, setLlantas] = useState<NivelRevision>('OK');
  const [limpiezaSalida, setLimpiezaSalida] = useState<NivelRevision>('OK');
  const [kilometrajeSalida, setKilometrajeSalida] = useState<string>('');
  const [observacionesSalida, setObservacionesSalida] = useState<string>('');

  // 2. Carga de gasolina
  const [litros, setLitros] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [odometro, setOdometro] = useState<string>('');
  const [notasGasolina, setNotasGasolina] = useState<string>('');

  // 3. Cerrar Día
  const [nivelCombustibleCierre, setNivelCombustibleCierre] = useState<
    'VACIO' | '1/4' | '1/2' | '3/4' | 'LLENO'
  >('1/2');
  const [kilometrajeCierre, setKilometrajeCierre] = useState<string>('');
  const [limpiezaEntrega, setLimpiezaEntrega] = useState<'LIMPIA' | 'REQUIERE_LAVADO'>('LIMPIA');
  const [tieneGolpeODano, setTieneGolpeODano] = useState<boolean>(false);
  const [descripcionDano, setDescripcionDano] = useState<string>('');
  const [fotoDano, setFotoDano] = useState<string>('');
  const [procesandoFotoDano, setProcesandoFotoDano] = useState<boolean>(false);
  const [jornadaCerradaInfo, setJornadaCerradaInfo] = useState<{
    hora: string;
    unidad: string;
  } | null>(null);

  useEffect(() => {
    const choferGuardado = window.localStorage.getItem(CLAVE_CHOFER_STORAGE);
    if (choferGuardado) setChoferId(choferGuardado);

    if (unidadQueryParam) {
      setUnidadId(unidadQueryParam);
      setOrigenAsignacion('QR');
      window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, unidadQueryParam);
    } else {
      const unidadGuardada = window.localStorage.getItem(CLAVE_UNIDAD_STORAGE);
      if (unidadGuardada) setUnidadId(unidadGuardada);
    }

    const qChoferes = query(collection(db, 'choferes'), where('activo', '==', true));
    const qUnidades = query(collection(db, 'unidades'), where('activo', '==', true));
    const qCargas = collection(db, 'cargas');

    const unsubC = onSnapshot(qChoferes, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(lista);
    });

    const unsubU = onSnapshot(qUnidades, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(lista);
    });

    const unsubCr = onSnapshot(qCargas, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CargaDoc));
      setCargas(lista);
    });

    return () => {
      unsubC();
      unsubU();
      unsubCr();
    };
  }, [unidadQueryParam]);

  const resolverUnidadParaChofer = useCallback(
    (
      cId: string,
      listaChoferes: Chofer[],
      listaUnidades: Unidad[],
      listaCargas: CargaDoc[]
    ): { unidad: Unidad; origen: 'PATIO' | 'BASE' } | null => {
      const choferObj = listaChoferes.find((c) => c.id === cId);
      if (!choferObj) return null;

      const cargaActiva = listaCargas.find(
        (cg) =>
          esCargaAbierta(cg.estado) &&
          (cg.choferId === choferObj.id ||
            coincideNombre(obtenerChoferDeCarga(cg), choferObj.nombre)) &&
          Boolean(obtenerUnidadDeCarga(cg) || cg.unidadId)
      );

      if (cargaActiva) {
        const nombreUn = obtenerUnidadDeCarga(cargaActiva);
        const unPatio =
          listaUnidades.find((u) => u.id === cargaActiva.unidadId) ||
          listaUnidades.find((u) => normalizarTexto(u.nombre) === normalizarTexto(nombreUn));
        if (unPatio) return { unidad: unPatio, origen: 'PATIO' };
      }

      const unBase =
        listaUnidades.find((u) => u.id === choferObj.unidadAsignadaId) ||
        listaUnidades.find((u) => u.choferDefaultId === choferObj.id);

      if (unBase) return { unidad: unBase, origen: 'BASE' };
      return null;
    },
    []
  );

  const resolverChoferParaUnidad = useCallback(
    (
      uId: string,
      listaChoferes: Chofer[],
      listaUnidades: Unidad[],
      listaCargas: CargaDoc[]
    ): Chofer | null => {
      const unidadObj = listaUnidades.find((u) => u.id === uId);
      if (!unidadObj) return null;

      const cargaActiva = listaCargas.find(
        (cg) =>
          esCargaAbierta(cg.estado) &&
          (cg.unidadId === unidadObj.id ||
            normalizarTexto(obtenerUnidadDeCarga(cg)) === normalizarTexto(unidadObj.nombre)) &&
          Boolean(obtenerChoferDeCarga(cg) || cg.choferId)
      );

      if (cargaActiva) {
        const nombreCh = obtenerChoferDeCarga(cargaActiva);
        const chPatio =
          listaChoferes.find((c) => c.id === cargaActiva.choferId) ||
          listaChoferes.find((c) => coincideNombre(c.nombre, nombreCh));
        if (chPatio) return chPatio;
      }

      const chBase =
        listaChoferes.find((c) => c.id === unidadObj.choferDefaultId) ||
        listaChoferes.find((c) => c.unidadAsignadaId === unidadObj.id);

      return chBase || null;
    },
    []
  );

  useEffect(() => {
    if (choferes.length === 0 || unidades.length === 0) return;

    if (unidadQueryParam) {
      const chDetectado = resolverChoferParaUnidad(
        unidadQueryParam,
        choferes,
        unidades,
        cargas
      );
      if (chDetectado && chDetectado.id !== choferId) {
        setChoferId(chDetectado.id);
        window.localStorage.setItem(CLAVE_CHOFER_STORAGE, chDetectado.id);
      }
      return;
    }

    if (choferId && !unidadId) {
      const res = resolverUnidadParaChofer(choferId, choferes, unidades, cargas);
      if (res) {
        setUnidadId(res.unidad.id);
        setOrigenAsignacion(res.origen);
        window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, res.unidad.id);
      }
    } else if (unidadId && !choferId) {
      const chDetectado = resolverChoferParaUnidad(unidadId, choferes, unidades, cargas);
      if (chDetectado) {
        setChoferId(chDetectado.id);
        window.localStorage.setItem(CLAVE_CHOFER_STORAGE, chDetectado.id);
      }
    }
  }, [
    choferes,
    unidades,
    cargas,
    unidadQueryParam,
    choferId,
    unidadId,
    resolverChoferParaUnidad,
    resolverUnidadParaChofer,
  ]);

  const handleSeleccionarChofer = (nuevoChoferId: string) => {
    setChoferId(nuevoChoferId);
    setMensajeEstado(null);
    setJornadaCerradaInfo(null);

    if (!nuevoChoferId) {
      window.localStorage.removeItem(CLAVE_CHOFER_STORAGE);
      return;
    }

    window.localStorage.setItem(CLAVE_CHOFER_STORAGE, nuevoChoferId);

    const res = resolverUnidadParaChofer(nuevoChoferId, choferes, unidades, cargas);
    if (res) {
      setUnidadId(res.unidad.id);
      setOrigenAsignacion(res.origen);
      setCambiandoUnidad(false);
      window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, res.unidad.id);
    }
  };

  const handleSeleccionarUnidad = useCallback(
    (nuevaUnidadId: string, origen: 'QR' | 'MANUAL' = 'MANUAL') => {
      setUnidadId(nuevaUnidadId);
      setOrigenAsignacion(nuevaUnidadId ? origen : null);
      setCambiandoUnidad(false);
      setJornadaCerradaInfo(null);

      if (!nuevaUnidadId) {
        window.localStorage.removeItem(CLAVE_UNIDAD_STORAGE);
        return;
      }

      window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, nuevaUnidadId);

      const chDetectado = resolverChoferParaUnidad(
        nuevaUnidadId,
        choferes,
        unidades,
        cargas
      );
      if (chDetectado) {
        setChoferId(chDetectado.id);
        window.localStorage.setItem(CLAVE_CHOFER_STORAGE, chDetectado.id);
      }
    },
    [choferes, unidades, cargas, resolverChoferParaUnidad]
  );

  const choferActual = useMemo(
    () => choferes.find((c) => c.id === choferId) || null,
    [choferes, choferId]
  );

  const unidadActual = useMemo(
    () => unidades.find((u) => u.id === unidadId) || null,
    [unidades, unidadId]
  );

  useEffect(() => {
    if (!escanerAbierto) return;
    let streamActivo: MediaStream | null = null;
    let intervalo: number | null = null;

    const iniciarCamara = async () => {
      try {
        setErrorEscaner(null);
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;

        if (!Detector) {
          setErrorEscaner(
            'Tu navegador no soporta escaneo directo dentro de la web. Puedes escanear el QR directo con la cámara normal de tu iPhone o Android y te abrirá esta pantalla.'
          );
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamActivo = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new Detector({ formats: ['qr_code'] });
        intervalo = window.setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codigos = await detector.detect(videoRef.current);
            if (codigos.length > 0 && codigos[0].rawValue) {
              const idDetectado = extraerIdUnidadDeQr(codigos[0].rawValue);
              const existe = unidades.find((u) => u.id === idDetectado);
              if (existe) {
                handleSeleccionarUnidad(existe.id, 'QR');
                setEscanerAbierto(false);
                mostrarAviso(`QR escaneado: ${existe.nombre}`);
              }
            }
          } catch {
            // Ignora cuadros sin lectura
          }
        }, 450);
      } catch {
        setErrorEscaner(
          'No se pudo acceder a la cámara. Puedes escanear el QR directo desde la app Cámara de tu teléfono.'
        );
      }
    };

    iniciarCamara();

    return () => {
      if (intervalo) window.clearInterval(intervalo);
      if (streamActivo) {
        streamActivo.getTracks().forEach((t) => t.stop());
      }
    };
  }, [escanerAbierto, unidades, handleSeleccionarUnidad]);

  const cargasActivasVisibles = useMemo(() => {
    const abiertas = cargas.filter((cg) => esCargaAbierta(cg.estado));
    if (!choferActual && !unidadActual) return [];

    return abiertas.filter((cg) => {
      const nombreCh = obtenerChoferDeCarga(cg);
      const nombreUn = obtenerUnidadDeCarga(cg);

      const matchChofer =
        choferActual !== null &&
        (cg.choferId === choferActual.id || coincideNombre(nombreCh, choferActual.nombre));
      const matchUnidad =
        unidadActual !== null &&
        (cg.unidadId === unidadActual.id ||
          normalizarTexto(nombreUn) === normalizarTexto(unidadActual.nombre));
      return matchChofer || matchUnidad;
    });
  }, [cargas, choferActual, unidadActual]);

  const mostrarAviso = (texto: string) => {
    setMensajeEstado(texto);
    window.setTimeout(() => {
      setMensajeEstado((prev) => (prev === texto ? null : prev));
    }, 4500);
  };

  const iniciarRuta = async (carga: CargaDoc) => {
    if (ocupado) return;
    try {
      setOcupado(true);
      await updateDoc(doc(db, 'cargas', carga.id), {
        estado: 'EN_RUTA',
        horaSalida: new Date().toISOString(),
        iniciadoPor: 'CHOFER',
        ...(choferActual && !obtenerChoferDeCarga(carga)
          ? { choferNombre: choferActual.nombre }
          : {}),
      });
      mostrarAviso(`Ruta iniciada para ${obtenerUnidadDeCarga(carga) || 'la unidad'}.`);
    } catch (err) {
      alert(
        `No se pudo iniciar la ruta: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const finalizarRuta = async (carga: CargaDoc) => {
    if (ocupado) return;
    try {
      setOcupado(true);
      await updateDoc(doc(db, 'cargas', carga.id), {
        estado: 'FINALIZADA',
        horaRegreso: new Date().toISOString(),
        finalizadoPor: 'CHOFER',
      });
      mostrarAviso(`Entrega finalizada para ${obtenerUnidadDeCarga(carga) || 'la unidad'}.`);
    } catch (err) {
      alert(
        `No se pudo finalizar la ruta: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const guardarRevisionSalida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    if (!choferActual) {
      alert('Selecciona primero tu nombre de chofer arriba.');
      return;
    }
    if (!unidadActual) {
      alert('Escanea o selecciona la unidad arriba.');
      return;
    }

    const kmNum = kilometrajeSalida ? Number(kilometrajeSalida) : null;

    try {
      setOcupado(true);
      await addDoc(collection(db, 'reportes_flota'), {
        tipo: 'REVISION_SALIDA',
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        choferId: choferActual.id,
        choferNombre: choferActual.nombre,
        nivelCombustible: nivelCombustibleSalida,
        aceite,
        anticongelante,
        llantas,
        limpieza: limpiezaSalida,
        kilometraje: kmNum,
        observaciones: observacionesSalida.trim(),
        fechaIso: obtenerFechaHoyIso(),
        horaTexto: obtenerHoraActualTexto(),
        creadoEn: new Date().toISOString(),
      });
      if (kmNum) setKmInicialHoy(kmNum);
      setSalidaEnviadaHoy(true);
      setMostrarCheckSalida(false);
      setObservacionesSalida('');
      mostrarAviso(`Revisión de salida de ${unidadActual.nombre} enviada.`);
    } catch (err) {
      alert(
        `No se pudo enviar la revisión: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const guardarGasolina = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    if (!choferActual) {
      alert('Selecciona primero tu nombre de chofer arriba.');
      return;
    }
    if (!unidadActual) {
      alert('Escanea o selecciona la unidad arriba.');
      return;
    }
    const litrosNum = Number(litros);
    if (!litrosNum || litrosNum <= 0) {
      alert('Ingresa los litros cargados.');
      return;
    }

    try {
      setOcupado(true);
      await addDoc(collection(db, 'reportes_flota'), {
        tipo: 'CARGA_GASOLINA',
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        choferId: choferActual.id,
        choferNombre: choferActual.nombre,
        litros: litrosNum,
        monto: monto ? Number(monto) : null,
        odometro: odometro ? Number(odometro) : null,
        notas: notasGasolina.trim(),
        fechaIso: obtenerFechaHoyIso(),
        horaTexto: obtenerHoraActualTexto(),
        creadoEn: new Date().toISOString(),
      });
      setLitros('');
      setMonto('');
      setOdometro('');
      setNotasGasolina('');
      mostrarAviso(`Carga de ${litrosNum} L registrada en ${unidadActual.nombre}.`);
    } catch (err) {
      alert(
        `No se pudo guardar la gasolina: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const handleFotoDano = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProcesandoFotoDano(true);
      const comprimida = await comprimirFotoDano(file);
      setFotoDano(comprimida);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo procesar la foto.');
    } finally {
      setProcesandoFotoDano(false);
      e.target.value = '';
    }
  };

  const guardarCierreDia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    if (!choferActual) {
      alert('Selecciona primero tu nombre de chofer arriba.');
      return;
    }
    if (!unidadActual) {
      alert('Escanea o selecciona la unidad que estás entregando.');
      return;
    }
    if (tieneGolpeODano && !descripcionDano.trim()) {
      alert('Describe brevemente el golpe o daño que presenta la unidad.');
      return;
    }

    const horaCierre = obtenerHoraActualTexto();
    const kmFinalNum = kilometrajeCierre ? Number(kilometrajeCierre) : null;
    const kmRecorridos =
      kmFinalNum !== null && kmInicialHoy !== null && kmFinalNum >= kmInicialHoy
        ? kmFinalNum - kmInicialHoy
        : null;

    try {
      setOcupado(true);

      await addDoc(collection(db, 'reportes_flota'), {
        tipo: 'CIERRE_DIA',
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        choferId: choferActual.id,
        choferNombre: choferActual.nombre,
        nivelCombustible: nivelCombustibleCierre,
        kilometrajeFinal: kmFinalNum,
        kilometrajeInicial: kmInicialHoy,
        kmRecorridos,
        limpieza: limpiezaEntrega,
        tieneGolpeODano,
        descripcionDano: tieneGolpeODano ? descripcionDano.trim() : '',
        fotoDano: tieneGolpeODano ? fotoDano : '',
        fechaIso: obtenerFechaHoyIso(),
        horaTexto: horaCierre,
        creadoEn: new Date().toISOString(),
      });

      for (const cg of cargasActivasVisibles) {
        await updateDoc(doc(db, 'cargas', cg.id), {
          estado: 'FINALIZADA',
          horaRegreso: new Date().toISOString(),
          finalizadoPor: 'CIERRE_DIA_CHOFER',
        });
      }

      setJornadaCerradaInfo({ hora: horaCierre, unidad: unidadActual.nombre });
      setKilometrajeCierre('');
      setTieneGolpeODano(false);
      setDescripcionDano('');
      setFotoDano('');
      mostrarAviso(`Día cerrado y ${unidadActual.nombre} entregada.`);
    } catch (err) {
      alert(
        `No se pudo cerrar el día: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const claseTarjeta = esOscuro
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';

  const claseCampo = esOscuro
    ? 'w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500'
    : 'w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500';

  const renderSelectorNivel = (
    etiqueta: string,
    valor: NivelRevision,
    onChange: (v: NivelRevision) => void
  ) => (
    <div className="space-y-1.5">
      <span className="block text-xs font-bold">{etiqueta}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {(['OK', 'BAJO', 'ATENCION'] as NivelRevision[]).map((op) => {
          const activo = valor === op;
          const etiquetaOp = op === 'OK' ? 'OK' : op === 'BAJO' ? 'Bajo' : 'Atención';
          const estiloActivo =
            op === 'OK'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : op === 'BAJO'
              ? 'bg-amber-600 text-white border-amber-500'
              : 'bg-rose-600 text-white border-rose-500';

          return (
            <button
              key={op}
              type="button"
              onClick={() => onChange(op)}
              className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                activo
                  ? estiloActivo
                  : esOscuro
                  ? 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {etiquetaOp}
            </button>
          );
        })}
      </div>
    </div>
  );

  const kmCalculadosPreview =
    kilometrajeCierre && kmInicialHoy !== null && Number(kilometrajeCierre) >= kmInicialHoy
      ? Number(kilometrajeCierre) - kmInicialHoy
      : null;

  return (
    <div
      className={`min-h-screen pb-14 transition-colors ${
        esOscuro ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      <header
        className={`border-b px-4 py-3.5 sticky top-0 z-10 flex items-center justify-between gap-3 ${
          esOscuro
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            title="Volver al menú principal"
            className={`border p-2 rounded-xl transition shrink-0 ${
              esOscuro
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <Home className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">
              Portal del Chofer — Ruta y Jornada
            </h1>
            <p className={`text-xs truncate ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
              Salida, ruta en vivo, gasolina y cierre de día
            </p>
          </div>
        </div>

        <BotonTema />
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className={`border rounded-2xl p-4 space-y-4 ${claseTarjeta}`}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="selector-chofer"
                className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-amber-500"
              >
                <UserCheck className="w-4 h-4" />
                Chofer
              </label>
              {choferActual && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Identificado
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {choferActual?.fotoPerfil ? (
                <img
                  src={choferActual.fotoPerfil}
                  alt={choferActual.nombre}
                  className="w-11 h-11 rounded-full object-cover border-2 border-amber-500 shrink-0"
                />
              ) : (
                <div
                  className={`w-11 h-11 rounded-full border flex items-center justify-center font-bold text-sm shrink-0 ${
                    esOscuro ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-amber-500" />
                </div>
              )}

              <select
                id="selector-chofer"
                value={choferId}
                onChange={(e) => handleSeleccionarChofer(e.target.value)}
                className={claseCampo}
              >
                <option value="">-- Selecciona tu nombre --</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className={`pt-3 border-t space-y-2.5 ${
              esOscuro ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-sky-400">
                <Truck className="w-4 h-4" />
                Unidad en operación
              </span>

              <div className="flex items-center gap-2">
                {origenAsignacion && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      origenAsignacion === 'QR'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : origenAsignacion === 'PATIO'
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                    }`}
                  >
                    {origenAsignacion === 'QR'
                      ? 'Vía QR'
                      : origenAsignacion === 'PATIO'
                      ? 'Asignada por Patio'
                      : origenAsignacion === 'BASE'
                      ? 'Unidad base'
                      : 'Seleccionada'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setEscanerAbierto(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Escanear QR</span>
                </button>
              </div>
            </div>

            {unidadActual && !cambiandoUnidad ? (
              <div
                className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                  esOscuro
                    ? 'bg-slate-950/80 border-slate-800'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <p className="font-extrabold text-sm">{unidadActual.nombre}</p>
                  <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                    {unidadActual.placas || 'Sin placas'}{' '}
                    {unidadActual.marcaModelo ? `• ${unidadActual.marcaModelo}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCambiandoUnidad(true)}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 ${
                    esOscuro
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  <RefreshCw className="w-3 h-3" />
                  Cambiar
                </button>
              </div>
            ) : (
              <select
                value={unidadId}
                onChange={(e) => handleSeleccionarUnidad(e.target.value, 'MANUAL')}
                className={claseCampo}
              >
                <option value="">-- Escanea QR o elige tu unidad --</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.placas ? `(${u.placas})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {mensajeEstado && (
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 shadow">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{mensajeEstado}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPestana('ruta')}
            className={`py-2.5 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'ruta'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : claseTarjeta
            }`}
          >
            <Truck className="w-4 h-4 shrink-0" />
            <span>Mi Ruta</span>
          </button>

          <button
            type="button"
            onClick={() => setPestana('gasolina')}
            className={`py-2.5 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'gasolina'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : claseTarjeta
            }`}
          >
            <Fuel className="w-4 h-4 shrink-0" />
            <span>Gasolina</span>
          </button>

          <button
            type="button"
            onClick={() => setPestana('cierre')}
            className={`py-2.5 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'cierre'
                ? 'bg-rose-600 text-white border-rose-500 shadow'
                : claseTarjeta
            }`}
          >
            <Flag className="w-4 h-4 shrink-0" />
            <span>Cerrar Día</span>
          </button>
        </div>

        {pestana === 'ruta' && (
          <section className="space-y-4">
            <div className={`border rounded-2xl p-4 space-y-3 ${claseTarjeta}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Revisión antes de salir a ruta</p>
                    <p className={`text-[11px] ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                      Aceite, anticongelante, llantas, gasolina y km inicial
                    </p>
                  </div>
                </div>

                {salidaEnviadaHoy ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Lista
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMostrarCheckSalida((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      mostrarCheckSalida
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                    }`}
                  >
                    {mostrarCheckSalida ? 'Ocultar' : 'Revisar Salida'}
                  </button>
                )}
              </div>

              {mostrarCheckSalida && (
                <form
                  onSubmit={guardarRevisionSalida}
                  className={`pt-3 border-t space-y-4 ${
                    esOscuro ? 'border-slate-800' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold">Nivel de combustible al salir</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(['VACIO', '1/4', '1/2', '3/4', 'LLENO'] as const).map((niv) => (
                        <button
                          key={niv}
                          type="button"
                          onClick={() => setNivelCombustibleSalida(niv)}
                          className={`py-2 rounded-xl text-xs font-bold border transition ${
                            nivelCombustibleSalida === niv
                              ? 'bg-amber-600 text-white border-amber-500'
                              : esOscuro
                              ? 'bg-slate-950 border-slate-800 text-slate-300'
                              : 'bg-slate-50 border-slate-300 text-slate-700'
                          }`}
                        >
                          {niv === 'VACIO' ? 'Vacío' : niv}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {renderSelectorNivel('Aceite de motor', aceite, setAceite)}
                    {renderSelectorNivel('Anticongelante', anticongelante, setAnticongelante)}
                    {renderSelectorNivel('Llantas', llantas, setLlantas)}
                    {renderSelectorNivel('Limpieza al salir', limpiezaSalida, setLimpiezaSalida)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Kilometraje inicial</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Ej. 48250"
                        value={kilometrajeSalida}
                        onChange={(e) => setKilometrajeSalida(e.target.value)}
                        className={claseCampo}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Observaciones (opcional)</label>
                      <input
                        type="text"
                        placeholder="Algún detalle antes de salir..."
                        value={observacionesSalida}
                        onChange={(e) => setObservacionesSalida(e.target.value)}
                        className={claseCampo}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={ocupado}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Revisión de Salida</span>
                  </button>
                </form>
              )}
            </div>

            {!choferActual && !unidadActual ? (
              <div className={`border rounded-2xl p-8 text-center text-sm ${claseTarjeta}`}>
                Escanea el QR de tu unidad o selecciona tu nombre arriba para ver tu ruta.
              </div>
            ) : cargasActivasVisibles.length === 0 ? (
              <div className={`border rounded-2xl p-8 text-center space-y-1 ${claseTarjeta}`}>
                <p className="font-bold text-sm">
                  No hay carga abierta registrada en Patio para{' '}
                  {unidadActual ? unidadActual.nombre : choferActual?.nombre}
                </p>
                <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                  En cuanto Patio registre la unidad en carga o ruta, aparecerá aquí con los
                  botones de Iniciar / Finalizar Ruta.
                </p>
              </div>
            ) : (
              cargasActivasVisibles.map((cg) => {
                const enRuta = esCargaEnRuta(cg.estado);
                const nombreUn = obtenerUnidadDeCarga(cg);
                const nombreCh = obtenerChoferDeCarga(cg);

                return (
                  <div key={cg.id} className={`border rounded-2xl p-4 space-y-4 ${claseTarjeta}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border inline-block mb-1 ${
                            enRuta
                              ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {enRuta ? 'EN RUTA' : cg.estado || 'CARGANDO'}
                        </span>
                        <h2 className="text-lg font-extrabold">
                          {nombreUn || 'Unidad sin nombre'}
                        </h2>
                        {nombreCh && (
                          <p
                            className={`text-xs ${
                              esOscuro ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            Chofer: {nombreCh}
                          </p>
                        )}
                      </div>
                      {cg.horaSalida && (
                        <span
                          className={`text-xs font-semibold ${
                            esOscuro ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          Salida:{' '}
                          {new Date(cg.horaSalida).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-semibold">Destino:</span>
                        <span>{cg.destino || 'Por confirmar'}</span>
                      </p>
                      <p className="flex items-start gap-1.5">
                        <FileText className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                        <span className="font-semibold shrink-0">Remisiones:</span>
                        <span>
                          {cg.remisiones && cg.remisiones.length > 0
                            ? cg.remisiones.join(', ')
                            : 'Sin remisiones capturadas'}
                        </span>
                      </p>
                    </div>

                    <div className="pt-1">
                      {!enRuta ? (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => iniciarRuta(cg)}
                          className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow transition"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>Iniciar Ruta</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => finalizarRuta(cg)}
                          className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow transition"
                        >
                          <SquareCheck className="w-5 h-5" />
                          <span>Finalizar Entrega / Ruta</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {pestana === 'gasolina' && (
          <form onSubmit={guardarGasolina} className={`border rounded-2xl p-4 space-y-4 ${claseTarjeta}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">Litros cargados *</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Ej. 35.5"
                  value={litros}
                  onChange={(e) => setLitros(e.target.value)}
                  className={claseCampo}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Monto ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Ej. 850"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className={claseCampo}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Odómetro (km)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ej. 48310"
                  value={odometro}
                  onChange={(e) => setOdometro(e.target.value)}
                  className={claseCampo}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Notas (gasolinera / ticket)</label>
              <input
                type="text"
                placeholder="Ej. Carga completa en ruta"
                value={notasGasolina}
                onChange={(e) => setNotasGasolina(e.target.value)}
                className={claseCampo}
              />
            </div>

            <button
              type="submit"
              disabled={ocupado}
              className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow transition"
            >
              <Fuel className="w-4 h-4" />
              <span>
                {ocupado
                  ? 'Guardando...'
                  : `Registrar Gasolina${unidadActual ? ` (${unidadActual.nombre})` : ''}`}
              </span>
            </button>
          </form>
        )}

        {pestana === 'cierre' && (
          <section className="space-y-4">
            {jornadaCerradaInfo && (
              <div className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="text-xs sm:text-sm">
                  <p className="font-extrabold">
                    Jornada cerrada a las {jornadaCerradaInfo.hora}
                  </p>
                  <p className="opacity-90">
                    Entrega de {jornadaCerradaInfo.unidad} registrada correctamente.
                  </p>
                </div>
              </div>
            )}

            <form
              onSubmit={guardarCierreDia}
              className={`border rounded-2xl p-4 space-y-4 ${claseTarjeta}`}
            >
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <Flag className="w-4 h-4 text-rose-500" />
                  <span>Cierre de Día y Entrega de Unidad</span>
                </h2>
                <p className={`text-xs mt-0.5 ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                  Reporta gasolina, kilometraje final, limpieza y estado físico al regresar
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold">Nivel de gasolina al entregar</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['VACIO', '1/4', '1/2', '3/4', 'LLENO'] as const).map((niv) => (
                    <button
                      key={niv}
                      type="button"
                      onClick={() => setNivelCombustibleCierre(niv)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        nivelCombustibleCierre === niv
                          ? 'bg-amber-600 text-white border-amber-500'
                          : esOscuro
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
                      {niv === 'VACIO' ? 'Vacío' : niv}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold">Kilometraje final al regresar</label>
                  {kmCalculadosPreview !== null && (
                    <span className="text-[11px] font-bold text-emerald-400">
                      Recorrido hoy: +{kmCalculadosPreview} km
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ej. 48410"
                  value={kilometrajeCierre}
                  onChange={(e) => setKilometrajeCierre(e.target.value)}
                  className={claseCampo}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold">Limpieza de cabina y caja</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLimpiezaEntrega('LIMPIA')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                      limpiezaEntrega === 'LIMPIA'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : esOscuro
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                  >
                    Limpia y lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setLimpiezaEntrega('REQUIERE_LAVADO')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                      limpiezaEntrega === 'REQUIERE_LAVADO'
                        ? 'bg-amber-600 text-white border-amber-500'
                        : esOscuro
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                  >
                    Requiere lavado
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold">Estado físico de la unidad</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTieneGolpeODano(false)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 transition ${
                      !tieneGolpeODano
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : esOscuro
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sin golpes / Bien</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTieneGolpeODano(true)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 transition ${
                      tieneGolpeODano
                        ? 'bg-rose-600 text-white border-rose-500'
                        : esOscuro
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Reportar golpe</span>
                  </button>
                </div>

                {tieneGolpeODano && (
                  <div
                    className={`p-3 rounded-xl border space-y-3 mt-2 ${
                      esOscuro
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        ¿Qué golpe, raspón o daño tiene? *
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Ej. Raspón en defensa trasera derecha..."
                        value={descripcionDano}
                        onChange={(e) => setDescripcionDano(e.target.value)}
                        className={`${claseCampo} resize-none`}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer inline-flex items-center gap-1.5">
                        <Camera className="w-4 h-4" />
                        <span>{procesandoFotoDano ? 'Procesando...' : 'Tomar foto del daño'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFotoDano}
                          disabled={procesandoFotoDano}
                          className="hidden"
                        />
                      </label>

                      {fotoDano && (
                        <div className="relative">
                          <img
                            src={fotoDano}
                            alt="Evidencia de daño"
                            className="w-16 h-16 rounded-lg object-cover border border-rose-500"
                          />
                          <button
                            type="button"
                            onClick={() => setFotoDano('')}
                            className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white p-1 rounded-full border border-slate-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {cargasActivasVisibles.length > 0 && (
                <p className="text-[11px] text-amber-400 font-semibold">
                  Nota: Al cerrar el día se finalizará automáticamente la ruta activa pendiente.
                </p>
              )}

              <button
                type="submit"
                disabled={ocupado}
                className="w-full py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow transition"
              >
                <Flag className="w-4 h-4" />
                <span>
                  {ocupado
                    ? 'Cerrando jornada...'
                    : `Cerrar Día y Entregar${unidadActual ? ` (${unidadActual.nombre})` : ''}`}
                </span>
              </button>
            </form>
          </section>
        )}
      </main>

      {escanerAbierto && (
        <div
          onClick={() => setEscanerAbierto(false)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl text-white"
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-amber-400" />
                Escanear QR de la Unidad
              </span>
              <button
                type="button"
                onClick={() => setEscanerAbierto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {errorEscaner ? (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  {errorEscaner}
                </p>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-square border border-slate-700">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                </div>
              )}

              <p className="text-[11px] text-slate-400 text-center">
                Apunta la cámara al código QR pegado en la unidad.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChoferPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
          Cargando portal del chofer...
        </div>
      }
    >
      <ContenidoChofer />
    </Suspense>
  );
}