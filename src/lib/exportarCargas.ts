import { db, Carga } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export async function descargarCargasCSV(fecha: string): Promise<boolean> {
  if (!fecha) return false;

  const qCargas = query(collection(db, 'cargas'), where('fechaOperacion', '==', fecha));
  const snap = await getDocs(qCargas);
  const data = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Carga))
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  if (data.length === 0) {
    alert('No hay cargas registradas en esa fecha.');
    return false;
  }

  const filas = data.map((c) => [
    c.fechaOperacion,
    `"${c.unidadNombre}"`,
    `"${c.choferNombre}"`,
    `"${c.destino}"`,
    c.vuelta,
    c.estado,
    new Date(c.horaInicio).toLocaleTimeString('es-MX'),
    c.horaSalida ? new Date(c.horaSalida).toLocaleTimeString('es-MX') : 'En patio',
    `"${c.remisiones.join(', ')}"`,
  ]);

  const encabezado = 'Fecha,Unidad,Chofer,Destino,Vuelta,Estado,Hora Inicio,Hora Salida,Remisiones\n';
  const csv = '\uFEFF' + encabezado + filas.map((f) => f.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-cargas-${fecha}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  return true;
}