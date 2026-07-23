import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sthir Notes',
  description: 'Offline-first hierarchical notes for UPSC prep',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Applies the stored theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('sthir-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// Removes any previously-installed service worker + its caches (a caching SW
// could leave the app stuck on a stale shell). No SW is registered now.
const swScript = `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
