'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  db,
  coleccion,
  coleccionUsuarios,
  Unidad,
  Chofer,
  PerfilUsuario,
  ModuloApp,
  RolBaseUsuario,
} from '@/lib/firebase';
import { descargarCargasCSV } from '@/lib/exportarCargas';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
} from 'firebase/firestore';
import {
  Home,
  Download,
  Truck,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Power,
  PowerOff,
  ShieldCheck,
  Users,
  KeyRound,
  Fuel,
  Eye,
  EyeOff,
} from 'lucide-react';
import ProteccionModulo from '@/components/ProteccionModulo';
import BarraSesionModulo from '@/components/BarraSesionModulo';

const TODOS_LOS_MODULOS: { id: ModuloApp; etiqueta: string }[] = [
  { id: 'patio', etiqueta: 'Patio' },
  { id: 'monitor', etiqueta: 'Monitor' },
  { id: 'flota', etiqueta: 'Control de Flota' },
  { id: 'chofer', etiqueta: 'Portal Chofer' },
  { id: 'catalogos', etiqueta: 'Catálogos (Admin)' },
];

const ROLES_BASE: RolBaseUsuario[] = [
  'sistemas',
  'admin',
  'patio',
  'monitor',
  'flota',
  'chofer',
];

interface RegistroReporteFlota {
  id: string;
  tipo?: string;
  tipoReporte?: string;
  unidadNombre?: string;
  choferNombre?: string;
  litros?: number | null;
  monto?: number | null;
  kilometraje?: number | null;
  kilometrajeFinal?: number | null;
  kmRecorridos?: number | null;
  fechaIso?: string;
  fechaOperacion?: string;
  horaTexto?: string;
}

