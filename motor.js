// =============================================================
// Kod Adı Çizim - oyun motoru (oda sahibinin cihazında çalışır)
//
// Kurallar:
//   - 25 kelime. Başlayan takımın 9, diğerinin 8 kelimesi var; 7 nötr, 1 ölümcül (☠️).
//   - Kelimelerin rengini sadece kaptanlar görür.
//   - Sıradaki takımın kaptanı çizerek (ya da yazarak) bir ipucu ve bir sayı verir.
//   - Takımın tahmincileri kelimeleri işaretler; biri "Bu kelime!" deyince kelime açılır.
//     Kendi rengiyse devam (en fazla sayı+1 tahmin), nötr ya da rakip rengiyse sıra geçer,
//     ölümcülse o takım kaybeder. Tahminciler istediği an turu bitirebilir.
//   - Kendi kelimelerinin hepsini ilk açan takım kazanır (rakip yanlışlıkla açsa da sayılır).
//   - "Kendi kelimelerimiz" modunda oyun başında herkes kelime yazar (toplam 25).
// =============================================================

const Motor = (() => {
  const TAKIMLAR = ['k', 'm'];   // kırmızı, mavi
  const KELIME_SURESI = 150;     // kelime yazma süresi (sn)

  let o = null;
  let dinleyici = () => {};
  let zamanlayici = null;

  const rastgele = n => Math.floor(Math.random() * n);
  const karistir = d => {
    for (let i = d.length - 1; i > 0; i--) {
      const j = rastgele(i + 1);
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  };
  const olay = (tip, veri = {}) => {
    try { dinleyici(tip, veri); } catch (e) { console.error('Olay işlenirken hata:', tip, e); }
  };
  const karsi = t => (t === 'k' ? 'm' : 'k');
  const temizKelime = s => String(s || '').trim().toLocaleUpperCase('tr').replace(/\s+/g, ' ').slice(0, 18);

  // oyuncular: [{ id, ad, takim: 'k'|'m', kaptan }], ayar: { anlatim: 'cizim'|'yazi', kelime: 'otomatik'|'kendi', sure }
  function yeni(oyuncular, dinle, ayar = {}) {
    clearTimeout(zamanlayici);
    dinleyici = dinle || (() => {});
    o = {
      oyuncular: oyuncular.map(p => ({ id: p.id, ad: p.ad, takim: p.takim, kaptan: !!p.kaptan })),
      ayar: { anlatim: ayar.anlatim === 'yazi' ? 'yazi' : 'cizim', kelime: ayar.kelime === 'kendi' ? 'kendi' : 'otomatik', sure: [60, 90, 120].includes(+ayar.sure) ? +ayar.sure : 90 },
      asama: 'kelime', kelimeler: [], sira: 'k', baslayan: 'k', ipucu: null, kalanTahmin: 0, tahminSayisi: 0,
      isaretler: {}, turNo: 0, kazanan: null, sebep: null, bitis: 0, gecmis: [],
      kotalar: {}, girilen: {},
    };
    if (o.ayar.kelime === 'kendi') {
      // 25 kelimeyi oyuncular arasında bölüştür (fazlası ilk oyunculara)
      const n = o.oyuncular.length;
      o.oyuncular.forEach((p, i) => (o.kotalar[p.id] = Math.floor(25 / n) + (i < 25 % n ? 1 : 0)));
      o.bitis = Date.now() + KELIME_SURESI * 1000;
      zamanlayici = setTimeout(() => tahtaKur(), KELIME_SURESI * 1000);
      olay('kelimeYazma', { kotalar: o.kotalar });
    } else setTimeout(() => tahtaKur(), 200);
    return o;
  }

  const oyuncu = id => o?.oyuncular.find(p => p.id === id);

  // "Kendi kelimelerimiz": oyuncu kelimelerini gönderir
  function kelimeGonder(id, liste) {
    if (!o || o.asama !== 'kelime' || !oyuncu(id) || !Array.isArray(liste)) return false;
    const temiz = [...new Set(liste.map(temizKelime).filter(k => k.length >= 2))].slice(0, o.kotalar[id]);
    if (!temiz.length) return false;
    o.girilen[id] = temiz;
    olay('kelimeGeldi', { id, adet: temiz.length });
    if (o.oyuncular.every(p => o.girilen[p.id])) {
      clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => tahtaKur(), 600);
    }
    return true;
  }

  function tahtaKur() {
    if (o.asama !== 'kelime') return;
    let liste = [];
    if (o.ayar.kelime === 'kendi') liste = [...new Set(Object.values(o.girilen).flat())];
    // Eksik kalanlar (yazmayan ya da aynı kelimeyi yazan olursa) otomatik listeden tamamlanır
    const havuz = karistir(KELIMELER.filter(k => !liste.includes(k)));
    while (liste.length < 25) liste.push(havuz.pop());
    liste = karistir(liste.slice(0, 25));
    o.baslayan = TAKIMLAR[rastgele(2)];
    const renkler = karistir([...Array(9).fill(o.baslayan), ...Array(8).fill(karsi(o.baslayan)), ...Array(7).fill('n'), 'x']);
    o.kelimeler = liste.map((k, i) => ({ k, renk: renkler[i], acik: false, acan: null }));
    o.sira = o.baslayan;
    olay('tahta', { baslayan: o.baslayan });
    turBasla();
  }

  function turBasla() {
    clearTimeout(zamanlayici);
    o.turNo++;
    o.asama = 'anlatim';
    o.ipucu = null;
    o.isaretler = {};
    o.tahminSayisi = 0;
    o.bitis = Date.now() + o.ayar.sure * 1000;
    olay('anlatim', { sira: o.sira, turNo: o.turNo });
    // Süre dolunca anlatıcının ekranı çizimi olduğu gibi gönderir (ağ için 3 sn pay).
    // Hiçbir şey gelmezse (boş tuval / bağlantı yok) sıra karşı takıma geçer.
    zamanlayici = setTimeout(() => {
      if (o.asama !== 'anlatim') return;
      olay('sureDoldu', { takim: o.sira });
      o.gecmis.push({ turNo: o.turNo, takim: o.sira, sayi: 0, metin: null, cizim: false, acilanlar: [], bos: true });
      o.sira = karsi(o.sira);
      zamanlayici = setTimeout(turBasla, 1500);
    }, o.ayar.sure * 1000 + 3000);
  }

  const kaptanMi = (id, takim) => { const p = oyuncu(id); return p && p.kaptan && p.takim === takim; };
  const tahminciMi = (id, takim) => { const p = oyuncu(id); return p && !p.kaptan && p.takim === takim; };

  // Kaptan ipucu verir: sayı (1-9) + yazı (yazı modunda) / çizim (resim ayrıca dağıtılır)
  function ipucuVer(id, sayi, metin, cizimVar) {
    if (!o || o.asama !== 'anlatim' || !kaptanMi(id, o.sira)) return false;
    sayi = Math.max(1, Math.min(9, +sayi || 1));
    if (o.ayar.anlatim === 'yazi') {
      metin = temizKelime(metin).split(' ')[0];
      if (!metin || o.kelimeler.some(k => !k.acik && k.k === metin)) return false;   // tahtadaki kelime ipucu olamaz
    }
    clearTimeout(zamanlayici);
    o.ipucu = { turNo: o.turNo, takim: o.sira, sayi, metin: o.ayar.anlatim === 'yazi' ? metin : null, cizim: !!cizimVar };
    o.asama = 'tahmin';
    o.kalanTahmin = sayi + 1;
    o.gecmis.push({ turNo: o.turNo, takim: o.sira, sayi, metin: o.ipucu.metin, cizim: !!cizimVar, acilanlar: [] });
    olay('ipucu', { ...o.ipucu });
    return true;
  }

  // Tahminci bir kelimeyi işaretler / işaretini kaldırır
  function isaretle(id, i) {
    if (!o || o.asama !== 'tahmin' || !tahminciMi(id, o.sira) || !o.kelimeler[i] || o.kelimeler[i].acik) return false;
    const liste = o.isaretler[i] || [];
    o.isaretler[i] = liste.includes(id) ? liste.filter(x => x !== id) : [...liste, id];
    if (!o.isaretler[i].length) delete o.isaretler[i];
    olay('isaret', { i });
    return true;
  }

  // "Bu kelime!": kelime açılır
  function sec(id, i) {
    if (!o || o.asama !== 'tahmin' || !tahminciMi(id, o.sira)) return false;
    const k = o.kelimeler[i];
    if (!k || k.acik) return false;
    k.acik = true;
    k.acan = id;
    delete o.isaretler[i];
    o.tahminSayisi++;
    o.gecmis[o.gecmis.length - 1].acilanlar.push({ k: k.k, renk: k.renk });
    const takim = o.sira;
    let sonuc;
    if (k.renk === 'x') {
      sonuc = 'olumcul';
      bitir(karsi(takim), 'olumcul');
    } else if (kalan(k.renk === 'n' ? takim : k.renk) === 0 && k.renk !== 'n') {
      sonuc = k.renk === takim ? 'dogru' : 'rakip';
      bitir(k.renk, 'tamam');
    } else if (k.renk === takim) {
      sonuc = 'dogru';
      o.kalanTahmin--;
    } else sonuc = k.renk === 'n' ? 'notr' : 'rakip';
    olay('acildi', { i, kelime: k.k, renk: k.renk, takim, sonuc, kim: id });
    if (o.asama === 'bitti') return true;
    if (sonuc !== 'dogru' || o.kalanTahmin <= 0) {
      o.asama = 'gecis';
      o.sira = karsi(takim);
      zamanlayici = setTimeout(turBasla, 2200);
    }
    return true;
  }

  // Tahminciler pas der / turu bitirir (hiç tahmin yapmadan da olur)
  function turuBitir(id) {
    if (!o || o.asama !== 'tahmin' || !tahminciMi(id, o.sira)) return false;
    olay('turBitti', { takim: o.sira, kim: id });
    o.asama = 'gecis';
    o.sira = karsi(o.sira);
    zamanlayici = setTimeout(turBasla, 1200);
    return true;
  }

  const kalan = takim => o.kelimeler.filter(k => k.renk === takim && !k.acik).length;

  function bitir(kazanan, sebep) {
    clearTimeout(zamanlayici);
    o.asama = 'bitti';
    o.kazanan = kazanan;
    o.sebep = sebep;
    o.kelimeler.forEach(k => (k.goster = true));
    setTimeout(() => olay('bitti', { kazanan, sebep }), 900);
  }

  // id numaralı oyuncu ne görür: kaptanlar (ve oyun bitince herkes) bütün renkleri görür
  function gorunum(id) {
    if (!o) return null;
    const p = oyuncu(id);
    const hepsi = (p && p.kaptan) || o.asama === 'bitti';
    return {
      asama: o.asama, sira: o.sira, baslayan: o.baslayan, turNo: o.turNo, bitis: o.bitis, ayar: o.ayar,
      ipucu: o.ipucu, kalanTahmin: o.kalanTahmin, tahminSayisi: o.tahminSayisi, kazanan: o.kazanan, sebep: o.sebep,
      kalan: o.kelimeler.length ? { k: kalan('k'), m: kalan('m') } : { k: 0, m: 0 },
      kelimeler: o.kelimeler.map(k => ({ k: k.k, acik: k.acik, renk: k.acik || hepsi ? k.renk : null, acan: k.acan })),
      isaretler: o.isaretler, gecmis: o.gecmis,
      oyuncular: o.oyuncular,
      kota: o.kotalar[id] || 0, kelimeGonderdi: !!o.girilen[id],
      kelimeDurum: o.oyuncular.map(x => ({ id: x.id, gonderdi: !!o.girilen[x.id] })),
    };
  }

  // Oyun sırasında kopan oyuncu geri gelince adı / bağlantısı güncellenir (takımı aynı kalır)
  function oyuncuGuncelle(id, ad) {
    const p = oyuncu(id);
    if (p) p.ad = ad;
  }
  // Kaptan oyundan tamamen düşerse takımından biri kaptan olabilir
  function kaptanYap(id) {
    const p = oyuncu(id);
    if (!p || !o || o.asama === 'bitti') return false;
    o.oyuncular.forEach(x => x.takim === p.takim && (x.kaptan = false));
    p.kaptan = true;
    olay('kaptanDegisti', { id, takim: p.takim });
    return true;
  }

  return {
    yeni, kelimeGonder, ipucuVer, isaretle, sec, turuBitir, gorunum, oyuncuGuncelle, kaptanYap,
    temizle: () => clearTimeout(zamanlayici), KELIME_SURESI,
    get aktif() { return !!o && o.asama !== 'bitti'; },
  };
})();
