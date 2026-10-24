import { Logo } from "@/components/ui";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

// Served by the service worker when there's no connection, so it can't rely
// on app scripts being cached: the list of saved pages is a tiny inline script.
const listScript = `(async()=>{try{const ul=document.getElementById('pt-offline-list');const keys=(await caches.keys()).filter(k=>k.endsWith('-pages'));const urls=[];for(const k of keys){for(const r of await (await caches.open(k)).keys()){const u=new URL(r.url);urls.push(u.pathname+u.search)}}const seen=[...new Set(urls)].filter(u=>u!=='/offline').slice(-12).reverse();if(!seen.length)return;ul.hidden=false;for(const u of seen){const li=document.createElement('li');const a=document.createElement('a');a.href=u;a.className='block truncate px-4 py-3 text-[13.5px] capitalize text-ink hover:bg-hover';a.textContent=(u.replace(/^\\/app\\/?/,'').replace(/\\?.*$/,'').replace(/[\\/-]/g,' ').trim()||'Dashboard');li.appendChild(a);ul.appendChild(li)}}catch(e){}})();document.getElementById('pt-retry').onclick=()=>location.reload();`;

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo className="size-12" />
      <div>
        <h1 className="text-title-1 text-ink">You're offline</h1>
        <p className="mt-1 text-sm text-ink-2">Check your connection. Pages you opened recently can still be read below. Creating, sending and payments need the internet.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button id="pt-retry" type="button" className="h-11 rounded-lg bg-primary-gradient text-sm font-semibold text-white">Try again</button>
        <ul id="pt-offline-list" hidden className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-surface text-left ring-1 ring-line" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: listScript }} />
    </main>
  );
}
