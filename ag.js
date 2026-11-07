// =============================================================
// Kod Adı Çizim - online oda (bot yok; en az 4 kişi: her takımda bir kaptan + en az bir tahminci)
// Bağlantı PeerJS ile cihazlar arasında doğrudan kurulur. Odayı açan ("ev") oyunu yönetir.
// Herkes bekleme odasında takımını (Kırmızı/Mavi) seçer, isteyen "Kaptan ol" der. Oda sahibi ayarları seçer.
// Kopan oyuncu aynı cihazla ya da aynı adla geri gelince kaldığı yerden devam eder.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, kimlik, surum }  { tip: 'lobiEylem', ad, deger }  { tip: 'eylem', ad, args }
//                 { tip: 'cizim', resim }  { tip: 'sohbet', metin }  { tip: 'ses', acik }  { tip: 'nabiz' }
//   ev → misafir: { tip: 'kabul', id, surum }  { tip: 'lobi', oyuncular, ayar }  { tip: 'red', neden }
//                 { tip: 'durum', d, olay }  { tip: 'cizim', turNo, resim }  { tip: 'sohbet', ad, metin, takim }
//                 { tip: 'sesListesi', liste }  { tip: 'nabiz' }
// =============================================================

const Ag = (() => {
  const SURUM = 1;
  const ODA_ONEKI = 'kod-adi-cizim-oda-';
  const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const NABIZ_ARALIGI = 3000, NABIZ_ZAMAN_ASIMI = 15000;
  const OTOMATIK_KATIL = 'kodAdiCizim.otomatikKatil';
  const SON_ODA = 'kodAdiCizim.sonOda';
  const KIMLIK = 'kodAdiCizim.kimlik';
  const AYAR_ANAHTAR = 'kodAdiCizim.ayar';

  const ag = {
    mod: 'yerel', peer: null, baglanti: null, kod: '', basladi: false, sonMesaj: 0, nabiz: null, okunmamis: 0,
    oyuncular: [],   // evde: { id, ad, takim, kaptan, misafir: { baglanti, sonMesaj } | null, ses }
    ayar: null, cizimler: {},   // turNo → resim (data URL)
  };

  let kimlik = '';
  try {
    kimlik = localStorage.getItem(KIMLIK) || '';
    if (!kimlik) localStorage.setItem(KIMLIK, (kimlik = Math.random().toString(36).slice(2, 12)));
  } catch (e) { kimlik = Math.random().toString(36).slice(2, 12); }
  // Aynı bilgisayarda birkaç sekmeyle denemek için: adrese ?kimlik=xxx yazılırsa o kullanılır
  const testKimlik = new URLSearchParams(location.search).get('kimlik');
  if (testKimlik) kimlik = testKimlik.slice(0, 20);

  const kayit = (ad, deger) => {
    try { deger === null ? localStorage.removeItem(ad) : localStorage.setItem(ad, JSON.stringify(deger)); } catch (e) { /* yok */ }
  };
  function ayarOku() {
    let a = null;
    try { a = JSON.parse(localStorage.getItem(AYAR_ANAHTAR)); } catch (e) { /* yok */ }
    return { anlatim: a?.anlatim === 'yazi' ? 'yazi' : 'cizim', kelime: a?.kelime === 'kendi' ? 'kendi' : 'otomatik', sure: [60, 90, 120].includes(+a?.sure) ? +a.sure : 90 };
  }

  const durumYaz = html => ($('onlineDurum').innerHTML = html);
  function adiAl() {
    const ad = $('adim').value.trim().slice(0, 12);
    if (!ad) {
      $('adim').classList.add('eksik');
      $('adim').placeholder = 'Önce adını yaz 👈';
      $('adim').focus();
      return null;
    }
    $('adim').classList.remove('eksik');
    kayitYaz(ANAHTAR_AD, ad);
    return ad;
  }
  function peerVarMi() {
    if (typeof Peer !== 'undefined') return true;
    durumYaz('❌ Online bağlantı kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');
    return false;
  }
  function kilitle(evet = true) {
    ['odaKurBtn', 'katilBtn', 'odaKoduGir', 'adim', 'geriDonBtn'].forEach(id => $(id) && ($(id).disabled = evet));
    $('odaIptalBtn').hidden = !evet;
    $('odaIptalBtn').textContent = ag.mod === 'ev' ? '❌ Odayı kapat' : '↩️ Vazgeç, odadan çık';
  }
  function sunucuyaYenidenBaglan(peer) {
    peer.on('disconnected', () => setTimeout(() => {
      if (peer.destroyed || !peer.disconnected) return;
      try { peer.reconnect(); } catch (e) { /* tekrar denenir */ }
    }, 2000));
  }

  const misafirler = () => ag.oyuncular.filter(p => p.misafir);
  const gonder = (m, mesaj) => m?.baglanti.open && m.baglanti.send(mesaj);
  const herkese = mesaj => misafirler().forEach(p => gonder(p.misafir, mesaj));

  function nabziBaslat() {
    ag.sonMesaj = Date.now();
    clearInterval(ag.nabiz);
    ag.nabiz = setInterval(() => {
      if (ag.mod === 'ev') {
        misafirler().forEach(p => {
          gonder(p.misafir, { tip: 'nabiz' });
          if (Date.now() - p.misafir.sonMesaj > NABIZ_ZAMAN_ASIMI) {
            p.misafir.baglanti.close();
            koptu(p);
          }
        });
      } else if (ag.baglanti) {
        if (ag.baglanti.open) ag.baglanti.send({ tip: 'nabiz' });
        if (Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) evdenKoptu();
      }
    }, NABIZ_ARALIGI);
  }

  // ---------- Ev: oda kurma ----------
  function odaKur() {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.hazirla();
    const kod = [...Array(5)].map(() => KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)]).join('');
    durumYaz('⏳ Oda açılıyor...');
    oturumuUnut();
    kilitle();
    try { ag.peer?.destroy(); } catch (e) { /* kapalı */ }
    const peer = new Peer(ODA_ONEKI + kod);
    ag.peer = peer;
    peer.on('open', () => {
      if (ag.mod === 'ev') return;
      ag.mod = 'ev';
      ag.kod = kod;
      ag.ayar = ayarOku();
      ag.oyuncular = [{ id: kimlik, ad, takim: 'k', kaptan: true, misafir: null }];
      ui.benimId = kimlik;
      kilitle();
      odaKodunuGoster();
      nabziBaslat();
      lobiyiYay();
    });
    sunucuyaYenidenBaglan(peer);
    peer.on('call', gelenArama);
    peer.on('connection', baglanti => {
      const misafir = { baglanti, sonMesaj: Date.now(), id: null };
      baglanti.on('data', m => {
        misafir.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') evMesaji(misafir, m);
      });
      const kapandi = () => {
        const p = ag.oyuncular.find(x => x.misafir === misafir);
        if (p) koptu(p);
      };
      baglanti.on('close', kapandi);
      baglanti.on('error', kapandi);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') odaKur();
      else if (ag.mod !== 'ev') {
        kilitle(false);
        durumYaz(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
      }
    });
  }

  function odaKodunuGoster() {
    $('odaBilgisi').innerHTML = `🔑 Oda <b>${ag.kod}</b>`;
    $('odaBilgisi').hidden = false;
  }

  // Lobi bilgisi: herkes takımları ve ayarları görür
  const herkesAcik = () => ag.oyuncular.map(p => ({ id: p.id, ad: p.ad, takim: p.takim, kaptan: p.kaptan, bagli: p.id === kimlik || !!p.misafir }));
  function lobiyiYay() {
    if (ag.mod !== 'ev') return;
    herkese({ tip: 'lobi', oyuncular: herkesAcik(), ayar: ag.ayar, basladi: ag.basladi });
    lobiGeldi(herkesAcik(), ag.ayar, ag.basladi);
  }

  function lobiEylemi(id, ad, deger) {
    const p = ag.oyuncular.find(x => x.id === id);
    if (!p) return;
    if (ad === 'takim' && ['k', 'm'].includes(deger) && !ag.basladi) {
      p.takim = deger;
      p.kaptan = false;
      // takımda kaptan yoksa ilk gelen kaptan olur
      if (!ag.oyuncular.some(x => x.takim === deger && x.kaptan && x !== p)) p.kaptan = true;
    } else if (ad === 'kaptan' && !ag.basladi) {
      ag.oyuncular.forEach(x => x.takim === p.takim && (x.kaptan = false));
      p.kaptan = true;
    } else if (ad === 'kaptan' && ag.basladi) {
      // Oyun sırasında: takımın kaptanı düştüyse yerine geçilebilir
      const kaptan = ag.oyuncular.find(x => x.takim === p.takim && x.kaptan);
      const kopuk = kaptan && kaptan.id !== kimlik && !kaptan.misafir;
      if (!kopuk) return;
      ag.oyuncular.forEach(x => x.takim === p.takim && (x.kaptan = false));
      p.kaptan = true;
      Motor.kaptanYap(p.id);
      durumYay('kaptanDegisti');
    } else if (ad === 'ayar' && id === kimlik && !ag.basladi && deger && typeof deger === 'object') {
      ag.ayar = { ...ag.ayar, ...deger };
      try { localStorage.setItem(AYAR_ANAHTAR, JSON.stringify(ag.ayar)); } catch (e) { /* yok */ }
    } else if (ad === 'karistir' && id === kimlik && !ag.basladi) {
      const karisik = [...ag.oyuncular].sort(() => Math.random() - 0.5);
      karisik.forEach((x, i) => { x.takim = i % 2 ? 'm' : 'k'; x.kaptan = false; });
      ['k', 'm'].forEach(t => { const ilk = karisik.find(x => x.takim === t); if (ilk) ilk.kaptan = true; });
    } else return;
    lobiyiYay();
  }

  function evMesaji(misafir, m) {
    if (m?.tip === 'katil' && !misafir.id) return katilanGeldi(misafir, m);
    const p = ag.oyuncular.find(x => x.misafir === misafir);
    if (!p) return;
    if (m?.tip === 'lobiEylem') lobiEylemi(p.id, m.ad, m.deger);
    else if (m?.tip === 'eylem' && ag.basladi) eylemIsle(p.id, m.ad, m.args || []);
    else if (m?.tip === 'cizim' && typeof m.resim === 'string' && m.resim.length < 900000) cizimGeldiEv(p.id, m.resim);
    else if (m?.tip === 'sohbet' && typeof m.metin === 'string') sohbetDagit(p.ad, m.metin, p.takim);
    else if (m?.tip === 'ses') {
      p.ses = !!m.acik;
      sesListesiYay();
    }
  }

  function katilanGeldi(misafir, m) {
    const reddet = neden => {
      misafir.baglanti.send({ tip: 'red', neden });
      setTimeout(() => misafir.baglanti.close(), 500);
    };
    if (m.surum !== SURUM) return reddet('Uygulaman eski sürümde kalmış. Uygulamayı tamamen kapatıp yeniden aç, sonra tekrar katıl.');
    const ad = String(m.ad ?? '').trim().slice(0, 12) || 'Oyuncu';
    const kucuk = s => String(s).trim().toLocaleLowerCase('tr');
    let p = ag.oyuncular.find(x => x.id === m.kimlik && x.id !== kimlik);
    if (!p && ag.basladi) p = ag.oyuncular.find(x => !x.misafir && x.id !== kimlik && kucuk(x.ad) === kucuk(ad));
    if (!p) {
      if (ag.basladi) return reddet('Oyun başlamış. Oyundan düşen bir oyuncuysan oyundaki adının aynısını yazıp tekrar katıl.');
      if (ag.oyuncular.length >= 12) return reddet('Oda dolu (12 kişi).');
      // Kişi sayısı az olan takıma girer
      const k = ag.oyuncular.filter(x => x.takim === 'k').length, mm = ag.oyuncular.filter(x => x.takim === 'm').length;
      const takim = k <= mm ? 'k' : 'm';
      p = { id: m.kimlik || Math.random().toString(36).slice(2), ad, takim, kaptan: !ag.oyuncular.some(x => x.takim === takim && x.kaptan), misafir: null };
      ag.oyuncular.push(p);
    }
    if (p.misafir && p.misafir !== misafir) p.misafir.baglanti.close();
    p.misafir = misafir;
    p.ses = false;
    misafir.id = p.id;
    gonder(misafir, { tip: 'kabul', id: p.id, surum: SURUM });
    Ses.sec();
    sesListesiYay();
    lobiyiYay();
    if (ag.basladi) {
      // Geri dönen: çizimleri ve güncel durumu alır
      Object.entries(ag.cizimler).forEach(([turNo, resim]) => gonder(misafir, { tip: 'cizim', turNo: +turNo, resim }));
      gonder(misafir, { tip: 'durum', d: gorunum(p.id), olay: { tip: 'geriDondu' } });
      sohbetDagit('', `${p.ad} oyuna geri döndü 👋`);
    }
  }

  function koptu(p) {
    if (!p.misafir) return;
    p.misafir = null;
    p.ses = false;
    sesListesiYay();
    if (!ag.basladi) {
      ag.oyuncular = ag.oyuncular.filter(x => x !== p);
      // Kaptanı giden takıma yeni kaptan
      ['k', 'm'].forEach(t => {
        if (!ag.oyuncular.some(x => x.takim === t && x.kaptan)) {
          const ilk = ag.oyuncular.find(x => x.takim === t);
          if (ilk) ilk.kaptan = true;
        }
      });
    } else sohbetDagit('', `${p.ad} oyundan düştü. Aynı adla geri girerse kaldığı yerden devam eder.`);
    lobiyiYay();
  }

  // Oyun başlatılabilir mi: her takımda kaptan + en az bir tahminci
  function hazirMi() {
    return ['k', 'm'].every(t => ag.oyuncular.some(x => x.takim === t && x.kaptan) && ag.oyuncular.some(x => x.takim === t && !x.kaptan));
  }

  function oyunuBaslat() {
    if (ag.mod !== 'ev' || !hazirMi()) return;
    ag.basladi = true;
    ag.cizimler = {};
    Motor.yeni(ag.oyuncular.map(p => ({ id: p.id, ad: p.ad, takim: p.takim, kaptan: p.kaptan })), (t, v) => durumYay(t, v), ag.ayar);
    lobiyiYay();
    durumYay('basla');
    sohbetDagit('', 'Oyun başladı. Bol şans! 🎨');
  }

  // Oyun sonu: aynı takımlarla bekleme odasına dön
  function lobiyeDon() {
    if (ag.mod !== 'ev') return;
    ag.basladi = false;
    Motor.temizle();
    herkese({ tip: 'lobiyeDon' });
    lobiyiYay();
    ekranLobi();
  }

  const gorunum = id => {
    const d = Motor.gorunum(id);
    if (d) {
      d.kalanMs = d.bitis - Date.now();
      d.baglilar = ag.oyuncular.filter(p => p.id === kimlik || p.misafir).map(p => p.id);
    }
    return d;
  };
  function durumYay(t, v = {}) {
    if (ag.mod !== 'ev') return;
    misafirler().forEach(p => gonder(p.misafir, { tip: 'durum', d: gorunum(p.id), olay: { tip: t, ...v } }));
    durumGeldi(gorunum(kimlik), { tip: t, ...v });
  }

  function eylemIsle(id, ad, args) {
    if (ad === 'kelime') Motor.kelimeGonder(id, args[0]);
    else if (ad === 'ipucu') Motor.ipucuVer(id, +args[0], String(args[1] ?? ''), !!args[2]);
    else if (ad === 'isaret') Motor.isaretle(id, +args[0]);
    else if (ad === 'sec') Motor.sec(id, +args[0]);
    else if (ad === 'bitir') Motor.turuBitir(id);
  }
  // Çizim: önce resim herkese dağıtılır, sonra ipucu verilir (resim gelmeden ipucu görünmesin)
  function cizimGeldiEv(id, resim) {
    const d = Motor.gorunum(id);
    const p = ag.oyuncular.find(x => x.id === id);
    if (!d || d.asama !== 'anlatim' || !p?.kaptan || p.takim !== d.sira) return;
    ag.cizimler[d.turNo] = resim;
    herkese({ tip: 'cizim', turNo: d.turNo, resim });
    cizimGeldi(d.turNo, resim);
  }

  // ---------- Herkes için: eylem gönder ----------
  function eylem(ad, ...args) {
    if (ag.mod === 'ev') eylemIsle(kimlik, ad, args);
    else if (ag.baglanti?.open) ag.baglanti.send({ tip: 'eylem', ad, args });
  }
  function lobiEylemGonder(ad, deger) {
    if (ag.mod === 'ev') lobiEylemi(kimlik, ad, deger);
    else if (ag.baglanti?.open) ag.baglanti.send({ tip: 'lobiEylem', ad, deger });
  }
  function cizimGonder(resim, sayi) {
    if (ag.mod === 'ev') {
      cizimGeldiEv(kimlik, resim);
      eylemIsle(kimlik, 'ipucu', [sayi, '', true]);
    } else if (ag.baglanti?.open) {
      ag.baglanti.send({ tip: 'cizim', resim });
      ag.baglanti.send({ tip: 'eylem', ad: 'ipucu', args: [sayi, '', true] });
    }
  }

  // ---------- Misafir: katılma ----------
  function odayaKatil(kod = $('odaKoduGir').value.trim().toUpperCase()) {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.hazirla();
    if (kod.length !== 5) {
      durumYaz('Oda kodu 5 karakter olmalı.');
      return;
    }
    ag.kod = kod;
    durumYaz('⏳ Odaya bağlanılıyor...');
    kilitle();
    try { ag.peer?.destroy(); } catch (e) { /* kapalı */ }
    const peer = new Peer();
    ag.peer = peer;
    peer.on('call', gelenArama);
    sunucuyaYenidenBaglan(peer);
    setTimeout(() => {
      if (ag.peer !== peer || ag.baglanti) return;
      durumYaz('❌ 15 saniyedir bağlanılamadı. Oda sahibi oyunu açık tutsun; farklı internetlerdeyseniz aynı Wi-Fi’ye bağlanmayı deneyin. Sonra tekrar <b>Katıl</b>’a bas.');
      oturumuUnut();
      kilitle(false);
    }, 15000);
    peer.on('open', () => {
      if (ag.peer !== peer || ag.baglanti) return;
      const baglanti = peer.connect(ODA_ONEKI + kod, { reliable: true });
      baglanti.on('open', () => {
        ag.baglanti = baglanti;
        ag.mod = 'misafir';
        baglanti.send({ tip: 'katil', ad, kimlik, surum: SURUM });
        nabziBaslat();
      });
      baglanti.on('data', m => {
        ag.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') misafirMesaji(m);
      });
      baglanti.on('close', () => ag.baglanti === baglanti && evdenKoptu());
      baglanti.on('error', () => ag.baglanti === baglanti && evdenKoptu());
    });
    peer.on('error', e => {
      if (ag.peer !== peer || ag.baglanti) return;
      kilitle(false);
      if (e.type === 'peer-unavailable') {
        oturumuUnut();
        kayit(SON_ODA, null);
        $('geriDonBtn').hidden = true;
      }
      durumYaz(e.type === 'peer-unavailable' ? '❌ Bu kodla açık bir oda bulunamadı. Kodu kontrol et.' : `❌ Bağlanılamadı (${e.type}).`);
    });
  }

  function misafirMesaji(m) {
    if (m?.tip === 'kabul') {
      if (m.surum !== SURUM) {
        durumYaz('❌ Oda sahibinin uygulaması farklı sürümde. İkiniz de uygulamayı kapatıp yeniden açın.');
        return;
      }
      ui.benimId = m.id;
      odaKodunuGoster();
      try { sessionStorage.setItem(OTOMATIK_KATIL, JSON.stringify({ kod: ag.kod })); } catch (e) { /* yok */ }
      kayit(SON_ODA, { kod: ag.kod, zaman: Date.now() });
    } else if (m?.tip === 'lobi') {
      lobiGeldi(m.oyuncular, m.ayar, m.basladi);
    } else if (m?.tip === 'red') {
      ag.baglanti = null;
      ag.mod = 'yerel';
      kilitle(false);
      oturumuUnut();
      durumYaz(`❌ Odaya girilemedi: ${guvenli(m.neden ?? '')}`);
    } else if (m?.tip === 'durum' && m.d) {
      if (typeof m.d.kalanMs === 'number') m.d.bitis = Date.now() + m.d.kalanMs;
      durumGeldi(m.d, m.olay || {});
    } else if (m?.tip === 'cizim' && typeof m.resim === 'string') {
      cizimGeldi(m.turNo, m.resim);
    } else if (m?.tip === 'lobiyeDon') {
      ekranLobi();
    } else if (m?.tip === 'sohbet') {
      sohbetGeldi(m.ad, m.metin, m.takim);
    } else if (m?.tip === 'sesListesi' && Array.isArray(m.liste)) {
      sesListesiGeldi(m.liste);
    }
  }

  function evdenKoptu() {
    if (!ag.baglanti) return;
    ag.baglanti = null;
    $('baglantiEkrani').hidden = false;
  }
  function oturumuUnut() {
    try { sessionStorage.removeItem(OTOMATIK_KATIL); } catch (e) { /* yok */ }
  }
  function ayril() {
    oturumuUnut();
    kayit(SON_ODA, null);
    try { ag.peer?.destroy(); } catch (e) { /* kapalı */ }
    location.reload();
  }

  // ---------- Sohbet (takım içi değil, herkese) ----------
  function sohbetDagit(ad, metin, takim = null) {
    metin = String(metin).trim().slice(0, 140);
    if (!metin) return;
    herkese({ tip: 'sohbet', ad, metin, takim });
    sohbetGeldi(ad, metin, takim);
  }
  function sohbetGonder(metin) {
    metin = metin.trim().slice(0, 140);
    if (!metin) return;
    if (ag.mod === 'ev') {
      const ben = ag.oyuncular.find(p => p.id === kimlik);
      sohbetDagit(ben.ad, metin, ben.takim);
    } else if (ag.baglanti?.open) ag.baglanti.send({ tip: 'sohbet', metin });
  }
  function sohbetGeldi(ad, metin, takim) {
    const satir = document.createElement('div');
    satir.className = `satir${ad ? '' : ' duyuru'}`;
    satir.innerHTML = ad ? `<b class="t${takim || ''}">${guvenli(ad)}:</b> ${guvenli(metin)}` : guvenli(metin);
    $('sohbetListe').appendChild(satir);
    $('sohbetListe').scrollTop = $('sohbetListe').scrollHeight;
    if ($('sohbetPaneli').hidden) {
      ag.okunmamis++;
      $('okunmamis').textContent = ag.okunmamis;
      $('okunmamis').hidden = false;
      if (ad) mesaj(`💬 ${ad}: ${metin}`, '', 2600);
    }
  }

  // ---------- Sesli sohbet (diğer oyunlarla aynı) ----------
  const ses = { akis: null, liste: [], aramalar: new Map() };
  function sesListesiYay() {
    if (ag.mod !== 'ev') return;
    const liste = ag.oyuncular.map(p => {
      const peerId = p.id === kimlik ? ag.peer?.id : p.misafir?.baglanti.peer;
      return p.ses && peerId ? { id: p.id, peerId } : null;
    }).filter(Boolean);
    herkese({ tip: 'sesListesi', liste });
    sesListesiGeldi(liste);
  }
  function sesListesiGeldi(liste) {
    ses.liste = liste;
    const benim = ui.benimId;
    const benSesteyim = !!ses.akis && liste.some(x => x.id === benim);
    ses.aramalar.forEach((a, peerId) => { if (!benSesteyim || !liste.some(x => x.peerId === peerId)) aramayiKapat(peerId); });
    if (benSesteyim) {
      // İkiliden peerId'si büyük olan arar (bir kez bağlansın)
      liste.filter(x => x.id !== benim && x.peerId > ag.peer.id && !ses.aramalar.has(x.peerId)).forEach(x => aramayaBagla(ag.peer.call(x.peerId, ses.akis)));
    }
    sesDugmesiniCiz();
  }
  function gelenArama(call) {
    if (!ses.akis) return call.close();
    call.answer(ses.akis);
    aramayaBagla(call);
  }
  function aramayaBagla(call) {
    if (!call) return;
    aramayiKapat(call.peer);
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    ses.aramalar.set(call.peer, { call, audio });
    call.on('stream', akis => {
      audio.srcObject = akis;
      audio.play().catch(() => {});
    });
    const bitti = () => { if (ses.aramalar.get(call.peer)?.call === call) aramayiKapat(call.peer); };
    call.on('close', bitti);
    call.on('error', bitti);
  }
  function aramayiKapat(peerId) {
    const a = ses.aramalar.get(peerId);
    if (!a) return;
    ses.aramalar.delete(peerId);
    a.audio.srcObject = null;
    try { a.call.close(); } catch (e) { /* kapalı */ }
  }
  async function sesAcKapa() {
    if (ses.akis) {
      ses.akis.getTracks().forEach(t => t.stop());
      ses.akis = null;
      sesDurumuBildir(false);
      return;
    }
    try {
      ses.akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      mesaj('🎤 Mikrofona izin verilmedi. Tarayıcıya mikrofon izni ver.', 'kirmizi', 3500);
      return;
    }
    sesDurumuBildir(true);
    mesaj('🎙️ Sesli sohbettesin.', '', 2000);
  }
  function sesDurumuBildir(acik) {
    if (ag.mod === 'ev') {
      ag.oyuncular.find(p => p.id === kimlik).ses = acik;
      sesListesiYay();
    } else if (ag.baglanti?.open) {
      ag.baglanti.send({ tip: 'ses', acik });
      if (!acik) sesListesiGeldi(ses.liste);
    }
    sesDugmesiniCiz();
  }
  function sesDugmesiniCiz() {
    const acik = !!ses.akis;
    $('sesliBtn').classList.toggle('acik', acik);
    $('sesliBtn').textContent = acik ? '🎙️' : '🎤';
  }

  // ---------- Kurulum ----------
  $('odaKurBtn').addEventListener('click', odaKur);
  $('katilBtn').addEventListener('click', () => odayaKatil());
  $('odaKoduGir').addEventListener('keydown', e => e.key === 'Enter' && odayaKatil());
  $('odaIptalBtn').addEventListener('click', ayril);
  $('yenidenBaglanBtn').addEventListener('click', () => location.reload());
  $('baglantiCikBtn').addEventListener('click', ayril);
  $('sohbetBtn').addEventListener('click', () => {
    $('sohbetPaneli').hidden = false;
    ag.okunmamis = 0;
    $('okunmamis').hidden = true;
  });
  $('sesliBtn').addEventListener('click', sesAcKapa);
  $('sohbetKapat').addEventListener('click', () => ($('sohbetPaneli').hidden = true));
  $('sohbetForm').addEventListener('submit', e => {
    e.preventDefault();
    sohbetGonder($('sohbetYazi').value);
    $('sohbetYazi').value = '';
  });

  try {
    const otomatik = JSON.parse(sessionStorage.getItem(OTOMATIK_KATIL));
    if (otomatik?.kod && $('adim').value.trim()) setTimeout(() => odayaKatil(otomatik.kod), 300);
  } catch (e) { /* elle */ }
  try {
    const son = JSON.parse(localStorage.getItem(SON_ODA));
    if (son?.kod && Date.now() - son.zaman < 3 * 3600 * 1000) {
      $('geriDonBtn').textContent = `🔁 ${son.kod} odasına geri dön`;
      $('geriDonBtn').hidden = false;
      $('geriDonBtn').addEventListener('click', () => odayaKatil(son.kod));
    }
  } catch (e) { /* yok */ }

  return {
    eylem, lobiEylemGonder, cizimGonder, oyunuBaslat, lobiyeDon, ayril, hazirMi, ayarOku,
    get mod() { return ag.mod; },
    get ben() { return kimlik; },
    sesteMi: id => ses.liste.some(x => x.id === id),
    cizim: turNo => ag.cizimler[turNo],
    set cizimKaydet([turNo, resim]) { ag.cizimler[turNo] = resim; },
  };
})();
