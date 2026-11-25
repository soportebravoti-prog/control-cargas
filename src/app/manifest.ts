import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Control de Carga y Despacho - Bravo',
    short_name: 'Bravo Cargas',
    description: 'Registro de cargas en patio, monitor en vivo y reportes',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#d97706',
    icons: [
      {
        src: '/logo-bravo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo-bravo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}