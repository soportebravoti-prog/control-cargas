'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export type TemaApp = 'dark' | 'light';

const CLAVE_TEMA = 'tema-bravo';

export function BotonTema() {
  const [tema, setTema] = useState<TemaApp>('dark');

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_TEMA) as TemaApp | null;
    const inicial: TemaApp = guardado === 'light' || guardado === 'dark' ? guardado : 'dark';
    setTema(inicial);
    document.documentElement.classList.toggle('dark', inicial === 'dark');
    document.documentElement.dataset.tema = inicial;
  }, []);

  const alternarTema = () => {
    const siguiente: TemaApp = tema === 'dark' ? 'light' : 'dark';
    setTema(siguiente);
    window.localStorage.setItem(CLAVE_TEMA, siguiente);
    document.documentElement.classList.toggle('dark', siguiente === 'dark');
    document.documentElement.dataset.tema = siguiente;
    window.dispatchEvent(new CustomEvent<TemaApp>('cambio-tema-bravo', { detail: siguiente }));
  };

  return (
    <button
      type="button"
      onClick={alternarTema}
      title={tema === 'dark' ? 'Cambiar a Modo Día' : 'Cambiar a Modo Oscuro'}
      className={
        tema === 'dark'
          ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition shrink-0'
          : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-sm transition shrink-0'
      }
    >
      {tema === 'dark' ? (
        <>
          <Sun className="w-4 h-4 text-amber-300" />
          <span>Modo Día</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-slate-700" />
          <span>Modo Oscuro</span>
        </>
      )}
    </button>
  );
}

export function useTemaApp(): TemaApp {
  const [tema, setTema] = useState<TemaApp>('dark');

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_TEMA) as TemaApp | null;
    if (guardado === 'light' || guardado === 'dark') {
      setTema(guardado);
    }

    const onCambio = (e: Event) => {
      const customEvent = e as CustomEvent<TemaApp>;
      if (customEvent.detail === 'light' || customEvent.detail === 'dark') {
        setTema(customEvent.detail);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === CLAVE_TEMA && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTema(e.newValue);
      }
    };

    window.addEventListener('cambio-tema-bravo', onCambio);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cambio-tema-bravo', onCambio);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return tema;
}