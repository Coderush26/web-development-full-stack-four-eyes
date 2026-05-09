import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import '../styles/global.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { initFirebaseAnalytics } from '../src/firebase/clientApp';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    initFirebaseAnalytics().catch(() => {});
  }, []);

  return (
    <>
      <Head>
        <link rel="shortcut icon" href="/favicon.ico?v=2" />
        <link rel="icon" href="/favicon.ico?v=2" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
