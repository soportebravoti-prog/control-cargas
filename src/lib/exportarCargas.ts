import { db, Carga } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

function formatearHora(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function traducirEstado(estado: Carga['estado']) {
  if (estado === 'CARGANDO') return 'Cargando en Patio';
  if (estado === 'EN_RUTA') return 'En Ruta';
  if (estado === 'FINALIZADA') return 'Finalizada';
  if (estado === 'CANCELADA') return 'Cancelada';
  return estado;
}

export async function descargarCargasCSV(fechaOperacion: string) {
  const q = query(collection(db, 'cargas'), where('fechaOperacion', '==', fechaOperacion));
  const snap = await getDocs(q);
  const cargas = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Carga));
  cargas.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  const encabezados = [
    'Fecha',
    'Unidad',
    'Vuelta',
    'Chofer',
    'Destino',
    'Remisiones',
    'Total Remisiones',
    'Estado',
    'Hora Inicio Carga',
    'Hora Salida',
    'Hora Regreso',
    'Motivo Cancelacion',
  ];

  const filas = cargas.map((c) => [
    c.fechaOperacion,
    `"${(c.unidadNombre || '').replace(/"/g, '""')}"`,
    c.vuelta,
    `"${(c.choferNombre || '').replace(/"/g, '""')}"`,
    `"${(c.destino || '').replace(/"/g, '""')}"`,
    `"${(c.remisiones || []).join(' | ').replace(/"/g, '""')}"`,
    (c.remisiones || []).length,
    traducirEstado(c.estado),
    formatearHora(c.horaInicio),
    formatearHora(c.horaSalida),
    formatearHora(c.horaRegreso),
    `"${(c.motivoCancelacion || '').replace(/"/g, '""')}"`,
  ]);

  const contenido =
    '\uFEFF' + [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\n');

  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `reporte-cargas-${fechaOperacion}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}