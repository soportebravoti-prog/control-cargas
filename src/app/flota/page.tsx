'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db, Unidad, Chofer } from '@/lib/firebase';
import { BotonTema, useTemaApp } from '@/components/BotonTema';
import { IndicadorEstadoUnidad } from '@/components/IndicadorEstadoUnidad';
import { IndicadorEstadoChofer } from '@/components/IndicadorEstadoChofer';
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
  Users,
  AlertTriangle,
  Pencil,
  QrCode,
  Plus,
  X,
  Save,
  Camera,
  Trash2,
  Shield,
  FileText,
  Download,
  ExternalLink,
} from 'lucide-react';

interface FotosUnidadExt {
  frente?: string;
  trasera?: string;
  costadoIzq?: string;
  costadoDer?: string;
  tarjetaCirculacion?: string;
  polizaSeguro?: string;
}

type UnidadExt = Unidad & {
  tipo?: string;
  serie?: string;
  poliza?: string;
  seguroVence?: string | null;
  tarjetaFolio?: string;
  tarjetaVence?: string | null;
  fotos?: FotosUnidadExt;
};

type ChoferExt = Chofer & {
  licenciaNumero?: string;
  licenciaTipo?: string;
  licenciaVence?: string | null;
  ineFolio?: string;
  fotoLicencia?: string;
  fotoIne?: string;
};

interface CargaEstadoDoc {
  id: string;
  unidadId?: string;
  unidadNombre?: string;
  unidad?: string;
  unidadModelo?: string;
  choferId?: string;
  choferNombre?: string;
  chofer?: string;
  destino?: string;
  estado?: string;
  fechaOperacion?: string;
  fechaIso?: string;
}

function normalizarTexto(txt?: string | null): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function coincideChoferEstricto(
  cg: CargaEstadoDoc,
  ch: ChoferExt
): boolean {
  if (cg.choferId) {
    return cg.choferId === ch.id;
  }
  const nombreCarga = normalizarTexto(cg.choferNombre || cg.chofer);
  const nombreChofer = normalizarTexto(ch.nombre);
  return Boolean(nombreCarga && nombreChofer && nombreCarga === nombreChofer);
}

function cargaCorrespondeAUnidad(
  cg: CargaEstadoDoc,
  u: UnidadExt
): boolean {
  // Prioridad absoluta: ID único de la unidad en Firestore
  if (cg.unidadId) {
    return cg.unidadId === u.id;
  }

  // Fallback solo para registros antiguos sin unidadId:
  // exige coincidencia exacta de nombre y, si trae modelo, que coincida con tipo/marcaModelo
  const nombreCarga = normalizarTexto(cg.unidadNombre || cg.unidad);
  const nombreUnidad = normalizarTexto(u.nombre);
  if (!nombreCarga || !nombreUnidad || nombreCarga !== nombreUnidad) {
    return false;
  }

  const modeloCarga = normalizarTexto(cg.unidadModelo);
  const detalleUnidad = normalizarTexto(u.tipo || u.marcaModelo);
  if (modeloCarga && detalleUnidad) {
    return modeloCarga === detalleUnidad;
  }

  return true;
}

function esEstadoEnRuta(estado?: string): boolean {
  const limpio = normalizarTexto(estado).replace(/\s+/g, '_');
  return limpio.includes('ruta') || limpio.includes('salio') || limpio.includes('transito');
}

function esEstadoCargando(estado?: string): boolean {
  const limpio = normalizarTexto(estado).replace(/\s+/g, '_');
  return limpio.includes('carg');
}

function esEstadoActivoOperativo(estado?: string): boolean {
  return esEstadoEnRuta(estado) || esEstadoCargando(estado);
}

