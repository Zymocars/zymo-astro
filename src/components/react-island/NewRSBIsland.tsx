// React-island wrapper for NewRSB.
// Wraps NewRSB in a BrowserRouter so `useNavigate()` resolves at runtime.
// Astro pages import this component and mount via client:idle (or client:load
// for above-the-fold pages that need immediate interactivity).
//
// Byte cost per plan estimate: ~64 KB gzipped. Only mounted on pages that
// carry the search widget (52 cities + 6 national landings + homepage).
// Every other Astro-served page (routes/answers/zoomcar/guides/research/
// hubs/static/partner ≈ 426 pages) does NOT ship this island.

import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import NewRSB from './NewRSB';

interface Props {
  urlcity?: string;
}

export default function NewRSBIsland({ urlcity }: Props) {
  return (
    <BrowserRouter>
      <NewRSB urlcity={urlcity} />
      <ToastContainer position="top-right" autoClose={3000} />
    </BrowserRouter>
  );
}