function CatalogosContenido() {
  const [pestana, setPestana] = useState<'catalogos' | 'usuarios' | 'pin' | 'bitacora'>(
    'catalogos'
  );

  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [reportesFlota, setReportesFlota] = useState<RegistroReporteFlota[]>([]);

  // Reporte CSV / Excel
  const [hoy, setHoy] = useState('');
  const [esLocal, setEsLocal] = useState(false);
  const [fechaDescarga, setFechaDescarga] = useState('');
  const [descargando, setDescargando] = useState(false);

  // Crear nueva unidad
  const [nombreUnidad, setNombreUnidad] = useState('');
  const [placasUnidad, setPlacasUnidad] = useState('');
  const [choferDefaultId, setChoferDefaultId] = useState('');
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  // Editar unidad existente
  const [editUnidadId, setEditUnidadId] = useState<string | null>(null);
  const [editNombreUnidad, setEditNombreUnidad] = useState('');
  const [editPlacasUnidad, setEditPlacasUnidad] = useState('');
  const [editChoferDefaultId, setEditChoferDefaultId] = useState('');

  // Crear nuevo chofer
  const [nombreChofer, setNombreChofer] = useState('');
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  // Editar chofer existente
  const [editChoferId, setEditChoferId] = useState<string | null>(null);
  const [editNombreChofer, setEditNombreChofer] = useState('');

  // --- Usuarios y Permisos ---
  const [uNombre, setUNombre] = useState('');
  const [uCorreo, setUCorreo] = useState('');
  const [uUidAuth, setUUidAuth] = useState('');
  const [uRolBase, setURolBase] = useState<RolBaseUsuario>('patio');
  const [uModulos, setUModulos] = useState<ModuloApp[]>(['patio']);
  const [uPin, setUPin] = useState('');
  const [uChoferId, setUChoferId] = useState('');
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  const [editUsuarioId, setEditUsuarioId] = useState<string | null>(null);
  const [editUModulos, setEditUModulos] = useState<ModuloApp[]>([]);
  const [editURolBase, setEditURolBase] = useState<RolBaseUsuario>('patio');
  const [editUPin, setEditUPin] = useState('');
  const [editUChoferId, setEditUChoferId] = useState('');

  // --- PIN global para acciones críticas (cancelaciones) ---
  const [pinCancelacion, setPinCancelacion] = useState('1234');
  const [mostrarPin, setMostrarPin] = useState(false);
  const [guardandoPin, setGuardandoPin] = useState(false);
  const [avisoPin, setAvisoPin] = useState<string | null>(null);

  useEffect(() => {
    const fechaHoy = new Date().toLocaleDateString('en-CA');
    setHoy(fechaHoy);
    setFechaDescarga(fechaHoy);

    const host = window.location.hostname;
    setEsLocal(host === 'localhost' || host === '127.0.0.1');

    const unsubU = onSnapshot(query(collection(db, coleccion('unidades'))), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Unidad));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setUnidades(list);
    });

    const unsubCh = onSnapshot(query(collection(db, coleccion('choferes'))), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chofer));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setChoferes(list);
    });

    const unsubUsr = onSnapshot(query(collection(db, coleccionUsuarios())), (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Partial<PerfilUsuario>;
        return {
          uid: data.uid || d.id,
          nombre: data.nombre || data.correo || d.id,
          correo: data.correo || '',
          rolBase: data.rolBase || 'patio',
          modulos: Array.isArray(data.modulos) ? data.modulos : [],
          pin: data.pin || '',
          activo: data.activo !== false,
          choferId: data.choferId || null,
          unidadId: data.unidadId || null,
          creadoEn: data.creadoEn,
          actualizadoEn: data.actualizadoEn,
        } as PerfilUsuario;
      });
      list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setUsuarios(list);
    });

    const unsubRep = onSnapshot(query(collection(db, coleccion('reportes_flota'))), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegistroReporteFlota));
      list.sort((a, b) =>
        (b.fechaOperacion || b.fechaIso || '').localeCompare(a.fechaOperacion || a.fechaIso || '')
      );
      setReportesFlota(list.slice(0, 60));
    });

    const unsubSeg = onSnapshot(doc(db, coleccion('configuracion'), 'seguridad'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { pinCancelacion?: string };
        if (data.pinCancelacion) {
          setPinCancelacion(data.pinCancelacion);
        }
      }
    });

    return () => {
      unsubU();
      unsubCh();
      unsubUsr();
      unsubRep();
      unsubSeg();
    };
  }, []);

  const handleDescargar = async () => {
    if (!fechaDescarga || descargando) return;
    setDescargando(true);
    await descargarCargasCSV(fechaDescarga);
    setDescargando(false);
  };

  // --- CRUD VEHÍCULOS / UNIDADES ---
  const crearUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = nombreUnidad.trim();
    if (!limpio) return;

    setGuardandoUnidad(true);
    await addDoc(collection(db, coleccion('unidades')), {
      nombre: limpio,
      placas: placasUnidad.trim().toUpperCase(),
      choferDefaultId: choferDefaultId || '',
      activo: true,
    });
    setNombreUnidad('');
    setPlacasUnidad('');
    setChoferDefaultId('');
    setGuardandoUnidad(false);
  };

  const empezarEditarUnidad = (u: Unidad) => {
    setEditUnidadId(u.id);
    setEditNombreUnidad(u.nombre);
    setEditPlacasUnidad(u.placas || '');
    setEditChoferDefaultId(u.choferDefaultId || '');
  };

  const guardarEdicionUnidad = async (unidadId: string) => {
    const limpio = editNombreUnidad.trim();
    if (!limpio) return;

    await updateDoc(doc(db, coleccion('unidades'), unidadId), {
      nombre: limpio,
      placas: editPlacasUnidad.trim().toUpperCase(),
      choferDefaultId: editChoferDefaultId || '',
    });
    setEditUnidadId(null);
  };

  const toggleActivoUnidad = async (u: Unidad) => {
    await updateDoc(doc(db, coleccion('unidades'), u.id), {
      activo: !u.activo,
    });
  };

  const eliminarUnidad = async (u: Unidad) => {
    const ok = window.confirm(`¿Eliminar definitivamente el vehículo "${u.nombre}"?`);
    if (!ok) return;
    await deleteDoc(doc(db, coleccion('unidades'), u.id));
  };

  // --- CRUD CHOFERES ---
  const crearChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = nombreChofer.trim();
    if (!limpio) return;

    setGuardandoChofer(true);
    await addDoc(collection(db, coleccion('choferes')), {
      nombre: limpio,
      activo: true,
    });
    setNombreChofer('');
    setGuardandoChofer(false);
  };

  const empezarEditarChofer = (c: Chofer) => {
    setEditChoferId(c.id);
    setEditNombreChofer(c.nombre);
  };

  const guardarEdicionChofer = async (choferId: string) => {
    const limpio = editNombreChofer.trim();
    if (!limpio) return;

    await updateDoc(doc(db, coleccion('choferes'), choferId), {
      nombre: limpio,
    });
    setEditChoferId(null);
  };

  const toggleActivoChofer = async (c: Chofer) => {
    await updateDoc(doc(db, coleccion('choferes'), c.id), {
      activo: !c.activo,
    });
  };

  const eliminarChofer = async (c: Chofer) => {
    const ok = window.confirm(`¿Eliminar definitivamente al chofer "${c.nombre}"?`);
    if (!ok) return;
    await deleteDoc(doc(db, coleccion('choferes'), c.id));
  };

  // --- USUARIOS Y MÓDULOS ---
  const alternarModulo = (
    listaActual: ModuloApp[],
    mod: ModuloApp,
    setter: (val: ModuloApp[]) => void
  ) => {
    if (listaActual.includes(mod)) {
      setter(listaActual.filter((m) => m !== mod));
    } else {
      setter([...listaActual, mod]);
    }
  };

  const crearPerfilUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    const correoLimpio = uCorreo.trim().toLowerCase();
    if (!correoLimpio || guardandoUsuario) return;

    setGuardandoUsuario(true);
    const idDoc = uUidAuth.trim() || correoLimpio;
    const modulosFinales: ModuloApp[] =
      uRolBase === 'sistemas'
        ? ['patio', 'monitor', 'flota', 'chofer', 'catalogos']
        : uModulos;

    await setDoc(
      doc(db, coleccionUsuarios(), idDoc),
      {
        uid: uUidAuth.trim() || idDoc,
        nombre: uNombre.trim() || correoLimpio,
        correo: correoLimpio,
        rolBase: uRolBase,
        modulos: modulosFinales,
        pin: uPin.trim(),
        choferId: uChoferId || null,
        activo: true,
        creadoEn: new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
      },
      { merge: true }
    );

    setUNombre('');
    setUCorreo('');
    setUUidAuth('');
    setUPin('');
    setUChoferId('');
    setGuardandoUsuario(false);
  };

  const empezarEditarUsuario = (usr: PerfilUsuario) => {
    setEditUsuarioId(usr.uid);
    setEditURolBase(usr.rolBase);
    setEditUModulos(usr.modulos || []);
    setEditUPin(usr.pin || '');
    setEditUChoferId(usr.choferId || '');
  };

  const guardarEdicionUsuario = async (usr: PerfilUsuario) => {
    const modulosFinales: ModuloApp[] =
      editURolBase === 'sistemas'
        ? ['patio', 'monitor', 'flota', 'chofer', 'catalogos']
        : editUModulos;

    await updateDoc(doc(db, coleccionUsuarios(), usr.uid), {
      rolBase: editURolBase,
      modulos: modulosFinales,
      pin: editUPin.trim(),
      choferId: editUChoferId || null,
      actualizadoEn: new Date().toISOString(),
    });
    setEditUsuarioId(null);
  };

  const toggleActivoUsuario = async (usr: PerfilUsuario) => {
    await updateDoc(doc(db, coleccionUsuarios(), usr.uid), {
      activo: !usr.activo,
      actualizadoEn: new Date().toISOString(),
    });
  };

  // --- PIN DE CANCELACIONES ---
  const guardarPinCancelacion = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = pinCancelacion.trim();
    if (limpio.length < 4 || guardandoPin) return;

    setGuardandoPin(true);
    await setDoc(
      doc(db, coleccion('configuracion'), 'seguridad'),
      {
        pinCancelacion: limpio,
        actualizadoEn: new Date().toISOString(),
      },
      { merge: true }
    );
    setGuardandoPin(false);
    setAvisoPin('PIN de cancelación guardado.');
    window.setTimeout(() => setAvisoPin(null), 3500);
  };

  const choferesActivos = choferes.filter((c) => c.activo);
  const unidadesActivas = unidades.filter((u) => u.activo);

  const obtenerNombreChofer = (id?: string | null) => {
    if (!id) return null;
    return choferes.find((c) => c.id === id)?.nombre || null;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      <header className="bg-slate-900 text-white px-4 py-3.5 shadow sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            title="Volver al menú principal"
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-200 transition shrink-0"
          >
            <Home className="w-5 h-5" />
          </Link>
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-9 h-9 rounded-lg object-contain bg-slate-800 p-1 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="font-bold text-base sm:text-lg truncate">
              Administración y Catálogos
            </h1>
            <p className="text-[11px] text-slate-400 truncate">
              {esLocal
                ? 'Modo local (colecciones dev_*)'
                : 'Modo producción (colecciones reales)'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 shrink-0">
            {unidadesActivas.length} unid. • {choferesActivos.length} chof.
          </span>
          <BarraSesionModulo />
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Navegación de pestañas de administración */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setPestana('catalogos')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'catalogos'
                ? 'bg-slate-900 text-white border-slate-900 shadow'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Truck className="w-4 h-4 text-amber-500" />
            <span>Unidades y Choferes</span>
          </button>

          <button
            type="button"
            onClick={() => setPestana('usuarios')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'usuarios'
                ? 'bg-slate-900 text-white border-slate-900 shadow'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4 text-sky-500" />
            <span>Usuarios y Módulos</span>
          </button>

          <button
            type="button"
            onClick={() => setPestana('pin')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'pin'
                ? 'bg-slate-900 text-white border-slate-900 shadow'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <KeyRound className="w-4 h-4 text-rose-500" />
            <span>PIN Cancelaciones</span>
          </button>

          <button
            type="button"
            onClick={() => setPestana('bitacora')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
              pestana === 'bitacora'
                ? 'bg-slate-900 text-white border-slate-900 shadow'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Fuel className="w-4 h-4 text-emerald-500" />
            <span>Km y Gasolina</span>
          </button>
        </div>

        {/* Barra superior de descarga de reporte */}
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

        {pestana === 'catalogos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Columna izquierda: CRUD Vehículos / Unidades */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-600" />
                  <h2 className="font-bold text-base text-slate-800">
                    Vehículos / Unidades ({unidades.length})
                  </h2>
                </div>
                <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  {unidadesActivas.length} activos
                </span>
              </div>

              <form
                onSubmit={crearUnidad}
                className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Nombre / Unidad *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. NP300 Blanca"
                      value={nombreUnidad}
                      onChange={(e) => setNombreUnidad(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Placas (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. VM-4821-A"
                      value={placasUnidad}
                      onChange={(e) => setPlacasUnidad(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-sm uppercase bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Chofer predeterminado (opcional)
                  </label>
                  <select
                    value={choferDefaultId}
                    onChange={(e) => setChoferDefaultId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="">Sin chofer asignado...</option>
                    {choferesActivos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {guardandoUnidad ? 'Guardando...' : 'Agregar Vehículo'}
                </button>
              </form>

              <div className="space-y-2.5">
                {unidades.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                    No hay vehículos registrados.
                  </p>
                ) : (
                  unidades.map((u) => {
                    const choferAsignado = obtenerNombreChofer(u.choferDefaultId);
                    const editando = editUnidadId === u.id;

                    return (
                      <div
                        key={u.id}
                        className={`rounded-xl p-3.5 border transition ${
                          u.activo
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-100/70 border-slate-200 opacity-65'
                        }`}
                      >
                        {editando ? (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editNombreUnidad}
                                onChange={(e) => setEditNombreUnidad(e.target.value)}
                                placeholder="Nombre vehículo"
                                className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm outline-none"
                              />
                              <input
                                type="text"
                                value={editPlacasUnidad}
                                onChange={(e) => setEditPlacasUnidad(e.target.value)}
                                placeholder="Placas"
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm uppercase outline-none"
                              />
                            </div>
                            <select
                              value={editChoferDefaultId}
                              onChange={(e) => setEditChoferDefaultId(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white outline-none"
                            >
                              <option value="">Sin chofer asignado</option>
                              {choferesActivos.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </select>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditUnidadId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" /> Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => guardarEdicionUnidad(u.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" /> Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-slate-900">{u.nombre}</span>
                                {u.placas && (
                                  <span className="text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 rounded">
                                    {u.placas}
                                  </span>
                                )}
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    u.activo
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {u.activo ? 'Activo' : 'Inactivo'}
                                </span>
                              </div>
                              {choferAsignado && (
                                <p className="text-xs text-slate-500">
                                  Chofer fijo:{' '}
                                  <span className="font-semibold text-slate-700">
                                    {choferAsignado}
                                  </span>
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => empezarEditarUnidad(u)}
                                title="Editar vehículo"
                                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleActivoUnidad(u)}
                                title={u.activo ? 'Desactivar' : 'Activar'}
                                className={`p-2 rounded-lg transition ${
                                  u.activo
                                    ? 'text-amber-700 hover:bg-amber-50'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {u.activo ? (
                                  <PowerOff className="w-4 h-4" />
                                ) : (
                                  <Power className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarUnidad(u)}
                                title="Eliminar vehículo"
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Columna derecha: CRUD Choferes */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold text-base text-slate-800">Choferes ({choferes.length})</h2>
                </div>
                <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  {choferesActivos.length} activos
                </span>
              </div>

              <form
                onSubmit={crearChofer}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nombre del chofer *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Hernández"
                    value={nombreChofer}
                    onChange={(e) => setNombreChofer(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={guardandoChofer}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {guardandoChofer ? 'Guardando...' : 'Agregar Chofer'}
                </button>
              </form>

              <div className="space-y-2.5">
                {choferes.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                    No hay choferes registrados.
                  </p>
                ) : (
                  choferes.map((c) => {
                    const editando = editChoferId === c.id;

                    return (
                      <div
                        key={c.id}
                        className={`rounded-xl p-3.5 border transition ${
                          c.activo
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-100/70 border-slate-200 opacity-65'
                        }`}
                      >
                        {editando ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="text"
                              value={editNombreChofer}
                              onChange={(e) => setEditNombreChofer(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  guardarEdicionChofer(c.id);
                                }
                              }}
                              className="flex-1 rounded-lg border border-emerald-400 px-3 py-1.5 text-sm outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditChoferId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" /> Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => guardarEdicionChofer(c.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" /> Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">{c.nombre}</span>
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  c.activo
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {c.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => empezarEditarChofer(c)}
                                title="Editar chofer"
                                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleActivoChofer(c)}
                                title={c.activo ? 'Desactivar' : 'Activar'}
                                className={`p-2 rounded-lg transition ${
                                  c.activo
                                    ? 'text-amber-700 hover:bg-amber-50'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {c.activo ? (
                                  <PowerOff className="w-4 h-4" />
                                ) : (
                                  <Power className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarChofer(c)}
                                title="Eliminar chofer"
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {pestana === 'usuarios' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={crearPerfilUsuario}
              className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-600" />
                <h2 className="font-bold text-base text-slate-800">
                  Asignar Correo y Módulos
                </h2>
              </div>

              <p className="text-xs text-slate-500">
                Crea la cuenta con correo y contraseña en Firebase Authentication y registra aquí
                sus módulos (ej. Monitor + Chofer).
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre de usuario / persona
                </label>
                <input
                  type="text"
                  placeholder="Ej. Encargado Patio / Gabriel"
                  value={uNombre}
                  onChange={(e) => setUNombre(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={uCorreo}
                  onChange={(e) => setUCorreo(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Rol base
                  </label>
                  <select
                    value={uRolBase}
                    onChange={(e) => {
                      const rol = e.target.value as RolBaseUsuario;
                      setURolBase(rol);
                      if (rol === 'sistemas') {
                        setUModulos(['patio', 'monitor', 'flota', 'chofer', 'catalogos']);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white outline-none focus:border-sky-500"
                  >
                    {ROLES_BASE.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    PIN opcional (4-6 dígitos)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Ej. 4821"
                    value={uPin}
                    onChange={(e) => setUPin(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Vincular a chofer (si usa Portal Chofer)
                </label>
                <select
                  value={uChoferId}
                  onChange={(e) => setUChoferId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white outline-none focus:border-sky-500"
                >
                  <option value="">-- Sin chofer vinculado --</option>
                  {choferesActivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  UID de Firebase Auth (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Si lo dejas vacío, se usa el correo"
                  value={uUidAuth}
                  onChange={(e) => setUUidAuth(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-600">
                  Módulos permitidos (puede tener varios)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {TODOS_LOS_MODULOS.map((m) => {
                    const checked = uModulos.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                          checked
                            ? 'bg-sky-50 border-sky-400 text-sky-900'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => alternarModulo(uModulos, m.id, setUModulos)}
                          className="rounded"
                        />
                        <span>{m.etiqueta}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={guardandoUsuario}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {guardandoUsuario ? 'Guardando...' : 'Guardar Perfil de Usuario'}
              </button>
            </form>

            <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
              <h2 className="font-bold text-base text-slate-800">
                Usuarios Configurados ({usuarios.length})
              </h2>

              {usuarios.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                  Aún no hay perfiles en `usuarios`. Agrega tu usuario de Sistemas o del equipo.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {usuarios.map((usr) => {
                    const editando = editUsuarioId === usr.uid;
                    const nombreChoferVinculado = obtenerNombreChofer(usr.choferId);

                    return (
                      <div
                        key={usr.uid}
                        className={`rounded-xl p-3.5 border space-y-2.5 ${
                          usr.activo
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-100 border-slate-200 opacity-65'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">
                                {usr.nombre || usr.correo}
                              </span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                                {usr.rolBase}
                              </span>
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  usr.activo
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {usr.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{usr.correo}</p>
                            <p className="text-xs text-slate-600 mt-1">
                              Chofer vinculado:{' '}
                              <span className="font-semibold text-slate-800">
                                {nombreChoferVinculado || 'Ninguno'}
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(usr.modulos || []).map((mod) => (
                                <span
                                  key={mod}
                                  className="text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded"
                                >
                                  {mod}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => empezarEditarUsuario(usr)}
                              title="Editar chofer, módulos y PIN"
                              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivoUsuario(usr)}
                              title={usr.activo ? 'Desactivar' : 'Activar'}
                              className="p-2 rounded-lg text-amber-700 hover:bg-amber-50"
                            >
                              {usr.activo ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {editando && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Rol base
                                </label>
                                <select
                                  value={editURolBase}
                                  onChange={(e) =>
                                    setEditURolBase(e.target.value as RolBaseUsuario)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                                >
                                  {ROLES_BASE.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  PIN
                                </label>
                                <input
                                  type="text"
                                  value={editUPin}
                                  onChange={(e) => setEditUPin(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                Chofer vinculado
                              </label>
                              <select
                                value={editUChoferId}
                                onChange={(e) => setEditUChoferId(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                              >
                                <option value="">-- Sin chofer vinculado --</option>
                                {choferesActivos.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {TODOS_LOS_MODULOS.map((m) => {
                                const checked = editUModulos.includes(m.id);
                                return (
                                  <label
                                    key={m.id}
                                    className="inline-flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        alternarModulo(editUModulos, m.id, setEditUModulos)
                                      }
                                    />
                                    <span>{m.etiqueta}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditUsuarioId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-700"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => guardarEdicionUsuario(usr)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white"
                              >
                                Guardar Cambios
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {pestana === 'pin' && (
          <form
            onSubmit={guardarPinCancelacion}
            className="max-w-lg bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-rose-600" />
              <h2 className="font-bold text-base text-slate-800">
                PIN para Acciones Críticas (Cancelación de Rutas)
              </h2>
            </div>

            <p className="text-xs text-slate-500">
              Cada persona usa su propio dispositivo; este PIN se pedirá únicamente al intentar
              cancelar una salida/ruta para evitar cancelaciones accidentales o no autorizadas.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                PIN de seguridad (4 a 6 dígitos) *
              </label>
              <div className="flex gap-2">
                <input
                  type={mostrarPin ? 'text' : 'password'}
                  required
                  minLength={4}
                  maxLength={6}
                  value={pinCancelacion}
                  onChange={(e) => setPinCancelacion(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base font-bold tracking-widest bg-slate-50 outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPin(!mostrarPin)}
                  className="px-3 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  title="Mostrar u ocultar PIN"
                >
                  {mostrarPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {avisoPin && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3 py-2 rounded-xl">
                {avisoPin}
              </div>
            )}

            <button
              type="submit"
              disabled={guardandoPin}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm shadow transition"
            >
              {guardandoPin ? 'Guardando PIN...' : 'Guardar PIN de Cancelación'}
            </button>
          </form>
        )}

        {pestana === 'bitacora' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fuel className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-base text-slate-800">
                  Bitácora de Kilómetros y Gasolina ({reportesFlota.length})
                </h2>
              </div>
            </div>

            {reportesFlota.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                Aún no hay registros de gasolina, salida o cierre de día.
              </p>
            ) : (
              <div className="space-y-2">
                {reportesFlota.map((rep) => {
                  const kmMostrar = rep.kilometrajeFinal ?? rep.kilometraje ?? null;
                  return (
                    <div
                      key={rep.id}
                      className="rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {rep.unidadNombre || 'Unidad'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {rep.tipo || rep.tipoReporte || 'REPORTE'}
                          </span>
                          {rep.choferNombre && (
                            <span className="text-slate-500">• {rep.choferNombre}</span>
                          )}
                        </div>
                        <div className="text-slate-600 flex flex-wrap gap-3">
                          {rep.litros ? (
                            <span>
                              Gasolina: <strong>{rep.litros} L</strong>
                              {rep.monto ? ` ($${rep.monto})` : ''}
                            </span>
                          ) : null}
                          {kmMostrar ? (
                            <span>
                              Km: <strong>{kmMostrar}</strong>
                              {rep.kmRecorridos ? ` (+${rep.kmRecorridos} km)` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right text-slate-500">
                        <div>{rep.fechaOperacion || rep.fechaIso || ''}</div>
                        <div>{rep.horaTexto || ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default function CatalogosPage() {
  return (
    <ProteccionModulo moduloRequerido="catalogos">
      <CatalogosContenido />
    </ProteccionModulo>
  );
}