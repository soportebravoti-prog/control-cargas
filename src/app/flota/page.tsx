'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db, Unidad, Chofer } from '@/lib/firebase';
import { BotonTema, useTemaApp } from '@/components/BotonTema';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Car,
  Users,
  Home,
  Search,
  Pencil,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  IdCard,
  Camera,
  Trash2,
  ZoomIn,
  Upload,
} from 'lucide-react';

type EstadoVigencia = 'SIN_FECHA' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

function evaluarVigencia(
  fechaIso: string | undefined,
  esOscuro: boolean
): {
  estado: EstadoVigencia;
  etiqueta: string;
  clase: string;
} {
  if (!fechaIso) {
    return {
      estado: 'SIN_FECHA',
      etiqueta: 'Sin fecha',
      clase: esOscuro
        ? 'bg-slate-800 text-slate-400 border-slate-700'
        : 'bg-slate-100 text-slate-600 border-slate-300',
    };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [y, m, d] = fechaIso.split('-').map(Number);
  if (!y || !m || !d) {
    return {
      estado: 'SIN_FECHA',
      etiqueta: fechaIso,
      clase: esOscuro
        ? 'bg-slate-800 text-slate-400 border-slate-700'
        : 'bg-slate-100 text-slate-600 border-slate-300',
    };
  }

  const fechaObj = new Date(y, m - 1, d);
  fechaObj.setHours(0, 0, 0, 0);

  const diffDias = Math.ceil((fechaObj.getTime() - hoy.getTime()) / 86400000);

  if (diffDias < 0) {
    return {
      estado: 'VENCIDA',
      etiqueta: `Vencida (${fechaIso})`,
      clase: esOscuro
        ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
        : 'bg-rose-50 text-rose-700 border-rose-300',
    };
  }

  if (diffDias <= 30) {
    return {
      estado: 'POR_VENCER',
      etiqueta: `Vence en ${diffDias}d (${fechaIso})`,
      clase: esOscuro
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
        : 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }

  return {
    estado: 'VIGENTE',
    etiqueta: `Vigente (${fechaIso})`,
    clase: esOscuro
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : 'bg-emerald-50 text-emerald-700 border-emerald-300',
  };
}

function unidadTienePendientes(u: Unidad): boolean {
  return (
    !u.tipoUnidad?.trim() ||
    !u.placas?.trim() ||
    !u.aseguradora?.trim() ||
    !u.vencimientoSeguro?.trim() ||
    !u.vencimientoTarjeta?.trim()
  );
}

function choferTienePendientes(c: Chofer): boolean {
  return (
    !c.telefono?.trim() ||
    !c.numeroLicencia?.trim() ||
    !c.vencimientoLicencia?.trim()
  );
}

function obtenerIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'CH';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function comprimirImagen(file: File, maxDim = 900, calidad = 0.72): Promise<string> {
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
      img.onerror = () => reject(new Error('Archivo de imagen inválido'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

interface SlotFotoProps {
  etiqueta: string;
  valor: string;
  esOscuro: boolean;
  onCambiar: (nuevaDataUrl: string) => void;
  onAmpliar: (titulo: string, src: string) => void;
}

function SlotFoto({ etiqueta, valor, esOscuro, onCambiar, onAmpliar }: SlotFotoProps) {
  const [procesando, setProcesando] = useState(false);

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProcesando(true);
      const comprimida = await comprimirImagen(file);
      onCambiar(comprimida);
    } finally {
      setProcesando(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`border rounded-xl p-2.5 flex flex-col gap-2 ${
        esOscuro ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={`text-[11px] font-bold truncate ${
            esOscuro ? 'text-slate-300' : 'text-slate-700'
          }`}
        >
          {etiqueta}
        </span>
        {valor && (
          <button
            type="button"
            onClick={() => onCambiar('')}
            title="Quitar foto"
            className="text-slate-400 hover:text-rose-500 p-0.5 rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {valor ? (
        <div
          className={`relative group h-24 rounded-lg overflow-hidden border ${
            esOscuro ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
          }`}
        >
          <img src={valor} alt={etiqueta} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onAmpliar(etiqueta, valor)}
              className="bg-slate-900/90 text-white p-1.5 rounded-lg border border-slate-600 hover:border-amber-400"
              title="Ver en grande"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <label
              className="bg-amber-600 text-white p-1.5 rounded-lg cursor-pointer hover:bg-amber-500"
              title="Cambiar foto"
            >
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                onChange={handleArchivo}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : (
        <label
          className={`h-24 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
            esOscuro
              ? 'border-slate-700 hover:border-amber-500/70 bg-slate-900/60 text-slate-400 hover:text-amber-300'
              : 'border-slate-300 hover:border-amber-500 bg-white text-slate-500 hover:text-amber-700'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[11px] font-semibold">
            {procesando ? 'Procesando...' : 'Subir foto'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleArchivo}
            disabled={procesando}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

export default function FlotaPage() {
  const tema = useTemaApp();
  const esOscuro = tema === 'dark';

  const [pestana, setPestana] = useState<'unidades' | 'choferes'>('unidades');
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [busqueda, setBusqueda] = useState('');

  const [fotoAmpliada, setFotoAmpliada] = useState<{ titulo: string; src: string } | null>(null);

  const [unidadEditando, setUnidadEditando] = useState<Unidad | null>(null);
  const [formUnidad, setFormUnidad] = useState({
    tipoUnidad: '',
    placas: '',
    serieVin: '',
    marcaModelo: '',
    anio: '',
    estatusOperativo: 'ACTIVA' as 'ACTIVA' | 'MANTENIMIENTO',
    aseguradora: '',
    polizaSeguro: '',
    vencimientoSeguro: '',
    tarjetaCirculacion: '',
    vencimientoTarjeta: '',
    choferDefaultId: '',
    notas: '',
    fotoFrente: '',
    fotoTrasero: '',
    fotoCostadoIzq: '',
    fotoCostadoDer: '',
  });
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  const [choferEditando, setChoferEditando] = useState<Chofer | null>(null);
  const [formChofer, setFormChofer] = useState({
    telefono: '',
    numeroLicencia: '',
    tipoLicencia: '',
    vencimientoLicencia: '',
    unidadAsignadaId: '',
    notas: '',
    fotoPerfil: '',
    fotoLicenciaFrente: '',
    fotoLicenciaReverso: '',
    fotoIneFrente: '',
    fotoIneReverso: '',
  });
  const [procesandoPerfil, setProcesandoPerfil] = useState(false);
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  useEffect(() => {
    const qUnidades = query(collection(db, 'unidades'), where('activo', '==', true));
    const qChoferes = query(collection(db, 'choferes'), where('activo', '==', true));

    const unsubU = onSnapshot(qUnidades, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(lista);
    });

    const unsubC = onSnapshot(qChoferes, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(lista);
    });

    return () => {
      unsubU();
      unsubC();
    };
  }, []);

  const abrirModalUnidad = (u: Unidad) => {
    setUnidadEditando(u);
    setFormUnidad({
      tipoUnidad: u.tipoUnidad || '',
      placas: u.placas || '',
      serieVin: u.serieVin || '',
      marcaModelo: u.marcaModelo || '',
      anio: u.anio || '',
      estatusOperativo: u.estatusOperativo || 'ACTIVA',
      aseguradora: u.aseguradora || '',
      polizaSeguro: u.polizaSeguro || '',
      vencimientoSeguro: u.vencimientoSeguro || '',
      tarjetaCirculacion: u.tarjetaCirculacion || '',
      vencimientoTarjeta: u.vencimientoTarjeta || '',
      choferDefaultId: u.choferDefaultId || '',
      notas: u.notas || '',
      fotoFrente: u.fotoFrente || '',
      fotoTrasero: u.fotoTrasero || '',
      fotoCostadoIzq: u.fotoCostadoIzq || '',
      fotoCostadoDer: u.fotoCostadoDer || '',
    });
  };

  const guardarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadEditando || guardandoUnidad) return;

    try {
      setGuardandoUnidad(true);
      await updateDoc(doc(db, 'unidades', unidadEditando.id), {
        tipoUnidad: formUnidad.tipoUnidad.trim(),
        placas: formUnidad.placas.trim().toUpperCase(),
        serieVin: formUnidad.serieVin.trim().toUpperCase(),
        marcaModelo: formUnidad.marcaModelo.trim(),
        anio: formUnidad.anio.trim(),
        estatusOperativo: formUnidad.estatusOperativo,
        aseguradora: formUnidad.aseguradora.trim(),
        polizaSeguro: formUnidad.polizaSeguro.trim(),
        vencimientoSeguro: formUnidad.vencimientoSeguro,
        tarjetaCirculacion: formUnidad.tarjetaCirculacion.trim(),
        vencimientoTarjeta: formUnidad.vencimientoTarjeta,
        choferDefaultId: formUnidad.choferDefaultId,
        notas: formUnidad.notas.trim(),
        fotoFrente: formUnidad.fotoFrente,
        fotoTrasero: formUnidad.fotoTrasero,
        fotoCostadoIzq: formUnidad.fotoCostadoIzq,
        fotoCostadoDer: formUnidad.fotoCostadoDer,
      });
      setUnidadEditando(null);
    } finally {
      setGuardandoUnidad(false);
    }
  };

  const abrirModalChofer = (c: Chofer) => {
    setChoferEditando(c);
    setFormChofer({
      telefono: c.telefono || '',
      numeroLicencia: c.numeroLicencia || '',
      tipoLicencia: c.tipoLicencia || '',
      vencimientoLicencia: c.vencimientoLicencia || '',
      unidadAsignadaId: c.unidadAsignadaId || '',
      notas: c.notas || '',
      fotoPerfil: c.fotoPerfil || '',
      fotoLicenciaFrente: c.fotoLicenciaFrente || '',
      fotoLicenciaReverso: c.fotoLicenciaReverso || '',
      fotoIneFrente: c.fotoIneFrente || '',
      fotoIneReverso: c.fotoIneReverso || '',
    });
  };

  const handleFotoPerfilArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProcesandoPerfil(true);
      const comprimida = await comprimirImagen(file, 600, 0.78);
      setFormChofer((prev) => ({ ...prev, fotoPerfil: comprimida }));
    } finally {
      setProcesandoPerfil(false);
      e.target.value = '';
    }
  };

  const guardarChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choferEditando || guardandoChofer) return;

    try {
      setGuardandoChofer(true);
      await updateDoc(doc(db, 'choferes', choferEditando.id), {
        telefono: formChofer.telefono.trim(),
        numeroLicencia: formChofer.numeroLicencia.trim().toUpperCase(),
        tipoLicencia: formChofer.tipoLicencia.trim().toUpperCase(),
        vencimientoLicencia: formChofer.vencimientoLicencia,
        unidadAsignadaId: formChofer.unidadAsignadaId,
        notas: formChofer.notas.trim(),
        fotoPerfil: formChofer.fotoPerfil,
        fotoLicenciaFrente: formChofer.fotoLicenciaFrente,
        fotoLicenciaReverso: formChofer.fotoLicenciaReverso,
        fotoIneFrente: formChofer.fotoIneFrente,
        fotoIneReverso: formChofer.fotoIneReverso,
      });
      setChoferEditando(null);
    } finally {
      setGuardandoChofer(false);
    }
  };

  const unidadesConPendientes = useMemo(
    () => unidades.filter(unidadTienePendientes).length,
    [unidades]
  );

  const licenciasAlerta = useMemo(
    () =>
      choferes.filter((c) => {
        const v = evaluarVigencia(c.vencimientoLicencia, esOscuro).estado;
        return v === 'VENCIDA' || v === 'POR_VENCER' || choferTienePendientes(c);
      }).length,
    [choferes, esOscuro]
  );

  const texto = busqueda.trim().toLowerCase();

  const unidadesFiltradas = useMemo(() => {
    if (!texto) return unidades;
    return unidades.filter((u) => {
      return (
        u.nombre.toLowerCase().includes(texto) ||
        (u.placas || '').toLowerCase().includes(texto) ||
        (u.tipoUnidad || '').toLowerCase().includes(texto) ||
        (u.aseguradora || '').toLowerCase().includes(texto) ||
        (u.polizaSeguro || '').toLowerCase().includes(texto)
      );
    });
  }, [unidades, texto]);

  const choferesFiltrados = useMemo(() => {
    if (!texto) return choferes;
    return choferes.filter((c) => {
      return (
        c.nombre.toLowerCase().includes(texto) ||
        (c.telefono || '').toLowerCase().includes(texto) ||
        (c.numeroLicencia || '').toLowerCase().includes(texto) ||
        (c.tipoLicencia || '').toLowerCase().includes(texto)
      );
    });
  }, [choferes, texto]);

  const claseInputModal = esOscuro
    ? 'w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-white outline-none focus:border-amber-500'
    : 'w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-amber-500';

  return (
    <div
      className={`min-h-screen pb-14 transition-colors ${
        esOscuro ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      <header
        className={`border-b px-4 sm:px-6 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 transition-colors ${
          esOscuro
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            title="Volver al menú principal"
            className={`border p-2.5 rounded-xl transition ${
              esOscuro
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <Home className="w-5 h-5" />
          </Link>

          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className={`w-10 h-10 rounded-xl object-contain p-1 border ${
              esOscuro ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}
          />

          <div>
            <h1
              className={`text-lg sm:text-xl font-bold tracking-tight ${
                esOscuro ? 'text-white' : 'text-slate-900'
              }`}
            >
              Control de Flota — Encargado de Autos
            </h1>
            <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
              Expediente fotográfico, seguros, tarjetas de circulación, licencias e INE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end max-w-md">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar unidad, placa, chofer..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`w-full border focus:border-amber-500 rounded-xl pl-10 pr-4 py-2 text-sm outline-none ${
                esOscuro
                  ? 'bg-slate-950 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <BotonTema />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Métricas rápidas */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            className={`border rounded-2xl p-4 flex items-center justify-between ${
              esOscuro
                ? 'bg-slate-900/80 border-slate-800'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div>
              <p
                className={`text-xs font-semibold uppercase ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Unidades Activas
              </p>
              <p className="text-2xl font-bold mt-0.5">{unidades.length}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
              <Car className="w-5 h-5" />
            </div>
          </div>

          <div
            className={`border rounded-2xl p-4 flex items-center justify-between ${
              esOscuro
                ? 'bg-slate-900/80 border-slate-800'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div>
              <p
                className={`text-xs font-semibold uppercase ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Datos / Docs por Completar
              </p>
              <p
                className={`text-2xl font-bold mt-0.5 ${
                  esOscuro ? 'text-amber-300' : 'text-amber-600'
                }`}
              >
                {unidadesConPendientes}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div
            className={`border rounded-2xl p-4 flex items-center justify-between ${
              esOscuro
                ? 'bg-slate-900/80 border-slate-800'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div>
              <p
                className={`text-xs font-semibold uppercase ${
                  esOscuro ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Choferes (Licencia / INE)
              </p>
              <p className="text-2xl font-bold mt-0.5">
                {choferes.length}{' '}
                <span
                  className={`text-xs font-semibold ${
                    esOscuro ? 'text-amber-300' : 'text-amber-600'
                  }`}
                >
                  ({licenciasAlerta} por revisar)
                </span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-500">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Selector de pestañas */}
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setPestana('unidades')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition border ${
              pestana === 'unidades'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : esOscuro
                ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Car className="w-4 h-4" />
            Unidades ({unidades.length})
          </button>

          <button
            type="button"
            onClick={() => setPestana('choferes')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition border ${
              pestana === 'choferes'
                ? 'bg-amber-600 text-white border-amber-500 shadow'
                : esOscuro
                ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Choferes ({choferes.length})
          </button>
        </div>

        {/* Pestaña de Unidades */}
        {pestana === 'unidades' && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unidadesFiltradas.length === 0 ? (
              <div
                className={`col-span-full border border-dashed rounded-2xl p-10 text-center ${
                  esOscuro
                    ? 'bg-slate-900/70 border-slate-800 text-slate-400'
                    : 'bg-white border-slate-300 text-slate-500'
                }`}
              >
                No hay unidades que coincidan con la búsqueda.
              </div>
            ) : (
              unidadesFiltradas.map((u) => {
                const seguro = evaluarVigencia(u.vencimientoSeguro, esOscuro);
                const tarjeta = evaluarVigencia(u.vencimientoTarjeta, esOscuro);
                const incompleta = unidadTienePendientes(u);
                const choferAsignado = choferes.find((c) => c.id === u.choferDefaultId);

                const fotosUnidad = [
                  { label: 'Frente', src: u.fotoFrente },
                  { label: 'Trasero', src: u.fotoTrasero },
                  { label: 'Costado Izq.', src: u.fotoCostadoIzq },
                  { label: 'Costado Der.', src: u.fotoCostadoDer },
                ].filter((f) => Boolean(f.src));

                return (
                  <div
                    key={u.id}
                    className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow ${
                      esOscuro
                        ? 'bg-slate-900/90 border-slate-800'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold">{u.nombre}</h2>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                                u.estatusOperativo === 'MANTENIMIENTO'
                                  ? esOscuro
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                    : 'bg-rose-50 text-rose-700 border-rose-300'
                                  : esOscuro
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              }`}
                            >
                              {u.estatusOperativo === 'MANTENIMIENTO' ? 'Mantenimiento' : 'Activa'}
                            </span>
                          </div>
                          <p
                            className={`text-xs mt-0.5 ${
                              esOscuro ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {u.tipoUnidad || 'Tipo sin especificar'}{' '}
                            {u.marcaModelo ? `• ${u.marcaModelo}` : ''}{' '}
                            {u.anio ? `(${u.anio})` : ''}
                          </p>
                        </div>

                        {incompleta ? (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                              esOscuro
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            Por completar
                          </span>
                        ) : (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1 ${
                              esOscuro
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Completo
                          </span>
                        )}
                      </div>

                      {fotosUnidad.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          {fotosUnidad.map((f) => (
                            <button
                              key={f.label}
                              type="button"
                              onClick={() =>
                                setFotoAmpliada({
                                  titulo: `${u.nombre} — ${f.label}`,
                                  src: f.src!,
                                })
                              }
                              className={`group relative h-14 rounded-lg overflow-hidden border ${
                                esOscuro
                                  ? 'border-slate-700 bg-slate-950'
                                  : 'border-slate-300 bg-slate-100'
                              }`}
                              title={`Ver ${f.label}`}
                            >
                              <img
                                src={f.src}
                                alt={f.label}
                                className="w-full h-full object-cover group-hover:scale-105 transition"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[9px] font-bold text-slate-200 px-1 truncate">
                                {f.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div
                          className={`text-[11px] border border-dashed rounded-xl py-2 px-3 flex items-center gap-1.5 ${
                            esOscuro
                              ? 'text-slate-500 bg-slate-950/60 border-slate-800'
                              : 'text-slate-500 bg-slate-50 border-slate-300'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Sin fotos de frente, trasero ni costados
                        </div>
                      )}

                      <div
                        className={`border rounded-xl p-3 text-xs space-y-1.5 ${
                          esOscuro
                            ? 'bg-slate-950/75 border-slate-800'
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
                          <span className="font-semibold truncate max-w-[180px]">
                            {u.serieVin || 'Sin registrar'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className={esOscuro ? 'text-slate-400' : 'text-slate-500'}>
                            Chofer base:
                          </span>
                          <span className="font-semibold truncate max-w-[180px]">
                            {choferAsignado ? choferAsignado.nombre : 'Sin asignar'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              esOscuro ? 'text-slate-400' : 'text-slate-600'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-sky-500" />
                            Seguro ({u.aseguradora || 'Sin aseguradora'}):
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${seguro.clase}`}
                          >
                            {seguro.etiqueta}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className={esOscuro ? 'text-slate-400' : 'text-slate-600'}>
                            Tarjeta ({u.tarjetaCirculacion || 'Sin folio'}):
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${tarjeta.clase}`}
                          >
                            {tarjeta.etiqueta}
                          </span>
                        </div>
                      </div>

                      {u.notas && (
                        <p
                          className={`text-xs border rounded-lg p-2.5 ${
                            esOscuro
                              ? 'text-slate-400 bg-slate-950/50 border-slate-800/80'
                              : 'text-slate-600 bg-slate-50 border-slate-200'
                          }`}
                        >
                          {u.notas}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirModalUnidad(u)}
                      className={`w-full border font-bold py-2.5 px-4 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition ${
                        esOscuro
                          ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-900 text-white'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-400" />
                      Completar / Editar Expediente y Fotos
                    </button>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* Pestaña de Choferes */}
        {pestana === 'choferes' && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {choferesFiltrados.length === 0 ? (
              <div
                className={`col-span-full border border-dashed rounded-2xl p-10 text-center ${
                  esOscuro
                    ? 'bg-slate-900/70 border-slate-800 text-slate-400'
                    : 'bg-white border-slate-300 text-slate-500'
                }`}
              >
                No hay choferes que coincidan con la búsqueda.
              </div>
            ) : (
              choferesFiltrados.map((c) => {
                const licencia = evaluarVigencia(c.vencimientoLicencia, esOscuro);
                const incompleto = choferTienePendientes(c);
                const unidadBase = unidades.find((u) => u.id === c.unidadAsignadaId);

                const docsChofer = [
                  { label: 'Lic. Frente', src: c.fotoLicenciaFrente },
                  { label: 'Lic. Reverso', src: c.fotoLicenciaReverso },
                  { label: 'INE Frente', src: c.fotoIneFrente },
                  { label: 'INE Reverso', src: c.fotoIneReverso },
                ].filter((f) => Boolean(f.src));

                return (
                  <div
                    key={c.id}
                    className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow ${
                      esOscuro
                        ? 'bg-slate-900/90 border-slate-800'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Encabezado de tarjeta con foto de rostro al lado del nombre */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {c.fotoPerfil ? (
                            <button
                              type="button"
                              onClick={() =>
                                setFotoAmpliada({
                                  titulo: `Foto de perfil — ${c.nombre}`,
                                  src: c.fotoPerfil!,
                                })
                              }
                              title="Ver foto en grande"
                              className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-500/70 shadow shrink-0 group relative"
                            >
                              <img
                                src={c.fotoPerfil}
                                alt={c.nombre}
                                className="w-full h-full object-cover group-hover:scale-105 transition"
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => abrirModalChofer(c)}
                              title="Agregar foto de rostro"
                              className={`w-14 h-14 rounded-full border-2 border-dashed flex flex-col items-center justify-center shrink-0 transition ${
                                esOscuro
                                  ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-amber-500'
                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:border-amber-500'
                              }`}
                            >
                              <span className="text-xs font-extrabold leading-none">
                                {obtenerIniciales(c.nombre)}
                              </span>
                              <Camera className="w-3 h-3 mt-0.5 text-amber-500" />
                            </button>
                          )}

                          <div className="min-w-0">
                            <h2 className="text-base sm:text-lg font-bold leading-snug break-words">
                              {c.nombre}
                            </h2>
                            <p
                              className={`text-xs mt-0.5 ${
                                esOscuro ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              Tel: {c.telefono || 'Sin teléfono'}
                            </p>
                          </div>
                        </div>

                        {incompleto ? (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                              esOscuro
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            Por completar
                          </span>
                        ) : (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1 ${
                              esOscuro
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Completo
                          </span>
                        )}
                      </div>

                      {docsChofer.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          {docsChofer.map((d) => (
                            <button
                              key={d.label}
                              type="button"
                              onClick={() =>
                                setFotoAmpliada({
                                  titulo: `${c.nombre} — ${d.label}`,
                                  src: d.src!,
                                })
                              }
                              className={`group relative h-14 rounded-lg overflow-hidden border ${
                                esOscuro
                                  ? 'border-slate-700 bg-slate-950'
                                  : 'border-slate-300 bg-slate-100'
                              }`}
                              title={`Ver ${d.label}`}
                            >
                              <img
                                src={d.src}
                                alt={d.label}
                                className="w-full h-full object-cover group-hover:scale-105 transition"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[9px] font-bold text-slate-200 px-1 truncate">
                                {d.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div
                          className={`text-[11px] border border-dashed rounded-xl py-2 px-3 flex items-center gap-1.5 ${
                            esOscuro
                              ? 'text-slate-500 bg-slate-950/60 border-slate-800'
                              : 'text-slate-500 bg-slate-50 border-slate-300'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Sin fotos de licencia ni INE
                        </div>
                      )}

                      <div
                        className={`border rounded-xl p-3 text-xs space-y-1.5 ${
                          esOscuro
                            ? 'bg-slate-950/75 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              esOscuro ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            <IdCard className="w-3.5 h-3.5 text-sky-500" />
                            Licencia:
                          </span>
                          <span className="font-bold">
                            {c.numeroLicencia || 'Sin folio'}{' '}
                            {c.tipoLicencia ? `(${c.tipoLicencia})` : ''}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className={esOscuro ? 'text-slate-400' : 'text-slate-500'}>
                            Unidad asignada:
                          </span>
                          <span className="font-semibold truncate max-w-[180px]">
                            {unidadBase ? unidadBase.nombre : 'Sin asignar'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className={esOscuro ? 'text-slate-400' : 'text-slate-600'}>
                          Vigencia licencia:
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${licencia.clase}`}
                        >
                          {licencia.etiqueta}
                        </span>
                      </div>

                      {c.notas && (
                        <p
                          className={`text-xs border rounded-lg p-2.5 ${
                            esOscuro
                              ? 'text-slate-400 bg-slate-950/50 border-slate-800/80'
                              : 'text-slate-600 bg-slate-50 border-slate-200'
                          }`}
                        >
                          {c.notas}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirModalChofer(c)}
                      className={`w-full border font-bold py-2.5 px-4 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition ${
                        esOscuro
                          ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-900 text-white'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-400" />
                      Completar / Editar Chofer y Docs
                    </button>
                  </div>
                );
              })
            )}
          </section>
        )}
      </main>

      {/* Modal: Completar / Editar Unidad */}
      {unidadEditando && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={guardarUnidad}
            className={`border rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto ${
              esOscuro
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div
              className={`border-b px-5 py-4 flex items-center justify-between ${
                esOscuro
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <h3 className="font-bold text-base">
                  Expediente de Unidad — {unidadEditando.nombre}
                </h3>
                <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                  Completa fotos (frente, trasero, costados), placas y documentación
                </p>
              </div>
              <button
                type="button"
                onClick={() => !guardandoUnidad && setUnidadEditando(null)}
                className="text-slate-400 hover:text-amber-500 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto text-sm">
              <div>
                <label
                  className={`block text-xs font-bold uppercase tracking-wide mb-2 ${
                    esOscuro ? 'text-amber-300' : 'text-amber-700'
                  }`}
                >
                  Fotografías de la unidad
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <SlotFoto
                    etiqueta="Frente"
                    valor={formUnidad.fotoFrente}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormUnidad({ ...formUnidad, fotoFrente: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="Trasero"
                    valor={formUnidad.fotoTrasero}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormUnidad({ ...formUnidad, fotoTrasero: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="Costado Izquierdo"
                    valor={formUnidad.fotoCostadoIzq}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormUnidad({ ...formUnidad, fotoCostadoIzq: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="Costado Derecho"
                    valor={formUnidad.fotoCostadoDer}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormUnidad({ ...formUnidad, fotoCostadoDer: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Tipo de unidad</label>
                  <input
                    type="text"
                    placeholder="Ej. Camioneta, Camión, Refrigerada"
                    value={formUnidad.tipoUnidad}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, tipoUnidad: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Estatus operativo</label>
                  <select
                    value={formUnidad.estatusOperativo}
                    onChange={(e) =>
                      setFormUnidad({
                        ...formUnidad,
                        estatusOperativo: e.target.value as 'ACTIVA' | 'MANTENIMIENTO',
                      })
                    }
                    className={claseInputModal}
                  >
                    <option value="ACTIVA">Activa</option>
                    <option value="MANTENIMIENTO">En mantenimiento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Placas</label>
                  <input
                    type="text"
                    placeholder="Ej. VM-1234-A"
                    value={formUnidad.placas}
                    onChange={(e) => setFormUnidad({ ...formUnidad, placas: e.target.value })}
                    className={`${claseInputModal} uppercase`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Número de serie / VIN</label>
                  <input
                    type="text"
                    placeholder="VIN o serie"
                    value={formUnidad.serieVin}
                    onChange={(e) => setFormUnidad({ ...formUnidad, serieVin: e.target.value })}
                    className={`${claseInputModal} uppercase`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Marca y modelo</label>
                  <input
                    type="text"
                    placeholder="Ej. Nissan NP300"
                    value={formUnidad.marcaModelo}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, marcaModelo: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Año</label>
                  <input
                    type="text"
                    placeholder="Ej. 2024"
                    value={formUnidad.anio}
                    onChange={(e) => setFormUnidad({ ...formUnidad, anio: e.target.value })}
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Aseguradora</label>
                  <input
                    type="text"
                    placeholder="Ej. QUALITAS, GNP, AXA"
                    value={formUnidad.aseguradora}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, aseguradora: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Número de póliza</label>
                  <input
                    type="text"
                    placeholder="Folio de póliza"
                    value={formUnidad.polizaSeguro}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, polizaSeguro: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Vencimiento de seguro</label>
                  <input
                    type="date"
                    value={formUnidad.vencimientoSeguro}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, vencimientoSeguro: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Tarjeta de circulación</label>
                  <input
                    type="text"
                    placeholder="Folio / referencia"
                    value={formUnidad.tarjetaCirculacion}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, tarjetaCirculacion: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">
                    Vencimiento tarjeta / refrendo
                  </label>
                  <input
                    type="date"
                    value={formUnidad.vencimientoTarjeta}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, vencimientoTarjeta: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">
                    Chofer asignado por defecto
                  </label>
                  <select
                    value={formUnidad.choferDefaultId}
                    onChange={(e) =>
                      setFormUnidad({ ...formUnidad, choferDefaultId: e.target.value })
                    }
                    className={claseInputModal}
                  >
                    <option value="">Sin asignar</option>
                    {choferes.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Observaciones de flota</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales de la unidad..."
                  value={formUnidad.notas}
                  onChange={(e) => setFormUnidad({ ...formUnidad, notas: e.target.value })}
                  className={`${claseInputModal} resize-none`}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setUnidadEditando(null)}
                  disabled={guardandoUnidad}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${
                    esOscuro
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {guardandoUnidad ? 'Guardando...' : 'Guardar Expediente'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Completar / Editar Chofer */}
      {choferEditando && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={guardarChofer}
            className={`border rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto ${
              esOscuro
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div
              className={`border-b px-5 py-4 flex items-center justify-between ${
                esOscuro
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <h3 className="font-bold text-base">
                  Datos y Documentos — {choferEditando.nombre}
                </h3>
                <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                  Toma foto de perfil, sube Licencia e INE y completa sus datos
                </p>
              </div>
              <button
                type="button"
                onClick={() => !guardandoChofer && setChoferEditando(null)}
                className="text-slate-400 hover:text-amber-500 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto text-sm">
              {/* Foto de rostro / perfil del chofer */}
              <div
                className={`border rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-4 ${
                  esOscuro
                    ? 'bg-slate-950/80 border-slate-800'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  {formChofer.fotoPerfil ? (
                    <div className="relative">
                      <img
                        src={formChofer.fotoPerfil}
                        alt="Foto del chofer"
                        className="w-16 h-16 rounded-full object-cover border-2 border-amber-500 shadow"
                      />
                      <button
                        type="button"
                        onClick={() => setFormChofer({ ...formChofer, fotoPerfil: '' })}
                        title="Quitar foto de perfil"
                        className="absolute -top-1 -right-1 bg-rose-600 text-white p-1 rounded-full shadow hover:bg-rose-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center font-extrabold text-sm ${
                        esOscuro
                          ? 'bg-slate-900 border-slate-700 text-slate-400'
                          : 'bg-white border-slate-300 text-slate-500'
                      }`}
                    >
                      {obtenerIniciales(choferEditando.nombre)}
                    </div>
                  )}

                  <div>
                    <p
                      className={`text-xs font-bold uppercase tracking-wide ${
                        esOscuro ? 'text-amber-300' : 'text-amber-700'
                      }`}
                    >
                      Foto de perfil (rostro)
                    </p>
                    <p className={`text-xs ${esOscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                      Aparece junto al nombre en la tarjeta del chofer
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer inline-flex items-center gap-1.5 shadow-sm transition">
                    <Camera className="w-4 h-4" />
                    <span>{procesandoPerfil ? 'Procesando...' : 'Tomar foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handleFotoPerfilArchivo}
                      disabled={procesandoPerfil}
                      className="hidden"
                    />
                  </label>

                  <label
                    className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer inline-flex items-center gap-1.5 transition ${
                      esOscuro
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Subir</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoPerfilArchivo}
                      disabled={procesandoPerfil}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label
                  className={`block text-xs font-bold uppercase tracking-wide mb-2 ${
                    esOscuro ? 'text-amber-300' : 'text-amber-700'
                  }`}
                >
                  Documentos oficiales (Licencia e INE)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <SlotFoto
                    etiqueta="Licencia (Frente)"
                    valor={formChofer.fotoLicenciaFrente}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormChofer({ ...formChofer, fotoLicenciaFrente: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="Licencia (Reverso)"
                    valor={formChofer.fotoLicenciaReverso}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormChofer({ ...formChofer, fotoLicenciaReverso: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="INE (Frente)"
                    valor={formChofer.fotoIneFrente}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormChofer({ ...formChofer, fotoIneFrente: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                  <SlotFoto
                    etiqueta="INE (Reverso)"
                    valor={formChofer.fotoIneReverso}
                    esOscuro={esOscuro}
                    onCambiar={(v) => setFormChofer({ ...formChofer, fotoIneReverso: v })}
                    onAmpliar={(titulo, src) => setFotoAmpliada({ titulo, src })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="Ej. 9931234567"
                    value={formChofer.telefono}
                    onChange={(e) => setFormChofer({ ...formChofer, telefono: e.target.value })}
                    className={claseInputModal}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Número de licencia</label>
                  <input
                    type="text"
                    placeholder="Folio de licencia"
                    value={formChofer.numeroLicencia}
                    onChange={(e) =>
                      setFormChofer({ ...formChofer, numeroLicencia: e.target.value })
                    }
                    className={`${claseInputModal} uppercase`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Tipo de licencia</label>
                  <input
                    type="text"
                    placeholder="Ej. Tipo B, Federal, Chofer"
                    value={formChofer.tipoLicencia}
                    onChange={(e) =>
                      setFormChofer({ ...formChofer, tipoLicencia: e.target.value })
                    }
                    className={`${claseInputModal} uppercase`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Vencimiento de licencia</label>
                  <input
                    type="date"
                    value={formChofer.vencimientoLicencia}
                    onChange={(e) =>
                      setFormChofer({ ...formChofer, vencimientoLicencia: e.target.value })
                    }
                    className={claseInputModal}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">Unidad asignada</label>
                  <select
                    value={formChofer.unidadAsignadaId}
                    onChange={(e) =>
                      setFormChofer({ ...formChofer, unidadAsignadaId: e.target.value })
                    }
                    className={claseInputModal}
                  >
                    <option value="">Sin unidad asignada</option>
                    {unidades.map((un) => (
                      <option key={un.id} value={un.id}>
                        {un.nombre} {un.placas ? `(${un.placas})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Notas</label>
                <textarea
                  rows={2}
                  placeholder="Observaciones del operador..."
                  value={formChofer.notas}
                  onChange={(e) => setFormChofer({ ...formChofer, notas: e.target.value })}
                  className={`${claseInputModal} resize-none`}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setChoferEditando(null)}
                  disabled={guardandoChofer}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${
                    esOscuro
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoChofer}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {guardandoChofer ? 'Guardando...' : 'Guardar Chofer'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Visor de imagen ampliada */}
      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">{fotoAmpliada.titulo}</span>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-950 flex items-center justify-center p-4 max-h-[80vh]">
              <img
                src={fotoAmpliada.src}
                alt={fotoAmpliada.titulo}
                className="max-h-[72vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}