function comprimirImagen(file: File, maxDim = 800, calidad = 0.65): Promise<string> {
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
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('Imagen no válida'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

function calcularPesoBase64KB(b64?: string): number {
  if (!b64) return 0;
  return Math.round((b64.length * 3) / 4 / 1024);
}

function estadoVigenciaFecha(fechaIso?: string | null): {
  etiqueta: string;
  clase: string;
  incompleto: boolean;
} {
  if (!fechaIso) {
    return {
      etiqueta: 'Sin fecha',
      clase: 'bg-slate-800/80 text-slate-400 border-slate-700',
      incompleto: true,
    };
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const target = new Date(`${fechaIso}T00:00:00`);
  const diffDias = Math.ceil((target.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return {
      etiqueta: `Vencido (${fechaIso})`,
      clase: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
      incompleto: true,
    };
  }
  if (diffDias <= 30) {
    return {
      etiqueta: `Vence en ${diffDias}d (${fechaIso})`,
      clase: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      incompleto: false,
    };
  }
  return {
    etiqueta: fechaIso,
    clase: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    incompleto: false,
  };
}

export default function FlotaPage() {
  const tema = useTemaApp();
  const esOscuro = tema === 'dark';

  const [unidades, setUnidades] = useState<UnidadExt[]>([]);
  const [choferes, setChoferes] = useState<ChoferExt[]>([]);
  const [cargasOperativas, setCargasOperativas] = useState<CargaEstadoDoc[]>([]);
  const [hoyIso, setHoyIso] = useState<string>('');
  const [tab, setTab] = useState<'unidades' | 'choferes'>('unidades');
  const [originUrl, setOriginUrl] = useState<string>('');

  // Visor de imagen ampliada
  const [imagenAmpliada, setImagenAmpliada] = useState<{
    titulo: string;
    src: string;
  } | null>(null);

  // Modal Unidad
  const [modalUnidadAbierto, setModalUnidadAbierto] = useState(false);
  const [unidadEditando, setUnidadEditando] = useState<UnidadExt | null>(null);
  const [uNombre, setUNombre] = useState('');
  const [uPlacas, setUPlacas] = useState('');
  const [uMarcaModelo, setUMarcaModelo] = useState('');
  const [uTipo, setUTipo] = useState('');
  const [uAnio, setUAnio] = useState('');
  const [uSerie, setUSerie] = useState('');
  const [uChoferDefaultId, setUChoferDefaultId] = useState('');
  const [uAseguradora, setUAseguradora] = useState('');
  const [uPoliza, setUPoliza] = useState('');
  const [uSeguroVence, setUSeguroVence] = useState('');
  const [uTarjetaFolio, setUTarjetaFolio] = useState('');
  const [uTarjetaVence, setUTarjetaVence] = useState('');
  const [uFotos, setUFotos] = useState<FotosUnidadExt>({});
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  // Modal QR Unidad
  const [unidadQr, setUnidadQr] = useState<UnidadExt | null>(null);

  // Modal Chofer
  const [modalChoferAbierto, setModalChoferAbierto] = useState(false);
  const [choferEditando, setChoferEditando] = useState<ChoferExt | null>(null);
  const [cNombre, setCNombre] = useState('');
  const [cTelefono, setCTelefono] = useState('');
  const [cUnidadAsignadaId, setCUnidadAsignadaId] = useState('');
  const [cLicenciaNumero, setCLicenciaNumero] = useState('');
  const [cLicenciaTipo, setCLicenciaTipo] = useState('');
  const [cLicenciaVence, setCLicenciaVence] = useState('');
  const [cIneFolio, setCIneFolio] = useState('');
  const [cFotoPerfil, setCFotoPerfil] = useState('');
  const [cFotoLicencia, setCFotoLicencia] = useState('');
  const [cFotoIne, setCFotoIne] = useState('');
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  useEffect(() => {
    if (!imagenAmpliada) return;
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagenAmpliada(null);
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, [imagenAmpliada]);

  useEffect(() => {
    setOriginUrl(window.location.origin);
    setHoyIso(new Date().toLocaleDateString('en-CA'));

    const qU = query(collection(db, 'unidades'), where('activo', '==', true));
    const qC = query(collection(db, 'choferes'), where('activo', '==', true));
    const qCr = collection(db, 'cargas');

    const unsubU = onSnapshot(qU, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UnidadExt));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubC = onSnapshot(qC, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChoferExt));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    const unsubCr = onSnapshot(qCr, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CargaEstadoDoc));
      setCargasOperativas(list);
    });

    return () => {
      unsubU();
      unsubC();
      unsubCr();
    };
  }, []);

  const cargasHoyActivas = useMemo(() => {
    return cargasOperativas.filter((cg) => {
      const fechaDoc = cg.fechaOperacion || cg.fechaIso;
      if (hoyIso && fechaDoc && fechaDoc !== hoyIso) return false;
      return esEstadoActivoOperativo(cg.estado);
    });
  }, [cargasOperativas, hoyIso]);

  const estadoOperativoPorUnidad = useMemo(() => {
    const mapa = new Map<
      string,
      { enRuta: boolean; cargando: boolean; chofer?: string; destino?: string }
    >();

    unidades.forEach((u) => {
      const cargaActiva = cargasHoyActivas.find((cg) => cargaCorrespondeAUnidad(cg, u));
      if (!cargaActiva) {
        mapa.set(u.id, { enRuta: false, cargando: false });
        return;
      }

      const enRuta = esEstadoEnRuta(cargaActiva.estado);
      const cargando = !enRuta && esEstadoCargando(cargaActiva.estado);
      mapa.set(u.id, {
        enRuta,
        cargando,
        chofer: cargaActiva.choferNombre || cargaActiva.chofer,
        destino: cargaActiva.destino,
      });
    });

    return mapa;
  }, [unidades, cargasHoyActivas]);

  const estadoOperativoPorChofer = useMemo(() => {
    const mapa = new Map<
      string,
      { ocupado: boolean; tipo: 'En ruta' | 'Cargando'; detalle?: string }
    >();

    choferes.forEach((ch) => {
      const cargasDelChofer = cargasHoyActivas.filter((cg) =>
        coincideChoferEstricto(cg, ch)
      );

      if (cargasDelChofer.length === 0) return;

      // Priorizar la carga que esté EN_RUTA si existiera más de una por error operativo
      const cargaPrincipal =
        cargasDelChofer.find((cg) => esEstadoEnRuta(cg.estado)) || cargasDelChofer[0];

      const enRuta = esEstadoEnRuta(cargaPrincipal.estado);
      const unidadObj = cargaPrincipal.unidadId
        ? unidades.find((u) => u.id === cargaPrincipal.unidadId)
        : undefined;
      const unidadTxt =
        unidadObj?.nombre || cargaPrincipal.unidadNombre || cargaPrincipal.unidad;
      const destinoTxt = cargaPrincipal.destino;

      const avisoDoble =
        cargasDelChofer.length > 1
          ? ` (${cargasDelChofer.length} rutas activas — revisar)`
          : '';

      const detalle = [
        unidadTxt,
        destinoTxt ? `Destino: ${destinoTxt}` : '',
      ]
        .filter(Boolean)
        .join(' • ') + avisoDoble;

      mapa.set(ch.id, {
        ocupado: true,
        tipo: enRuta ? 'En ruta' : 'Cargando',
        detalle,
      });
    });

    return mapa;
  }, [choferes, cargasHoyActivas, unidades]);

  const unidadEstaIncompleta = (u: UnidadExt): boolean => {
    const tieneFotosBase = Boolean(
      u.fotos?.frente && u.fotos?.trasera && (u.fotos?.costadoIzq || u.fotos?.costadoDer)
    );
    return (
      !u.placas ||
      !u.serie ||
      !u.seguroVence ||
      !u.tarjetaVence ||
      !tieneFotosBase
    );
  };

  const choferEstaIncompleto = (c: ChoferExt): boolean => {
    return !c.licenciaNumero || !c.licenciaVence || !c.ineFolio || !c.fotoLicencia;
  };

  const unidadesIncompletasCount = useMemo(
    () => unidades.filter(unidadEstaIncompleta).length,
    [unidades]
  );

  const choferesIncompletosCount = useMemo(
    () => choferes.filter(choferEstaIncompleto).length,
    [choferes]
  );

  const unidadesEnRutaCount = useMemo(() => {
    let total = 0;
    unidades.forEach((u) => {
      if (estadoOperativoPorUnidad.get(u.id)?.enRuta) total += 1;
    });
    return total;
  }, [unidades, estadoOperativoPorUnidad]);

  const choferesOcupadosCount = useMemo(() => {
    let total = 0;
    choferes.forEach((c) => {
      if (estadoOperativoPorChofer.get(c.id)?.ocupado) total += 1;
    });
    return total;
  }, [choferes, estadoOperativoPorChofer]);

  const abrirModalUnidad = (u?: UnidadExt) => {
    if (u) {
      setUnidadEditando(u);
      setUNombre(u.nombre || '');
      setUPlacas(u.placas || '');
      setUMarcaModelo(u.marcaModelo || '');
      setUTipo(u.tipo || '');
      setUAnio(u.anio ? String(u.anio) : '');
      setUSerie(u.serie || '');
      setUChoferDefaultId(u.choferDefaultId || '');
      setUAseguradora(u.aseguradora || '');
      setUPoliza(u.poliza || '');
      setUSeguroVence(u.seguroVence || '');
      setUTarjetaFolio(u.tarjetaFolio || '');
      setUTarjetaVence(u.tarjetaVence || '');
      setUFotos(u.fotos || {});
    } else {
      setUnidadEditando(null);
      setUNombre('');
      setUPlacas('');
      setUMarcaModelo('');
      setUTipo('');
      setUAnio('');
      setUSerie('');
      setUChoferDefaultId('');
      setUAseguradora('');
      setUPoliza('');
      setUSeguroVence('');
      setUTarjetaFolio('');
      setUTarjetaVence('');
      setUFotos({});
    }
    setModalUnidadAbierto(true);
  };

  const handleSubirFotoUnidad = async (
    campo: keyof FotosUnidadExt,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await comprimirImagen(file, 780, 0.62);
      setUFotos((prev) => ({ ...prev, [campo]: b64 }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar la foto');
    } finally {
      e.target.value = '';
    }
  };

  const pesoTotalFotosUnidadKB = useMemo(() => {
    return (
      calcularPesoBase64KB(uFotos.frente) +
      calcularPesoBase64KB(uFotos.trasera) +
      calcularPesoBase64KB(uFotos.costadoIzq) +
      calcularPesoBase64KB(uFotos.costadoDer) +
      calcularPesoBase64KB(uFotos.tarjetaCirculacion) +
      calcularPesoBase64KB(uFotos.polizaSeguro)
    );
  }, [uFotos]);

  const guardarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uNombre.trim() || guardandoUnidad) return;
    if (pesoTotalFotosUnidadKB > 850) {
      alert('El peso combinado de las fotos es muy alto. Elimina o vuelve a capturar alguna.');
      return;
    }

    try {
      setGuardandoUnidad(true);
      const payload = {
        nombre: uNombre.trim(),
        placas: uPlacas.trim().toUpperCase(),
        marcaModelo: uMarcaModelo.trim(),
        tipo: uTipo.trim(),
        anio: uAnio ? Number(uAnio) : null,
        serie: uSerie.trim().toUpperCase(),
        choferDefaultId: uChoferDefaultId || null,
        aseguradora: uAseguradora.trim(),
        poliza: uPoliza.trim(),
        seguroVence: uSeguroVence || null,
        tarjetaFolio: uTarjetaFolio.trim(),
        tarjetaVence: uTarjetaVence || null,
        fotos: uFotos,
        activo: true,
      };

      if (unidadEditando) {
        await updateDoc(doc(db, 'unidades', unidadEditando.id), payload);
      } else {
        await addDoc(collection(db, 'unidades'), payload);
      }
      setModalUnidadAbierto(false);
    } catch (err) {
      alert(
        `No se pudo guardar la unidad: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setGuardandoUnidad(false);
    }
  };

  const abrirModalChofer = (c?: ChoferExt) => {
    if (c) {
      setChoferEditando(c);
      setCNombre(c.nombre || '');
      setCTelefono(c.telefono || '');
      setCUnidadAsignadaId(c.unidadAsignadaId || '');
      setCLicenciaNumero(c.licenciaNumero || '');
      setCLicenciaTipo(c.licenciaTipo || '');
      setCLicenciaVence(c.licenciaVence || '');
      setCIneFolio(c.ineFolio || '');
      setCFotoPerfil(c.fotoPerfil || '');
      setCFotoLicencia(c.fotoLicencia || '');
      setCFotoIne(c.fotoIne || '');
    } else {
      setChoferEditando(null);
      setCNombre('');
      setCTelefono('');
      setCUnidadAsignadaId('');
      setCLicenciaNumero('');
      setCLicenciaTipo('');
      setCLicenciaVence('');
      setCIneFolio('');
      setCFotoPerfil('');
      setCFotoLicencia('');
      setCFotoIne('');
    }
    setModalChoferAbierto(true);
  };

  const handleSubirFotoChofer = async (
    campo: 'perfil' | 'licencia' | 'ine',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await comprimirImagen(file, campo === 'perfil' ? 450 : 750, 0.65);
      if (campo === 'perfil') setCFotoPerfil(b64);
      if (campo === 'licencia') setCFotoLicencia(b64);
      if (campo === 'ine') setCFotoIne(b64);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar la foto');
    } finally {
      e.target.value = '';
    }
  };

  const guardarChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cNombre.trim() || guardandoChofer) return;

    try {
      setGuardandoChofer(true);
      const payload = {
        nombre: cNombre.trim(),
        telefono: cTelefono.trim(),
        unidadAsignadaId: cUnidadAsignadaId || null,
        licenciaNumero: cLicenciaNumero.trim().toUpperCase(),
        licenciaTipo: cLicenciaTipo.trim(),
        licenciaVence: cLicenciaVence || null,
        ineFolio: cIneFolio.trim().toUpperCase(),
        fotoPerfil: cFotoPerfil || '',
        fotoLicencia: cFotoLicencia || '',
        fotoIne: cFotoIne || '',
        activo: true,
      };

      if (choferEditando) {
        await updateDoc(doc(db, 'choferes', choferEditando.id), payload);
      } else {
        await addDoc(collection(db, 'choferes'), payload);
      }
      setModalChoferAbierto(false);
    } catch (err) {
      alert(
        `No se pudo guardar el chofer: ${err instanceof Error ? err.message : 'Error desconocido'}`
      );
    } finally {
      setGuardandoChofer(false);
    }
  };

  const claseTarjeta = esOscuro
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';

  const claseCampo = esOscuro
    ? 'w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-amber-500'
    : 'w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500';

  const urlQrUnidad = unidadQr ? `${originUrl}/chofer?unidad=${unidadQr.id}` : '';
  const imgQrApi = urlQrUnidad
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(
        urlQrUnidad
      )}`
    : '';

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
              Control de Flota — Unidades y Choferes
            </h1>
            <p className={`text-xs truncate ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
              Expedientes, documentos vigentes, QR por unidad y disponibilidad en vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (tab === 'unidades' ? abrirModalUnidad() : abrirModalChofer())}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1.5 shadow transition"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">
              {tab === 'unidades' ? 'Nueva Unidad' : 'Nuevo Chofer'}
            </span>
          </button>
          <BotonTema />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-5">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className={`border rounded-2xl p-4 flex items-center justify-between ${claseTarjeta}`}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Unidades Activas
              </p>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-2xl font-extrabold">{unidades.length}</span>
                <span className="text-xs font-bold text-emerald-400">
                  ({unidadesEnRutaCount} en ruta)
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          <div className={`border rounded-2xl p-4 flex items-center justify-between ${claseTarjeta}`}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Datos / Docs por completar
              </p>
              <p className="text-2xl font-extrabold text-amber-400 mt-1">
                {unidadesIncompletasCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className={`border rounded-2xl p-4 flex items-center justify-between ${claseTarjeta}`}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Choferes (Licencia / INE)
              </p>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span className="text-2xl font-extrabold">{choferes.length}</span>
                <span className="text-xs font-bold text-emerald-400">
                  ({choferesOcupadosCount} ocupados)
                </span>
                {choferesIncompletosCount > 0 && (
                  <span className="text-xs font-bold text-amber-400">
                    • {choferesIncompletosCount} por revisar
                  </span>
                )}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('unidades')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border inline-flex items-center gap-2 transition ${
              tab === 'unidades'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : claseTarjeta
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Unidades ({unidades.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('choferes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border inline-flex items-center gap-2 transition ${
              tab === 'choferes'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : claseTarjeta
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Choferes ({choferes.length})</span>
          </button>
        </div>

        {tab === 'unidades' && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unidades.map((u) => {
              const infoOperativa = estadoOperativoPorUnidad.get(u.id);
              const estaEnRuta = Boolean(infoOperativa?.enRuta);
              const estaCargando = Boolean(infoOperativa?.cargando);

              const incompleta = unidadEstaIncompleta(u);
              const choferBase = choferes.find((c) => c.id === u.choferDefaultId);
              const vigSeguro = estadoVigenciaFecha(u.seguroVence);
              const vigTarjeta = estadoVigenciaFecha(u.tarjetaVence);

              const fotosGaleria = [
                u.fotos?.frente,
                u.fotos?.trasera,
                u.fotos?.costadoIzq,
                u.fotos?.costadoDer,
              ].filter(Boolean) as string[];

              return (
                <div
                  key={u.id}
                  className={`border rounded-2xl p-4 flex flex-col justify-between space-y-3.5 transition ${
                    estaEnRuta
                      ? esOscuro
                        ? 'bg-slate-900/95 border-emerald-500/45 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                        : 'bg-white border-emerald-400 shadow-sm'
                      : claseTarjeta
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-extrabold truncate">{u.nombre}</h2>
                          <IndicadorEstadoUnidad
                            enRuta={estaEnRuta}
                            cargando={estaCargando}
                          />
                        </div>
                        <p
                          className={`text-xs mt-0.5 ${
                            esOscuro ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {u.tipo || u.marcaModelo || 'Tipo sin especificar'}
                        </p>
                        {estaEnRuta && infoOperativa && (
                          <p className="text-[11px] font-semibold text-emerald-400 mt-1 truncate">
                            {infoOperativa.chofer ? `Operador: ${infoOperativa.chofer}` : ''}
                            {infoOperativa.destino ? ` • Destino: ${infoOperativa.destino}` : ''}
                          </p>
                        )}
                      </div>

                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                          incompleta
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        }`}
                      >
                        {incompleta ? 'Por completar' : 'Completa'}
                      </span>
                    </div>

                    {fotosGaleria.length > 0 ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {fotosGaleria.slice(0, 4).map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt={`${u.nombre} vista ${idx + 1}`}
                            onClick={() =>
                              setImagenAmpliada({
                                titulo: `${u.nombre} — Vista ${idx + 1}`,
                                src,
                              })
                            }
                            className="w-full h-14 object-cover rounded-lg border border-slate-700/60 cursor-zoom-in hover:opacity-90 transition"
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className={`rounded-xl border border-dashed px-3 py-2.5 text-center text-xs flex items-center justify-center gap-1.5 ${
                          esOscuro
                            ? 'border-slate-800 bg-slate-950/50 text-slate-400'
                            : 'border-slate-300 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5 shrink-0" />
                        <span>Sin fotos de frente, trasero ni costados</span>
                      </div>
                    )}

                    <div
                      className={`rounded-xl border p-3 space-y-1.5 text-xs ${
                        esOscuro
                          ? 'bg-slate-950/80 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className={esOscuro ? 'text-slate-400' : 'text-slate-500'}>
                          Placas:
                        </span>
                        <span className="font-bold">{u.placas || 'Sin registrar'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className={esOscuro ? 'text-slate-400' : 'text-slate-500'}>
                          Serie / VIN:
                        </span>
                        <span className="font-bold truncate max-w-[170px]">
                          {u.serie || 'Sin registrar'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className={esOscuro ? 'text-slate-400' : 'text-slate-500'}>
                          Chofer base:
                        </span>
                        <span className="font-bold">
                          {choferBase ? choferBase.nombre : 'Sin asignar'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sky-400 font-semibold truncate">
                          <Shield className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            Seguro ({u.aseguradora || 'Sin aseguradora'}):
                          </span>
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${vigSeguro.clase}`}
                        >
                          {vigSeguro.etiqueta}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-slate-300 font-semibold truncate">
                          <FileText className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span className="truncate">
                            Tarjeta ({u.tarjetaFolio || 'Sin folio'}):
                          </span>
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${vigTarjeta.clase}`}
                        >
                          {vigTarjeta.etiqueta}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => abrirModalUnidad(u)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 transition ${
                        esOscuro
                          ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-400" />
                      <span>Editar Expediente</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUnidadQr(u)}
                      title="Ver código QR de unidad"
                      className="py-2 px-3 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 inline-flex items-center gap-1 transition"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>QR</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === 'choferes' && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {choferes.map((c) => {
              const infoOcupado = estadoOperativoPorChofer.get(c.id);
              const estaOcupado = Boolean(infoOcupado?.ocupado);
              const incompleto = choferEstaIncompleto(c);
              const unidadBase = unidades.find((u) => u.id === c.unidadAsignadaId);
              const vigLicencia = estadoVigenciaFecha(c.licenciaVence);

              return (
                <div
                  key={c.id}
                  className={`border rounded-2xl p-4 flex flex-col justify-between space-y-3.5 transition ${
                    estaOcupado
                      ? esOscuro
                        ? 'bg-slate-900/95 border-emerald-500/45 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                        : 'bg-white border-emerald-400 shadow-sm'
                      : claseTarjeta
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {c.fotoPerfil ? (
                          <img
                            src={c.fotoPerfil}
                            alt={c.nombre}
                            onClick={() =>
                              setImagenAmpliada({
                                titulo: `Foto perfil — ${c.nombre}`,
                                src: c.fotoPerfil!,
                              })
                            }
                            className="w-11 h-11 rounded-full object-cover border-2 border-amber-500 shrink-0 cursor-zoom-in hover:opacity-90 transition"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-amber-400 shrink-0">
                            {c.nombre.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-extrabold truncate">{c.nombre}</h2>
                            <IndicadorEstadoChofer
                              ocupado={estaOcupado}
                              etiquetaOcupado={infoOcupado?.tipo || 'Ocupado'}
                            />
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {c.telefono || 'Sin teléfono'}
                          </p>
                          {estaOcupado && infoOcupado?.detalle && (
                            <p className="text-[11px] font-semibold text-emerald-400 mt-1 truncate">
                              {infoOcupado.detalle}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                          incompleto
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        }`}
                      >
                        {incompleto ? 'Por revisar' : 'Completo'}
                      </span>
                    </div>

                    <div
                      className={`rounded-xl border p-3 space-y-1.5 text-xs ${
                        esOscuro
                          ? 'bg-slate-950/80 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Unidad base:</span>
                        <span className="font-bold">
                          {unidadBase ? unidadBase.nombre : 'Sin asignar'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Licencia:</span>
                        <span className="font-bold">
                          {c.licenciaNumero || 'Sin registrar'}{' '}
                          {c.licenciaTipo ? `(${c.licenciaTipo})` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">INE:</span>
                        <span className="font-bold">{c.ineFolio || 'Sin registrar'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 font-semibold">Vigencia licencia:</span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${vigLicencia.clase}`}
                      >
                        {vigLicencia.etiqueta}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => abrirModalChofer(c)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 transition ${
                      esOscuro
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-400" />
                    <span>Editar Chofer y Documentos</span>
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </main>

      {modalUnidadAbierto && (
        <div
          onClick={() => setModalUnidadAbierto(false)}
          className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={guardarUnidad}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl text-slate-100"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="font-bold text-base">
                  {unidadEditando
                    ? `Expediente: ${unidadEditando.nombre}`
                    : 'Registrar Nueva Unidad'}
                </h3>
                <p className="text-xs text-slate-400">
                  Peso total de fotos: {pesoTotalFotosUnidadKB} KB / 850 KB máx.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalUnidadAbierto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Nombre de unidad *</label>
                  <input
                    type="text"
                    required
                    value={uNombre}
                    onChange={(e) => setUNombre(e.target.value)}
                    placeholder="Ej. Saveiro Camper"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Placas</label>
                  <input
                    type="text"
                    value={uPlacas}
                    onChange={(e) => setUPlacas(e.target.value)}
                    placeholder="Ej. VM-1234-A"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Marca y Modelo</label>
                  <input
                    type="text"
                    value={uMarcaModelo}
                    onChange={(e) => setUMarcaModelo(e.target.value)}
                    placeholder="Ej. Nissan NP300"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo / Carrocería</label>
                  <input
                    type="text"
                    value={uTipo}
                    onChange={(e) => setUTipo(e.target.value)}
                    placeholder="Ej. Caja seca / Refrigerada / Pickup"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Serie / VIN</label>
                  <input
                    type="text"
                    value={uSerie}
                    onChange={(e) => setUSerie(e.target.value)}
                    placeholder="17 dígitos"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Chofer base asignado</label>
                  <select
                    value={uChoferDefaultId}
                    onChange={(e) => setUChoferDefaultId(e.target.value)}
                    className={claseCampo}
                  >
                    <option value="">-- Sin chofer fijo --</option>
                    {choferes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Aseguradora</label>
                  <input
                    type="text"
                    value={uAseguradora}
                    onChange={(e) => setUAseguradora(e.target.value)}
                    placeholder="Ej. Quálitas"
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">No. Póliza</label>
                  <input
                    type="text"
                    value={uPoliza}
                    onChange={(e) => setUPoliza(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Vencimiento Seguro</label>
                  <input
                    type="date"
                    value={uSeguroVence}
                    onChange={(e) => setUSeguroVence(e.target.value)}
                    className={claseCampo}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Folio Tarjeta Circulación</label>
                  <input
                    type="text"
                    value={uTarjetaFolio}
                    onChange={(e) => setUTarjetaFolio(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Vencimiento Tarjeta</label>
                  <input
                    type="date"
                    value={uTarjetaVence}
                    onChange={(e) => setUTarjetaVence(e.target.value)}
                    className={claseCampo}
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2">
                <p className="text-xs font-bold text-amber-400">
                  Evidencia fotográfica de la unidad y documentos
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      ['frente', 'Frente'],
                      ['trasera', 'Parte trasera'],
                      ['costadoIzq', 'Costado izquierdo'],
                      ['costadoDer', 'Costado derecho'],
                      ['tarjetaCirculacion', 'Tarjeta circulación'],
                      ['polizaSeguro', 'Póliza seguro'],
                    ] as const
                  ).map(([campo, etiqueta]) => {
                    const imgActual = uFotos[campo];
                    return (
                      <div
                        key={campo}
                        className="border border-slate-800 bg-slate-950/70 rounded-xl p-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span>{etiqueta}</span>
                          {imgActual && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUFotos((prev) => ({ ...prev, [campo]: undefined }));
                              }}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {imgActual ? (
                          <img
                            src={imgActual}
                            alt={etiqueta}
                            onClick={(e) => {
                              e.stopPropagation();
                              setImagenAmpliada({
                                titulo: `${uNombre || 'Unidad'} — ${etiqueta}`,
                                src: imgActual,
                              });
                            }}
                            className="w-full h-20 object-cover rounded-lg border border-slate-700 cursor-zoom-in hover:opacity-90 transition"
                          />
                        ) : (
                          <label className="h-20 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-[11px] text-slate-400 hover:border-amber-500 hover:text-amber-300 cursor-pointer transition">
                            <Camera className="w-4 h-4 mb-1" />
                            <span>Subir / Foto</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleSubirFotoUnidad(campo, e)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalUnidadAbierto(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{guardandoUnidad ? 'Guardando...' : 'Guardar Unidad'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {unidadQr && (
        <div
          onClick={() => setUnidadQr(null)}
          className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl text-slate-100"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">QR de Unidad</h3>
                <p className="text-xs text-amber-400 font-semibold">{unidadQr.nombre}</p>
              </div>
              <button
                type="button"
                onClick={() => setUnidadQr(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col items-center text-center space-y-4">
              <div className="bg-white p-3 rounded-2xl shadow">
                <img
                  src={imgQrApi}
                  alt={`QR ${unidadQr.nombre}`}
                  className="w-56 h-56 object-contain"
                />
              </div>

              <p className="text-xs text-slate-400">
                Al escanear este QR desde el celular, abrirá directo el Portal del Chofer con{' '}
                <strong className="text-white">{unidadQr.nombre}</strong> seleccionada.
              </p>

              <div className="grid grid-cols-2 gap-2 w-full">
                <a
                  href={imgQrApi}
                  download={`QR-${unidadQr.nombre.replace(/\s+/g, '-')}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar QR</span>
                </a>
                <Link
                  href={`/chofer?unidad=${unidadQr.id}`}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir Portal</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalChoferAbierto && (
        <div
          onClick={() => setModalChoferAbierto(false)}
          className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={guardarChofer}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl text-slate-100"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <h3 className="font-bold text-base">
                {choferEditando ? `Chofer: ${choferEditando.nombre}` : 'Registrar Nuevo Chofer'}
              </h3>
              <button
                type="button"
                onClick={() => setModalChoferAbierto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    required
                    value={cNombre}
                    onChange={(e) => setCNombre(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={cTelefono}
                    onChange={(e) => setCTelefono(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Unidad base asignada</label>
                  <select
                    value={cUnidadAsignadaId}
                    onChange={(e) => setCUnidadAsignadaId(e.target.value)}
                    className={claseCampo}
                  >
                    <option value="">-- Sin unidad fija --</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Folio INE</label>
                  <input
                    type="text"
                    value={cIneFolio}
                    onChange={(e) => setCIneFolio(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">No. Licencia</label>
                  <input
                    type="text"
                    value={cLicenciaNumero}
                    onChange={(e) => setCLicenciaNumero(e.target.value)}
                    className={claseCampo}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo Licencia</label>
                  <input
                    type="text"
                    value={cLicenciaTipo}
                    onChange={(e) => setCLicenciaTipo(e.target.value)}
                    placeholder="Ej. Chofer / Federal B"
                    className={claseCampo}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">Vencimiento Licencia</label>
                  <input
                    type="date"
                    value={cLicenciaVence}
                    onChange={(e) => setCLicenciaVence(e.target.value)}
                    className={claseCampo}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 border-t border-slate-800 pt-3">
                {(
                  [
                    ['perfil', 'Foto perfil', cFotoPerfil, () => setCFotoPerfil('')],
                    ['licencia', 'Foto licencia', cFotoLicencia, () => setCFotoLicencia('')],
                    ['ine', 'Foto INE', cFotoIne, () => setCFotoIne('')],
                  ] as const
                ).map(([campo, etiqueta, valor, limpiar]) => (
                  <div
                    key={campo}
                    className="border border-slate-800 bg-slate-950/70 rounded-xl p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span>{etiqueta}</span>
                      {valor && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            limpiar();
                          }}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {valor ? (
                      <img
                        src={valor}
                        alt={etiqueta}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagenAmpliada({
                            titulo: `${cNombre || 'Chofer'} — ${etiqueta}`,
                            src: valor,
                          });
                        }}
                        className="w-full h-20 object-cover rounded-lg border border-slate-700 cursor-zoom-in hover:opacity-90 transition"
                      />
                    ) : (
                      <label className="h-20 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-[11px] text-slate-400 hover:border-amber-500 cursor-pointer">
                        <Camera className="w-4 h-4 mb-1" />
                        <span>Subir</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleSubirFotoChofer(campo, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalChoferAbierto(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoChofer}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{guardandoChofer ? 'Guardando...' : 'Guardar Chofer'}</span>
                </button>
              </div>
            </div>
          </form>
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