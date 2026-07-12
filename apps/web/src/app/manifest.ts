import type { MetadataRoute } from 'next';

// PWA manifest (SPEC §5, §11). Colors are the design-language Forest/Mist.
// start_url is the root; middleware redirects to the visitor's locale.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Guri',
    short_name: 'Guri',
    description: 'Guri — guri ka hel Muqdisho / find a home in Mogadishu through verified agencies',
    id: '/',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F4F7F2',
    theme_color: '#173A31',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
