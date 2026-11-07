// =============================================================
// Kod Adı Çizim - "şu an kaç kişi online" sayacı (ana menüde görünür)
// Oyunun kendi sunucusu yok. Bu yüzden herkese açık, ücretsiz bir MQTT mesaj sunucusu kullanılır:
// uygulaması açık olan her telefon ~25 saniyede bir "buradayım" der (sadece rastgele bir numara ve
// menüde mi oyunda mı olduğu; ad ya da başka bilgi gitmez). Son 70 saniyede sesi gelenler sayılır.
// Yeni açılan biri "kim var?" diye sorar, açık olanlar hemen cevap verir; sayı birkaç saniyede gelir.
// Sunucuya ulaşılamazsa sayaç hiç görünmez, oyun etkilenmez.
// =============================================================

const Sayac = (() => {
  const SUNUCULAR = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const KONU = 'enesozkayaa/kod-adi-cizim/v1';
  const ARALIK = 25000;   // "buradayım" sıklığı
  const ESKI = 70000;     // bu kadar süredir sesi gelmeyen gitmiş sayılır
  const id = Math.random().toString(36).slice(2, 10);
  const goruldu = new Map();  // numara → { zaman, oyunda }
  let istemci = null, sunucu = 0, bagli = false;

  const oyunda = () => !document.getElementById('oyun').hidden;
  function yolla() {
    if (bagli && !document.hidden) istemci.publish(`${KONU}/var/${id}`, oyunda() ? 'oyun' : 'menu');
  }

  function yaz() {
    const el = document.getElementById('onlineSayi');
    if (!el) return;
    if (!bagli) {
      el.hidden = true;
      return;
    }
    const simdi = Date.now();
    goruldu.set(id, { zaman: simdi, oyunda: oyunda() });  // ben de sayılırım
    let kisi = 0, oyunlarda = 0;
    goruldu.forEach((v, k) => {
      if (simdi - v.zaman > ESKI) goruldu.delete(k);
      else {
        kisi++;
        if (v.oyunda) oyunlarda++;
      }
    });
    el.innerHTML = `<span class="yesil"></span> Şu an <b>${kisi}</b> kişi online` + (oyunlarda ? ` · ${oyunlarda}'${kisi === 1 ? 'i' : 'si'} oyunda` : '');
    el.hidden = false;
  }

  function baglan() {
    if (typeof mqtt === 'undefined') return;
    istemci = mqtt.connect(SUNUCULAR[sunucu], { clientId: `kc_${id}`, reconnectPeriod: 6000, connectTimeout: 8000, clean: true });
    let hicBaglanmadi = true;
    istemci.on('connect', () => {
      hicBaglanmadi = false;
      bagli = true;
      istemci.subscribe(`${KONU}/#`);
      istemci.publish(`${KONU}/kimvar`, id);
      yolla();
      yaz();
    });
    istemci.on('close', () => {
      bagli = false;
      yaz();
      // İlk sunucuya hiç bağlanamadıysak öbürünü dene
      if (hicBaglanmadi && sunucu < SUNUCULAR.length - 1) {
        istemci.end(true);
        sunucu++;
        baglan();
      }
    });
    istemci.on('message', (konu, veri) => {
      const metin = String(veri);
      if (konu === `${KONU}/kimvar`) {
        if (metin !== id) setTimeout(yolla, Math.random() * 1500);  // herkes aynı anda cevap vermesin
      } else if (konu.startsWith(`${KONU}/var/`)) {
        goruldu.set(konu.slice(KONU.length + 5), { zaman: Date.now(), oyunda: metin === 'oyun' });
      } else if (konu.startsWith(`${KONU}/gitti/`)) {
        goruldu.delete(konu.slice(KONU.length + 7));
      }
    });
  }

  // Uygulama arka plana atılınca "gittim" der, geri gelince yine "buradayım"
  document.addEventListener('visibilitychange', () => {
    if (!bagli) return;
    if (document.hidden) istemci.publish(`${KONU}/gitti/${id}`, '');
    else {
      istemci.publish(`${KONU}/kimvar`, id);
      yolla();
    }
  });

  // Sayfa kapanınca / yenilenince de "gittim" (eski numara 70 sn boyunca sayılmasın)
  window.addEventListener('pagehide', () => bagli && istemci.publish(`${KONU}/gitti/${id}`, ''));
  // Oyuna girince / menüye dönünce hemen haber ver ("oyunda" sayısı beklemeden güncellensin)
  new MutationObserver(yolla).observe(document.getElementById('oyun'), { attributes: true, attributeFilter: ['hidden'] });
  setInterval(yolla, ARALIK);
  setInterval(yaz, 3000);
  // MQTT kütüphanesi oyun açıldıktan sonra yüklenir (açılışı yavaşlatmasın)
  setTimeout(() => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
    s.onload = baglan;
    document.head.appendChild(s);
  }, 800);
  return { get sayi() { return [...goruldu.keys()].length; } };
})();
