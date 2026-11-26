'use client';

import { useState } from 'react';
import { Radio, ShieldCheck } from 'lucide-react';

interface Props {
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  onDesbloquear: () => void;
}

export function DesbloqueoAudioModal({
  titulo,
  subtitulo,
  textoBoton,
  onDesbloquear,
}: Props) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleConfirmar = () => {
    onDesbloquear();
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl space-y-5">
        <div className="relative w-16 h-16 mx-auto">
          <img
            src="/logo-bravo.png"
            alt="Logo Bravo"
            className="w-16 h-16 rounded-2xl object-contain bg-slate-950 p-1.5 border border-slate-700"
          />
          <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1 rounded-full">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
          </span>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white">{titulo}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{subtitulo}</p>
        </div>

        <button
          type="button"
          onClick={handleConfirmar}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          {textoBoton}
        </button>
      </div>
    </div>
  );
}