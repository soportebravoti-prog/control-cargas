'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BrowserQRCodeReader } from '@zxing/browser';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  db,
  coleccion,
  coleccionUsuarios,
  Chofer,
  Unidad,
  NivelRevision,
  PerfilUsuario,
} from '@/lib/firebase';
import { BotonTema, useTemaApp } from '@/components/BotonTema';
import ProteccionModulo from '@/components/ProteccionModulo';
import BarraSesionModulo from '@/components/BarraSesionModulo';
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
  QrCode,
  X,
  RefreshCw,
  Flag,
  Camera,
  Trash2,
  ShieldCheck,
  Wrench,
  Route,
} from 'lucide-react';

interface CargaDoc {
  id: string;
  unidad?: string;
  unidadNombre?: string;
  unidadModelo?: string;
  unidadId?: string;
  chofer?: string;
  choferNombre?: string;
  choferId?: string;
  destino?: string;
  remisiones?: string[];
  estado?: string;
  fechaIso?: string;
  fechaOperacion?: string;
  horaInicio?: string;
  horaLlegada?: string;
  horaSalida?: string;
  horaRegreso?: string;
}

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

const CLAVE_CHOFER_STORAGE = 'chofer-seleccionado-bravo';
const CLAVE_UNIDAD_STORAGE = 'unidad-seleccionada-bravo';

function obtenerFechaHoyIso(): string {
  return new Date().toLocaleDateString('en-CA');
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
  return na === nb;
}

function obtenerUnidadDeCarga(cg: CargaDoc): string {
  return (cg.unidadNombre || cg.unidad || '').trim();
}

function obtenerChoferDeCarga(cg: CargaDoc): string {
  return (cg.choferNombre || cg.chofer || '').trim();
}

function obtenerDetalleModeloUnidad(u: UnidadExtendida): string {
  const nombreNorm = normalizarTexto(u.nombre);
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
    const itemNorm = normalizarTexto(item);
    if (!itemNorm || itemNorm === nombreNorm) continue;
    if (!unicos.some((existente) => normalizarTexto(existente) === itemNorm)) {
      unicos.push(item);
    }
  }
  return unicos.join(' • ');
}

