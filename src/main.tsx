import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ensureSeeded } from './db/seed';
import './index.css';

// الجاهز يتضاف قبل أول رسم، عشان أول شاشة تلاقي القوالب.
void navigator.storage?.persist?.();

// لما إصدار جديد يستلم التحكم، الصفحة المفتوحة لسه شغالة بالقديم، فتتحمل مرة واحدة.
// المسودات بتتحفظ تلقائياً، وأول تثبيت (من غير إصدار سابق) مش بيعمل إعادة تحميل.
if (navigator.serviceWorker?.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

const root = document.getElementById('root')!;

ensureSeeded().then(
  () => {
    createRoot(root).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  },
  () => {
    root.innerHTML = '<p style="max-width:32rem;margin:4rem auto;padding:0 1rem;font-size:1.125rem;line-height:1.8">'
      + 'تعذر فتح مخزن البيانات على المتصفح ده. اتأكد إنك مش في وضع التصفح الخاص، وإن الموقع مسموح له يخزن بيانات، وبعدين افتح الصفحة تاني.</p>';
  },
);
