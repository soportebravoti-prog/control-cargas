'use client';

interface IndicadorEstadoUnidadProps {
  enRuta: boolean;
  cargando?: boolean;
  compacto?: boolean;
}

export function IndicadorEstadoUnidad({
  enRuta,
  cargando = false,
  compacto = false,
}: IndicadorEstadoUnidadProps) {
  if (enRuta) {
    return (
      <span
        title="Unidad actualmente en ruta"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 select-none"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </span>
        {!compacto && <span>En ruta</span>}
      </span>
    );
  }

  if (cargando) {
    return (
      <span
        title="Unidad cargando en patio"
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35 select-none"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80 border border-amber-300/60" />
        {!compacto && <span>Cargando</span>}
      </span>
    );
  }

  return (
    <span
      title="Unidad sin ruta activa"
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-950/50 text-rose-300/75 border border-rose-500/25 select-none"
    >
      <span className="h-2.5 w-2.5 rounded-full bg-rose-500/40 border border-rose-400/40" />
      {!compacto && <span>Sin ruta</span>}
    </span>
  );
}