function cargaPerteneceAUnidadExacta(cg: CargaDoc, unidad: UnidadExtendida): boolean {
  if (cg.unidadId) {
    return cg.unidadId === unidad.id;
  }
  const nombreCarga = normalizarTexto(obtenerUnidadDeCarga(cg));
  const nombreUnidad = normalizarTexto(unidad.nombre);
  if (!nombreCarga || nombreCarga !== nombreUnidad) return false;

  const modeloCarga = normalizarTexto(cg.unidadModelo);
  const modeloUnidad = normalizarTexto(obtenerDetalleModeloUnidad(unidad));
  if (modeloCarga && modeloUnidad) {
    return modeloCarga === modeloUnidad;
  }
  return true;
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
  const [unidades, setUnidades] = useState<UnidadExtendida[]>([]);
  const [cargas, setCargas] = useState<CargaDoc[]>([]);
  const [perfilesUsuario, setPerfilesUsuario] = useState<PerfilUsuario[]>([]);
  const [usuarioAuth, setUsuarioAuth] = useState<{ uid: string; email: string } | null>(null);
  const [revisionesHoy, setRevisionesHoy] = useState<
    Array<{ unidadId?: string; unidadNombre?: string; kilometraje?: number | null }>
  >([]);

  const [choferId, setChoferId] = useState<string>('');
  const [unidadId, setUnidadId] = useState<string>('');
  const [cambiandoUnidad, setCambiandoUnidad] = useState<boolean>(false);
  const [origenAsignacion, setOrigenAsignacion] = useState<
    'QR' | 'PATIO' | 'BASE' | 'MANUAL' | null
  >(null);

  const aplicoPredeterminadoChoferRef = useRef<string>('');
  const seleccionManualUnidadRef = useRef<boolean>(false);

  const [pestana, setPestana] = useState<'ruta' | 'gasolina' | 'cierre'>('ruta');
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const audioSalidaRef = useRef<HTMLAudioElement | null>(null);
  const audioFinalizadoRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioSalidaRef.current = new Audio('/sonido-salida.mp3');
    audioFinalizadoRef.current = new Audio('/sonido-finalizado.mp3');
  }, []);

  const reproducirSonidoChofer = useCallback((tipo: 'SALIDA' | 'FINALIZADA') => {
    const src = tipo === 'SALIDA' ? '/sonido-salida.mp3' : '/sonido-finalizado.mp3';
    const refActual = tipo === 'SALIDA' ? audioSalidaRef.current : audioFinalizadoRef.current;
    try {
      const audio = refActual || new Audio(src);
      audio.volume = 1;
      audio.currentTime = 0;
      audio.play().catch(() => {
        const respaldo = new Audio(src);
        respaldo.volume = 1;
        respaldo.play().catch(() => {});
      });
    } catch {
      // Ignorar si el navegador restringe audio
    }
  }, []);

  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [errorEscaner, setErrorEscaner] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const fotoQrInputRef = useRef<HTMLInputElement | null>(null);

  const [imagenAmpliada, setImagenAmpliada] = useState<{
    titulo: string;
    src: string;
  } | null>(null);

  const [destinoSinRemision, setDestinoSinRemision] = useState<string>('');

  const [forzarRevisionSalida, setForzarRevisionSalida] = useState<boolean>(false);
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

  const [litros, setLitros] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [odometro, setOdometro] = useState<string>('');
  const [notasGasolina, setNotasGasolina] = useState<string>('');

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

  const mostrarAviso = useCallback((texto: string) => {
    setErrorBanner(null);
    setMensajeEstado(texto);
    window.setTimeout(() => {
      setMensajeEstado((prev) => (prev === texto ? null : prev));
    }, 4500);
  }, []);

  const mostrarError = useCallback((texto: string) => {
    setMensajeEstado(null);
    setErrorBanner(texto);
    window.setTimeout(() => {
      setErrorBanner((prev) => (prev ? null : prev));
    }, 6000);
  }, []);

  useEffect(() => {
    if (!imagenAmpliada) return;
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagenAmpliada(null);
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, [imagenAmpliada]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUsuarioAuth({
          uid: user.uid,
          email: (user.email || '').trim().toLowerCase(),
        });
      } else {
        setUsuarioAuth(null);
      }
    });

    const hoyIso = obtenerFechaHoyIso();
    const qChoferes = query(collection(db, coleccion('choferes')), where('activo', '==', true));
    const qUnidades = query(collection(db, coleccion('unidades')), where('activo', '==', true));
    const qCargas = collection(db, coleccion('cargas'));
    const qUsuarios = collection(db, coleccionUsuarios());
    const qReportesHoy = query(
      collection(db, coleccion('reportes_flota')),
      where('fechaIso', '==', hoyIso)
    );

    const unsubC = onSnapshot(qChoferes, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(lista);
    });

    const unsubU = onSnapshot(qUnidades, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UnidadExtendida));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(lista);
    });

    const unsubCr = onSnapshot(qCargas, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CargaDoc));
      setCargas(lista);
    });

    const unsubUsr = onSnapshot(qUsuarios, (snap) => {
      const lista = snap.docs.map((d) => {
        const data = d.data() as Partial<PerfilUsuario>;
        return {
          uid: data.uid || d.id,
          nombre: data.nombre || data.correo || d.id,
          correo: (data.correo || '').trim().toLowerCase(),
          rolBase: data.rolBase || 'patio',
          modulos: Array.isArray(data.modulos) ? data.modulos : [],
          pin: data.pin || '',
          activo: data.activo !== false,
          choferId: data.choferId || null,
          unidadId: data.unidadId || null,
        } as PerfilUsuario;
      });
      setPerfilesUsuario(lista);
    });

    const unsubRep = onSnapshot(qReportesHoy, (snap) => {
      const revs = snap.docs
        .map((d) => d.data())
        .filter((r) => (r.tipo || r.tipoReporte) === 'REVISION_SALIDA')
        .map((r) => ({
          unidadId: r.unidadId as string | undefined,
          unidadNombre: r.unidadNombre as string | undefined,
          kilometraje: typeof r.kilometraje === 'number' ? r.kilometraje : null,
        }));
      setRevisionesHoy(revs);
    });

    return () => {
      unsubAuth();
      unsubC();
      unsubU();
      unsubCr();
      unsubUsr();
      unsubRep();
    };
  }, []);

  const perfilActual = useMemo<PerfilUsuario | null>(() => {
    if (!usuarioAuth) return null;
    const porUid = perfilesUsuario.find((p) => p.uid === usuarioAuth.uid);
    if (porUid) return porUid;
    if (usuarioAuth.email) {
      return perfilesUsuario.find((p) => p.correo === usuarioAuth.email) || null;
    }
    return null;
  }, [usuarioAuth, perfilesUsuario]);

  const choferVinculadoSesion = useMemo<Chofer | null>(() => {
    if (choferes.length === 0) return null;
    if (perfilActual?.choferId) {
      const porId = choferes.find((c) => c.id === perfilActual.choferId);
      if (porId) return porId;
    }
    if (usuarioAuth?.email) {
      const porCorreo = choferes.find(
        (c) => normalizarTexto((c as Chofer & { correo?: string }).correo) === usuarioAuth.email
      );
      if (porCorreo) return porCorreo;
    }
    if (perfilActual?.nombre) {
      const porNombre = choferes.find((c) => coincideNombre(c.nombre, perfilActual.nombre));
      if (porNombre) return porNombre;
    }
    return null;
  }, [choferes, perfilActual, usuarioAuth]);

  const restringirAUnChofer = useMemo(() => {
    if (!perfilActual) return false;
    if (perfilActual.rolBase === 'sistemas' || perfilActual.rolBase === 'admin') {
      return false;
    }
    return perfilActual.rolBase === 'chofer' || Boolean(choferVinculadoSesion);
  }, [perfilActual, choferVinculadoSesion]);

  const choferesDisponibles = useMemo(() => {
    if (!restringirAUnChofer) return choferes;
    if (choferVinculadoSesion) return [choferVinculadoSesion];
    return [];
  }, [restringirAUnChofer, choferes, choferVinculadoSesion]);

  const resolverUnidadParaChofer = useCallback(
    (
      cId: string,
      listaChoferes: Chofer[],
      listaUnidades: UnidadExtendida[],
      listaCargas: CargaDoc[]
    ): { unidad: UnidadExtendida; origen: 'PATIO' | 'BASE' } | null => {
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
        const unPatio =
          (cargaActiva.unidadId
            ? listaUnidades.find((u) => u.id === cargaActiva.unidadId)
            : undefined) ||
          listaUnidades.find((u) => cargaPerteneceAUnidadExacta(cargaActiva, u));
        if (unPatio) return { unidad: unPatio, origen: 'PATIO' };
      }

      const unidadPerfilId =
        perfilActual?.choferId === choferObj.id ? perfilActual?.unidadId : null;

      const unBase =
        (unidadPerfilId ? listaUnidades.find((u) => u.id === unidadPerfilId) : undefined) ||
        listaUnidades.find((u) => u.id === choferObj.unidadAsignadaId) ||
        listaUnidades.find((u) => u.choferDefaultId === choferObj.id);

      if (unBase) return { unidad: unBase, origen: 'BASE' };
      return null;
    },
    [perfilActual]
  );

  const resolverChoferParaUnidad = useCallback(
    (
      uId: string,
      listaChoferes: Chofer[],
      listaUnidades: UnidadExtendida[],
      listaCargas: CargaDoc[]
    ): Chofer | null => {
      const unidadObj = listaUnidades.find((u) => u.id === uId);
      if (!unidadObj) return null;

      const cargaActiva = listaCargas.find(
        (cg) =>
          esCargaAbierta(cg.estado) &&
          cargaPerteneceAUnidadExacta(cg, unidadObj) &&
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
    if (restringirAUnChofer && choferVinculadoSesion) {
      if (choferId !== choferVinculadoSesion.id) {
        setChoferId(choferVinculadoSesion.id);
        window.localStorage.setItem(CLAVE_CHOFER_STORAGE, choferVinculadoSesion.id);
      }
      return;
    }

    if (!restringirAUnChofer && !choferId) {
      const choferGuardado = window.localStorage.getItem(CLAVE_CHOFER_STORAGE);
      if (choferGuardado) {
        setChoferId(choferGuardado);
      }
    }
  }, [restringirAUnChofer, choferVinculadoSesion, choferId]);

  useEffect(() => {
    if (unidadQueryParam) {
      seleccionManualUnidadRef.current = true;
      setUnidadId(unidadQueryParam);
      setOrigenAsignacion('QR');
      window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, unidadQueryParam);
    } else if (!restringirAUnChofer) {
      const unidadGuardada = window.localStorage.getItem(CLAVE_UNIDAD_STORAGE);
      if (unidadGuardada && !unidadId) {
        setUnidadId(unidadGuardada);
      }
    }
  }, [unidadQueryParam, restringirAUnChofer, unidadId]);

  useEffect(() => {
    if (choferes.length === 0 || unidades.length === 0) return;

    if (unidadQueryParam) {
      if (!restringirAUnChofer) {
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
      }
      return;
    }

    if (choferId && aplicoPredeterminadoChoferRef.current !== choferId) {
      aplicoPredeterminadoChoferRef.current = choferId;
      if (!seleccionManualUnidadRef.current) {
        const res = resolverUnidadParaChofer(choferId, choferes, unidades, cargas);
        if (res) {
          setUnidadId(res.unidad.id);
          setOrigenAsignacion(res.origen);
          setCambiandoUnidad(false);
          window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, res.unidad.id);
        }
      }
    } else if (!restringirAUnChofer && unidadId && !choferId) {
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
    restringirAUnChofer,
    resolverChoferParaUnidad,
    resolverUnidadParaChofer,
  ]);

  const handleSeleccionarChofer = (nuevoChoferId: string) => {
    if (restringirAUnChofer && choferVinculadoSesion && nuevoChoferId !== choferVinculadoSesion.id) {
      return;
    }

    setChoferId(nuevoChoferId);
    aplicoPredeterminadoChoferRef.current = nuevoChoferId;
    seleccionManualUnidadRef.current = false;
    setMensajeEstado(null);
    setErrorBanner(null);
    setJornadaCerradaInfo(null);
    setForzarRevisionSalida(false);

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
    } else {
      setUnidadId('');
      setOrigenAsignacion(null);
      window.localStorage.removeItem(CLAVE_UNIDAD_STORAGE);
    }
  };

  const handleSeleccionarUnidad = useCallback(
    (nuevaUnidadId: string, origen: 'QR' | 'MANUAL' = 'MANUAL') => {
      seleccionManualUnidadRef.current = Boolean(nuevaUnidadId);
      setUnidadId(nuevaUnidadId);
      setOrigenAsignacion(nuevaUnidadId ? origen : null);
      setCambiandoUnidad(false);
      setJornadaCerradaInfo(null);
      setForzarRevisionSalida(false);

      if (!nuevaUnidadId) {
        window.localStorage.removeItem(CLAVE_UNIDAD_STORAGE);
        return;
      }

      window.localStorage.setItem(CLAVE_UNIDAD_STORAGE, nuevaUnidadId);

      if (!restringirAUnChofer) {
        const chDetectado = resolverChoferParaUnidad(
          nuevaUnidadId,
          choferes,
          unidades,
          cargas
        );
        if (chDetectado) {
          setChoferId(chDetectado.id);
          aplicoPredeterminadoChoferRef.current = chDetectado.id;
          window.localStorage.setItem(CLAVE_CHOFER_STORAGE, chDetectado.id);
        }
      }
    },
    [choferes, unidades, cargas, restringirAUnChofer, resolverChoferParaUnidad]
  );

  const choferActual = useMemo(
    () => choferes.find((c) => c.id === choferId) || null,
    [choferes, choferId]
  );

  const unidadActual = useMemo(
    () => unidades.find((u) => u.id === unidadId) || null,
    [unidades, unidadId]
  );

  const revisionUnidadActual = useMemo(() => {
    if (!unidadActual) return null;
    return (
      revisionesHoy.find(
        (r) =>
          (r.unidadId && r.unidadId === unidadActual.id) ||
          (!r.unidadId && normalizarTexto(r.unidadNombre) === normalizarTexto(unidadActual.nombre))
      ) || null
    );
  }, [revisionesHoy, unidadActual]);

  const salidaEnviadaHoy = revisionUnidadActual !== null && !forzarRevisionSalida;

  useEffect(() => {
    if (revisionUnidadActual?.kilometraje && kmInicialHoy === null) {
      setKmInicialHoy(revisionUnidadActual.kilometraje);
    }
  }, [revisionUnidadActual, kmInicialHoy]);

  useEffect(() => {
    if (!escanerAbierto) return;
    let cancelado = false;
    setErrorEscaner(null);

    const iniciarCamara = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          {
            video: { facingMode: { ideal: 'environment' } },
          },
          videoRef.current,
          (result, err) => {
            if (cancelado) return;
            if (result) {
              const idDetectado = extraerIdUnidadDeQr(result.getText());
              const existe = unidades.find((u) => u.id === idDetectado);
              if (existe) {
                controls.stop();
                handleSeleccionarUnidad(existe.id, 'QR');
                setEscanerAbierto(false);
                mostrarAviso(`QR escaneado: ${existe.nombre}`);
              }
            }
            if (err && err.name !== 'NotFoundException') {
              // Cuadros sin QR son normales
            }
          }
        );

        if (cancelado) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch {
        if (!cancelado) {
          setErrorEscaner(
            'No se pudo abrir la cámara en vivo. Revisa permisos del navegador o usa "Leer QR desde foto / cámara".'
          );
        }
      }
    };

    iniciarCamara();

    return () => {
      cancelado = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [escanerAbierto, unidades, handleSeleccionarUnidad, mostrarAviso]);

  const handleLeerQrDesdeFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const urlTemporal = URL.createObjectURL(file);
    try {
      const reader = new BrowserQRCodeReader();
      const res = await reader.decodeFromImageUrl(urlTemporal);
      const idDetectado = extraerIdUnidadDeQr(res.getText());
      const existe = unidades.find((u) => u.id === idDetectado);
      if (existe) {
        controlsRef.current?.stop();
        handleSeleccionarUnidad(existe.id, 'QR');
        setEscanerAbierto(false);
        mostrarAviso(`QR detectado: ${existe.nombre}`);
      } else {
        setErrorEscaner('El QR leído no corresponde a una unidad activa.');
      }
    } catch {
      setErrorEscaner('No se pudo leer ningún QR en la imagen.');
    } finally {
      URL.revokeObjectURL(urlTemporal);
      e.target.value = '';
    }
  };

  const cargasActivasVisibles = useMemo(() => {
    const abiertas = cargas.filter((cg) => esCargaAbierta(cg.estado));
    if (!choferActual && !unidadActual) return [];

    if (choferActual) {
      return abiertas.filter((cg) => {
        const nombreCh = obtenerChoferDeCarga(cg);
        const perteneceAlChofer = cg.choferId
          ? cg.choferId === choferActual.id
          : coincideNombre(nombreCh, choferActual.nombre);

        if (!perteneceAlChofer) return false;

        if (unidadActual && cg.unidadId) {
          return cg.unidadId === unidadActual.id;
        }
        return true;
      });
    }

    return abiertas.filter(
      (cg) => unidadActual !== null && cargaPerteneceAUnidadExacta(cg, unidadActual)
    );
  }, [cargas, choferActual, unidadActual]);

  const registrarRevisionObligatoriaSiFalta = async (): Promise<boolean> => {
    if (!choferActual) {
      mostrarError('Selecciona primero tu nombre de chofer arriba.');
      return false;
    }
    if (!unidadActual) {
      mostrarError('Escanea o selecciona la unidad arriba.');
      return false;
    }
    if (salidaEnviadaHoy) return true;

    const kmNum = kilometrajeSalida ? Number(kilometrajeSalida) : null;
    if (!kmNum || kmNum <= 0) {
      mostrarError('Ingresa el kilometraje inicial de la unidad antes de salir a ruta.');
      return false;
    }

    await addDoc(collection(db, coleccion('reportes_flota')), {
      tipo: 'REVISION_SALIDA',
      tipoReporte: 'REVISION_SALIDA',
      unidadId: unidadActual.id,
      unidadNombre: unidadActual.nombre,
      unidadModelo: obtenerDetalleModeloUnidad(unidadActual),
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
      fechaOperacion: obtenerFechaHoyIso(),
      horaTexto: obtenerHoraActualTexto(),
      creadoEn: new Date().toISOString(),
    });

    setKmInicialHoy(kmNum);
    setForzarRevisionSalida(false);
    setObservacionesSalida('');
    return true;
  };

  const revisarYIniciarRutaSinRemision = async () => {
    if (ocupado) return;
    try {
      setOcupado(true);

      const okRevision = await registrarRevisionObligatoriaSiFalta();
      if (!okRevision || !unidadActual) return;

      const fechaHoy = obtenerFechaHoyIso();
      const ahoraIso = new Date().toISOString();
      const modeloUnidad = obtenerDetalleModeloUnidad(unidadActual);

      const cargaAbiertaUnidad = cargas.find(
        (cg) =>
          esCargaAbierta(cg.estado) &&
          cargaPerteneceAUnidadExacta(cg, unidadActual) &&
          (!choferActual ||
            !cg.choferId ||
            cg.choferId === choferActual.id ||
            coincideNombre(obtenerChoferDeCarga(cg), choferActual.nombre))
      );

      if (cargaAbiertaUnidad) {
        if (esCargaEnRuta(cargaAbiertaUnidad.estado)) {
          mostrarError(`${unidadActual.nombre} ya tiene una ruta activa en curso.`);
          return;
        }
        await updateDoc(doc(db, coleccion('cargas'), cargaAbiertaUnidad.id), {
          unidadId: unidadActual.id,
          unidadModelo: modeloUnidad,
          choferId: choferActual?.id || cargaAbiertaUnidad.choferId || null,
          fechaOperacion: fechaHoy,
          estado: 'EN_RUTA',
          horaSalida: ahoraIso,
        });
        reproducirSonidoChofer('SALIDA');
        mostrarAviso(`Revisión lista y ruta iniciada para ${unidadActual.nombre}.`);
        return;
      }

      const vueltasHoyUnidad = cargas.filter(
        (cg) =>
          (cg.fechaOperacion || cg.fechaIso) === fechaHoy &&
          cargaPerteneceAUnidadExacta(cg, unidadActual) &&
          normalizarTexto(cg.estado) !== 'cancelada'
      ).length;

      await addDoc(collection(db, coleccion('cargas')), {
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        unidadModelo: modeloUnidad,
        unidad: unidadActual.nombre,
        choferId: choferActual?.id || null,
        choferNombre: choferActual?.nombre || 'Operador en ruta',
        chofer: choferActual?.nombre || 'Operador en ruta',
        destino: destinoSinRemision.trim() || 'Ruta sin remisiones',
        remisiones: [],
        vuelta: vueltasHoyUnidad + 1,
        estado: 'EN_RUTA',
        fechaOperacion: fechaHoy,
        fechaIso: fechaHoy,
        horaInicio: ahoraIso,
        horaSalida: ahoraIso,
        horaRegreso: null,
      });

      reproducirSonidoChofer('SALIDA');
      setDestinoSinRemision('');
      mostrarAviso(
        `Revisión guardada y ruta iniciada para ${unidadActual.nombre} (sin remisiones).`
      );
    } catch (err) {
      mostrarError(
        `No se pudo iniciar la ruta: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const revisarYIniciarRuta = async (carga: CargaDoc) => {
    if (ocupado) return;
    try {
      setOcupado(true);

      const okRevision = await registrarRevisionObligatoriaSiFalta();
      if (!okRevision) return;

      await updateDoc(doc(db, coleccion('cargas'), carga.id), {
        ...(unidadActual
          ? {
              unidadId: unidadActual.id,
              unidadModelo: obtenerDetalleModeloUnidad(unidadActual),
            }
          : {}),
        ...(choferActual ? { choferId: choferActual.id } : {}),
        fechaOperacion: carga.fechaOperacion || obtenerFechaHoyIso(),
        estado: 'EN_RUTA',
        horaSalida: new Date().toISOString(),
      });
      reproducirSonidoChofer('SALIDA');
      mostrarAviso(
        `Revisión confirmada y ruta iniciada para ${obtenerUnidadDeCarga(carga) || 'la unidad'}.`
      );
    } catch (err) {
      mostrarError(
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
      await updateDoc(doc(db, coleccion('cargas'), carga.id), {
        estado: 'FINALIZADA',
        horaRegreso: new Date().toISOString(),
      });
      reproducirSonidoChofer('FINALIZADA');
      mostrarAviso(`Entrega finalizada para ${obtenerUnidadDeCarga(carga) || 'la unidad'}.`);
    } catch (err) {
      mostrarError(
        `No se pudo finalizar la ruta: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setOcupado(false);
    }
  };

  const guardarGasolina = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    if (!choferActual) {
      mostrarError('Selecciona primero tu nombre de chofer arriba.');
      return;
    }
    if (!unidadActual) {
      mostrarError('Escanea o selecciona la unidad arriba.');
      return;
    }
    const litrosNum = Number(litros);
    if (!litrosNum || litrosNum <= 0) {
      mostrarError('Ingresa los litros cargados.');
      return;
    }

    try {
      setOcupado(true);
      await addDoc(collection(db, coleccion('reportes_flota')), {
        tipo: 'CARGA_GASOLINA',
        tipoReporte: 'GASOLINA',
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        unidadModelo: obtenerDetalleModeloUnidad(unidadActual),
        choferId: choferActual.id,
        choferNombre: choferActual.nombre,
        litros: litrosNum,
        monto: monto ? Number(monto) : null,
        odometro: odometro ? Number(odometro) : null,
        notas: notasGasolina.trim(),
        fechaIso: obtenerFechaHoyIso(),
        fechaOperacion: obtenerFechaHoyIso(),
        horaTexto: obtenerHoraActualTexto(),
        creadoEn: new Date().toISOString(),
      });
      setLitros('');
      setMonto('');
      setOdometro('');
      setNotasGasolina('');
      mostrarAviso(`Carga de ${litrosNum} L registrada en ${unidadActual.nombre}.`);
    } catch (err) {
      mostrarError(
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
      mostrarError(err instanceof Error ? err.message : 'No se pudo procesar la foto.');
    } finally {
      setProcesandoFotoDano(false);
      e.target.value = '';
    }
  };

  const guardarCierreDia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    if (!choferActual) {
      mostrarError('Selecciona primero tu nombre de chofer arriba.');
      return;
    }
    if (!unidadActual) {
      mostrarError('Escanea o selecciona la unidad que estás entregando.');
      return;
    }
    if (tieneGolpeODano && !descripcionDano.trim()) {
      mostrarError('Describe brevemente el golpe o daño que presenta la unidad.');
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

      await addDoc(collection(db, coleccion('reportes_flota')), {
        tipo: 'CIERRE_DIA',
        tipoReporte: 'CIERRE_DIA',
        unidadId: unidadActual.id,
        unidadNombre: unidadActual.nombre,
        unidadModelo: obtenerDetalleModeloUnidad(unidadActual),
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
        fechaOperacion: obtenerFechaHoyIso(),
        horaTexto: horaCierre,
        creadoEn: new Date().toISOString(),
      });

      for (const cg of cargasActivasVisibles) {
        await updateDoc(doc(db, coleccion('cargas'), cg.id), {
          estado: 'FINALIZADA',
          horaRegreso: new Date().toISOString(),
        });
      }

      reproducirSonidoChofer('FINALIZADA');
      setJornadaCerradaInfo({ hora: horaCierre, unidad: unidadActual.nombre });
      setKilometrajeCierre('');
      setTieneGolpeODano(false);
      setDescripcionDano('');
      setFotoDano('');
      setForzarRevisionSalida(false);
      mostrarAviso(`Día cerrado y ${unidadActual.nombre} entregada.`);
    } catch (err) {
      mostrarError(
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

  const renderChecklistSalidaObligatorio = () => {
    if (salidaEnviadaHoy) {
      return (
        <div
          className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap ${
            esOscuro
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span className="text-xs font-bold inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            Revisión de salida de hoy completada
            {kmInicialHoy !== null ? ` • Km inicial: ${kmInicialHoy}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setForzarRevisionSalida(true)}
            className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition ${
              esOscuro
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            Rehacer revisión
          </button>
        </div>
      );
    }

    return (
      <div
        className={`rounded-xl border p-3.5 space-y-4 ${
          esOscuro
            ? 'bg-slate-950/70 border-amber-500/40'
            : 'bg-amber-50/60 border-amber-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-amber-500">
                Paso obligatorio antes de salir
              </p>
              <p className={`text-[11px] ${esOscuro ? 'text-slate-400' : 'text-slate-600'}`}>
                Revisa combustible, niveles, llantas y kilometraje para habilitar la salida
              </p>
            </div>
          </div>

          {forzarRevisionSalida && revisionUnidadActual && (
            <button
              type="button"
              onClick={() => setForzarRevisionSalida(false)}
              className="text-[11px] font-bold text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold">Nivel de combustible al salir *</label>
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
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                {niv === 'VACIO' ? 'Vacío' : niv}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {renderSelectorNivel('Aceite de motor *', aceite, setAceite)}
          {renderSelectorNivel('Anticongelante *', anticongelante, setAnticongelante)}
          {renderSelectorNivel('Llantas *', llantas, setLlantas)}
          {renderSelectorNivel('Limpieza al salir *', limpiezaSalida, setLimpiezaSalida)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">Kilometraje inicial *</label>
            <input
              type="number"
              inputMode="numeric"
              required
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
      </div>
    );
  };

  const kmCalculadosPreview =
    kilometrajeCierre && kmInicialHoy !== null && Number(kilometrajeCierre) >= kmInicialHoy
      ? Number(kilometrajeCierre) - kmInicialHoy
      : null;

  const detalleModeloActual = unidadActual ? obtenerDetalleModeloUnidad(unidadActual) : '';

  return (
    <div
      className={`min-h-screen pb-14 transition-colors ${
        esOscuro ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      <header
        className={`border-b px-4 py-3.5 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 ${
          esOscuro ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
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
              Revisión de salida, ruta en vivo, gasolina y cierre de día
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BarraSesionModulo />
          <BotonTema />
        </div>
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
                  {restringirAUnChofer ? 'Tu perfil' : 'Identificado'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {choferActual?.fotoPerfil ? (
                <img
                  src={choferActual.fotoPerfil}
                  alt={choferActual.nombre}
                  onClick={() =>
                    setImagenAmpliada({
                      titulo: `Foto perfil — ${choferActual.nombre}`,
                      src: choferActual.fotoPerfil!,
                    })
                  }
                  className="w-11 h-11 rounded-full object-cover border-2 border-amber-500 shrink-0 cursor-zoom-in hover:opacity-90 transition"
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
                disabled={restringirAUnChofer}
                onChange={(e) => handleSeleccionarChofer(e.target.value)}
                className={`${claseCampo} ${
                  restringirAUnChofer ? 'opacity-90 cursor-not-allowed' : ''
                }`}
              >
                {!restringirAUnChofer && (
                  <option value="">-- Selecciona tu nombre --</option>
                )}
                {choferesDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            {restringirAUnChofer && !choferVinculadoSesion && (
              <p className="text-[11px] text-amber-400">
                Tu cuenta aún no tiene un chofer vinculado en Catálogos (Usuarios y Módulos).
              </p>
            )}
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
                      ? 'Predeterminada'
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
                  <p className="font-extrabold text-sm">
                    {unidadActual.nombre}
                    {detalleModeloActual ? ` — ${detalleModeloActual}` : ''}
                  </p>
                  <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                    {unidadActual.placas || 'Sin placas'}
                    {detalleModeloActual ? ` • ${detalleModeloActual}` : ''}
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
                <option value="">-- Escanea QR o elige cualquier unidad --</option>
                {unidades.map((u) => {
                  const detalleModelo = obtenerDetalleModeloUnidad(u);
                  return (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                      {detalleModelo ? ` — ${detalleModelo}` : ''}
                      {u.placas ? ` (${u.placas})` : ''}
                    </option>
                  );
                })}
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

        {errorBanner && (
          <div className="bg-rose-950/95 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
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
            {!choferActual && !unidadActual ? (
              <div className={`border rounded-2xl p-8 text-center text-sm ${claseTarjeta}`}>
                Escanea el QR de tu unidad o selecciona tu nombre arriba para revisar salida e iniciar ruta.
              </div>
            ) : cargasActivasVisibles.length === 0 ? (
              <div className={`border rounded-2xl p-4 sm:p-5 space-y-4 ${claseTarjeta}`}>
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="font-bold text-sm">
                    Salida sin remisiones —{' '}
                    {unidadActual
                      ? `${unidadActual.nombre}${
                          detalleModeloActual ? ` (${detalleModeloActual})` : ''
                        }`
                      : choferActual?.nombre}
                  </p>
                </div>

                {renderChecklistSalidaObligatorio()}

                <div className="space-y-2.5">
                  <label className="block text-xs font-bold">
                    Destino o motivo de salida (opcional)
                  </label>
                  <input
                    type="text"
                    value={destinoSinRemision}
                    onChange={(e) => setDestinoSinRemision(e.target.value)}
                    placeholder="Ej. Ruta local, recolección, apoyo..."
                    className={claseCampo}
                  />

                  <button
                    type="button"
                    disabled={ocupado || !unidadActual || !choferActual}
                    onClick={revisarYIniciarRutaSinRemision}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow transition"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>
                      {salidaEnviadaHoy
                        ? 'Iniciar Ruta sin Remisión'
                        : 'Confirmar Revisión e Iniciar Ruta'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              cargasActivasVisibles.map((cg) => {
                const enRuta = esCargaEnRuta(cg.estado);
                const nombreUn = obtenerUnidadDeCarga(cg);
                const nombreCh = obtenerChoferDeCarga(cg);
                const unidadObjCarga = unidades.find(
                  (u) =>
                    (cg.unidadId && u.id === cg.unidadId) ||
                    (!cg.unidadId && normalizarTexto(u.nombre) === normalizarTexto(nombreUn))
                );
                const modeloCarga =
                  (cg.unidadModelo || '').trim() ||
                  (unidadObjCarga ? obtenerDetalleModeloUnidad(unidadObjCarga) : '');

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
                          {modeloCarga ? ` — ${modeloCarga}` : ''}
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

                    {!enRuta && renderChecklistSalidaObligatorio()}

                    <div className="pt-1">
                      {!enRuta ? (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => revisarYIniciarRuta(cg)}
                          className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow transition"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>
                            {salidaEnviadaHoy
                              ? 'Iniciar Ruta'
                              : 'Confirmar Revisión e Iniciar Ruta'}
                          </span>
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
                            onClick={() =>
                              setImagenAmpliada({
                                titulo: 'Evidencia de daño',
                                src: fotoDano,
                              })
                            }
                            className="w-16 h-16 rounded-lg object-cover border border-rose-500 cursor-zoom-in hover:opacity-90 transition"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFotoDano('');
                            }}
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
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square border border-slate-700">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              </div>

              {errorEscaner && (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  {errorEscaner}
                </p>
              )}

              <input
                ref={fotoQrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleLeerQrDesdeFoto}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fotoQrInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 inline-flex items-center justify-center gap-2 transition"
              >
                <Camera className="w-4 h-4" />
                <span>Leer QR desde foto / cámara</span>
              </button>

              <p className="text-[11px] text-slate-400 text-center">
                Apunta la cámara al QR de la unidad o usa la opción de foto en iPhone, Android o
                PC.
              </p>
            </div>
          </div>
        </div>
      )}

      {imagenAmpliada && (
        <div
          onClick={() => setImagenAmpliada(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl text-white"
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold">{imagenAmpliada.titulo}</span>
              <button
                type="button"
                onClick={() => setImagenAmpliada(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-xs font-bold inline-flex items-center gap-1"
              >
                <span>Cerrar</span>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/50 max-h-[75vh] overflow-auto">
              <img
                src={imagenAmpliada.src}
                alt={imagenAmpliada.titulo}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChoferPage() {
  return (
    <ProteccionModulo moduloRequerido="chofer">
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
            Cargando portal del chofer...
          </div>
        }
      >
        <ContenidoChofer />
      </Suspense>
    </ProteccionModulo>
  );
}