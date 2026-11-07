// =============================================================
// Kod Adı Çizim - ekran: menü/bekleme odası, kelime yazma, tahta, kaptanın çizim tuvali,
// ipucu, işaretleme ve "Bu kelime!", oyun sonu galerisi
// =============================================================

const $ = id => document.getElementById(id);
const ANAHTAR_AD = 'kodAdiCizim.ad';
const kayitOku = (a, v) => { try { return localStorage.getItem(a) ?? v; } catch (e) { return v; } };
const kayitYaz = (a, v) => { try { localStorage.setItem(a, v); } catch (e) { /* yok */ } };
const guvenli = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ui = { benimId: null, durum: null, lobi: null, ayar: null, cizimler: {}, sonGosterilenIpucu: 0, secilenSayi: 1 };
const TAKIM_ADI = { k: 'Kırmızı', m: 'Mavi' };
const TAKIM_EMOJI = { k: '🔴', m: '🔵' };

$('adim').value = kayitOku(ANAHTAR_AD, '');

// ---------- Bekleme odası ----------
function lobiGeldi(oyuncular, ayar, basladi) {
  ui.lobi = oyuncular;
  ui.ayar = ayar;
  if (basladi) return;
  ekranLobi();
}
function ekranLobi() {
  $('oyun').hidden = true;
  $('sonEkran').hidden = true;
  $('kelimeEkrani').hidden = true;
  $('menu').hidden = false;
  $('girisAlani').hidden = true;
  $('onlineDurum').innerHTML = '';
  $('lobi').hidden = false;
  const oy = ui.lobi || [];
  const ev = Ag.mod === 'ev';
  const satir = p => `<div class="oyuncu${p.id === ui.benimId ? ' ben' : ''}${p.bagli ? '' : ' kopuk'}">${guvenli(p.ad)}${p.id === ui.benimId ? ' <small>(sen)</small>' : ''}</div>`;
  const ben = oy.find(p => p.id === ui.benimId);
  ['k', 'm'].forEach(t => {
    const harf = t.toUpperCase();
    const anlatici = oy.find(p => p.takim === t && p.kaptan);
    const benBurada = rol => ben && ben.takim === t && !!ben.kaptan === (rol === 'anlatici');
    $(`lobi${harf}A`).innerHTML = anlatici
      ? satir(anlatici) + (!anlatici.bagli && !benBurada('anlatici') ? `<button class="yerBtn" data-takim="${t}" data-rol="anlatici">🎨 Yerine geç</button>` : '')
      : `<button class="yerBtn" data-takim="${t}" data-rol="anlatici">🎨 Anlatıcı ol</button>`;
    const tahminciler = oy.filter(p => p.takim === t && !p.kaptan);
    $(`lobi${harf}T`).innerHTML = (tahminciler.map(satir).join('') || '<div class="bos">henüz kimse yok</div>')
      + (benBurada('tahminci') ? '' : `<button class="yerBtn" data-takim="${t}" data-rol="tahminci">🔍 Tahminci ol</button>`);
  });
  $('lobiKod').innerHTML = `Oda kodu: <b>${guvenli($('odaBilgisi').textContent.replace('🔑 Oda ', ''))}</b><br><small>Arkadaşların bu kodu “Katıl” kısmına yazsın.</small>`;
  // Ayarlar (sadece oda sahibi değiştirir)
  document.querySelectorAll('.ayarlar .secenek').forEach(s => {
    s.querySelectorAll('button').forEach(b => {
      b.classList.toggle('secili', String(ui.ayar?.[s.dataset.ayar]) === b.dataset.deger);
      b.disabled = !ev;
    });
  });
  $('ayarNotu').textContent = ev ? '' : '(oda sahibi seçer)';
  $('karistirBtn').hidden = !ev;
  $('baslatBtn').hidden = !ev;
  const hazir = ['k', 'm'].every(t => oy.some(x => x.takim === t && x.kaptan) && oy.some(x => x.takim === t && !x.kaptan));
  $('baslatBtn').disabled = !hazir;
  $('baslatNot').textContent = hazir ? (ev ? 'Herkes hazırsa başlat!' : '⏳ Oda sahibinin başlatması bekleniyor…')
    : 'Başlamak için her takımda bir anlatıcı ve en az bir tahminci olmalı (en az 4 kişi).';
}
document.querySelector('.takimlar').addEventListener('click', e => {
  const b = e.target.closest('.yerBtn');
  if (!b) return;
  Ses.sec();
  Ag.lobiEylemGonder('yer', { takim: b.dataset.takim, rol: b.dataset.rol });
});
$('karistirBtn').addEventListener('click', () => { Ses.sec(); Ag.lobiEylemGonder('karistir'); });
$('baslatBtn').addEventListener('click', () => Ag.oyunuBaslat());
document.querySelectorAll('.ayarlar .secenek').forEach(s => s.addEventListener('click', e => {
  const b = e.target.closest('button[data-deger]');
  if (!b || b.disabled) return;
  Ses.sec();
  const deger = s.dataset.ayar === 'sure' ? +b.dataset.deger : b.dataset.deger;
  Ag.lobiEylemGonder('ayar', { [s.dataset.ayar]: deger });
}));

// ---------- Oyun durumu geldi ----------
const benimOyuncu = () => ui.durum?.oyuncular.find(p => p.id === ui.benimId);
const adi = id => ui.durum?.oyuncular.find(p => p.id === id)?.ad ?? '';

function durumGeldi(d, olay) {
  const onceki = ui.durum;
  ui.durum = d;
  if (olay.tip === 'basla' || !onceki) {
    ui.cizimler = {};
    ui.sonGosterilenIpucu = 0;
  }
  if (d.asama === 'kelime') {
    ekranKelime();
    return;
  }
  $('menu').hidden = true;
  $('kelimeEkrani').hidden = true;
  $('oyun').hidden = false;
  const ben = benimOyuncu();
  switch (olay.tip) {
    case 'tahta':
      Ses.dagit?.();
      mesaj(`🎲 ${TAKIM_EMOJI[olay.baslayan]} ${TAKIM_ADI[olay.baslayan]} takım başlıyor (9 kelime)`, 'iri', 2600);
      break;
    case 'anlatim':
      cizimTemizle();
      ui.secilenSayi = 1;
      if (ben?.kaptan && ben.takim === d.sira) {
        Ses.siraSende();
        mesaj(d.ayar.anlatim === 'cizim' ? '✏️ Sıra sende: takımına bir resim çiz!' : '⌨️ Sıra sende: tek kelimelik ipucu yaz!', 'iri', 2400);
      } else mesaj(`${TAKIM_EMOJI[d.sira]} ${TAKIM_ADI[d.sira]} anlatıcısı ${d.ayar.anlatim === 'cizim' ? 'çiziyor' : 'düşünüyor'}…`, '', 2200);
      break;
    case 'ipucu':
      Ses.kartAc?.(1);
      if (ben && !ben.kaptan && ben.takim === d.sira) {
        Ses.siraSende();
        mesaj(`💡 İpucu geldi: ${olay.sayi} kelime! Tahmin edin.`, 'iri', 2200);
      }
      break;
    case 'acildi': {
      const ses = { dogru: 'dogruCikti', notr: 'kartAt', rakip: 'yalanCikti', olumcul: 'bam' }[olay.sonuc];
      Ses[ses]?.();
      const yazi = { dogru: '✅ Doğru!', notr: '😐 Nötr kelime, sıra geçti', rakip: '❌ Rakip takımın kelimesi! Sıra geçti', olumcul: '☠️ ÖLÜMCÜL KELİME!' }[olay.sonuc];
      mesaj(`${olay.kelime}: ${yazi}`, olay.sonuc === 'dogru' ? '' : 'kirmizi', 2200);
      break;
    }
    case 'turBitti':
      mesaj(`⏭️ ${TAKIM_ADI[olay.takim]} takım turu bitirdi`, '', 1800);
      break;
    case 'sureDoldu':
      mesaj(`⏰ ${TAKIM_ADI[olay.takim]} anlatıcısının süresi doldu, sıra geçti`, 'kirmizi', 2400);
      break;
    case 'kaptanDegisti':
      mesaj(`🎨 ${adi(olay.id)} artık ${TAKIM_ADI[olay.takim]} takımın anlatıcısı`, '', 2400);
      break;
    case 'bitti':
      setTimeout(sonuGoster, 600);
      break;
  }
  ciz();
}

// ---------- Kelime yazma ----------
function ekranKelime() {
  const d = ui.durum;
  $('menu').hidden = true;
  $('oyun').hidden = true;
  $('kelimeEkrani').hidden = false;
  if (!d.kelimeGonderdi) {
    if ($('kelimeAlanlari').children.length !== d.kota) {
      $('kelimeAlanlari').innerHTML = [...Array(d.kota)].map((_, i) => `<input maxlength="18" placeholder="${i + 1}. kelime" autocomplete="off" required>`).join('');
    }
    $('kelimeAciklama').textContent = `Oyunda kullanılacak ${d.kota} kelime yaz. Çizilebilir şeyler seç (ör. ELMA, KORSAN, ROKET). Tek kelime olsun.`;
    $('kelimeForm').hidden = false;
  } else $('kelimeForm').hidden = true;
  $('kelimeBekle').innerHTML = '<p>Kelimesini gönderenler:</p>' + d.oyuncular.map(p => `<span class="${d.kelimeDurum.find(x => x.id === p.id)?.gonderdi ? 'tamam' : 'bekle'}">${guvenli(p.ad)} ${d.kelimeDurum.find(x => x.id === p.id)?.gonderdi ? '✅' : '⏳'}</span>`).join(' ')
    + '<p class="not">Süre dolarsa eksik kelimeler otomatik listeden tamamlanır.</p>';
}
$('kelimeForm').addEventListener('submit', e => {
  e.preventDefault();
  const liste = [...$('kelimeAlanlari').querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
  if (!liste.length) return;
  Ses.sec();
  Ag.eylem('kelime', liste);
});

// ---------- Çizim ----------
function cizimGeldi(turNo, resim) {
  ui.cizimler[turNo] = resim;
  ciz();
}

// ---------- Tahta ve paneller ----------
function ciz() {
  const d = ui.durum;
  if (!d || d.asama === 'kelime') return;
  const ben = benimOyuncu();
  const kaptanim = ben?.kaptan;
  const siradaKaptan = d.asama === 'anlatim' && kaptanim && ben.takim === d.sira;
  const tahmincim = d.asama === 'tahmin' && ben && !ben.kaptan && ben.takim === d.sira;
  // Skor
  $('skor').innerHTML = ['k', 'm'].map(t => `<span class="skorT t${t}${d.sira === t && d.asama !== 'bitti' ? ' sirada' : ''}">${TAKIM_EMOJI[t]} ${d.kalan[t]}</span>`).join('');
  // Takımlar: kim hangi takımda, anlatıcı mı tahminci mi
  const bagli = id => !d.baglilar || d.baglilar.includes(id);
  $('takimSeridi').innerHTML = ['k', 'm'].map(t => {
    const uyeler = d.oyuncular.filter(p => p.takim === t).sort((a, b) => b.kaptan - a.kaptan);
    const benimki = ben?.takim === t;
    const kisi = p => `<span class="uye${p.kaptan ? ' anlatici' : ''}${p.id === ui.benimId ? ' ben' : ''}${bagli(p.id) ? '' : ' kopuk'}">${p.kaptan ? '🎨' : '🔍'} ${guvenli(p.ad)}${p.id === ui.benimId ? ' <b>(sen)</b>' : ''}</span>`;
    return `<div class="seritTakim t${t}${benimki ? ' benim' : ''}">
      <div class="seritBaslik">${TAKIM_EMOJI[t]} ${TAKIM_ADI[t]}${benimki ? ` <span class="seninTakim">SEN: ${ben.kaptan ? '🎨 ANLATICI' : '🔍 TAHMİNCİ'}</span>` : ''}</div>
      <div class="uyeler">${uyeler.map(kisi).join('')}</div></div>`;
  }).join('');
  $('oyun').classList.toggle('benK', ben?.takim === 'k');
  $('oyun').classList.toggle('benM', ben?.takim === 'm');
  // Durum yazısı
  const takimAdi = `${TAKIM_EMOJI[d.sira]} ${TAKIM_ADI[d.sira]}`;
  $('durumYazi').innerHTML = d.asama === 'bitti' ? `🏆 ${TAKIM_EMOJI[d.kazanan]} ${TAKIM_ADI[d.kazanan]} takım kazandı!`
    : d.asama === 'anlatim' ? (siradaKaptan ? '✏️ <b>Sıra sende!</b> İpucunu hazırla' : `${takimAdi} anlatıcısı ${d.ayar.anlatim === 'cizim' ? 'çiziyor' : 'düşünüyor'}…`)
    : d.asama === 'tahmin' ? (tahmincim ? `🔍 <b>Tahmin sırası sizde!</b> Kalan hak: ${d.kalanTahmin}` : `${takimAdi} takım tahmin ediyor (kalan hak: ${d.kalanTahmin})`)
    : '…';
  $('durumYazi').className = `t${d.sira}`;
  // Tahta
  const isaretler = d.isaretler || {};
  $('tahta').innerHTML = d.kelimeler.map((k, i) => {
    const benIsaretledim = (isaretler[i] || []).includes(ui.benimId);
    const isaretciler = (isaretler[i] || []).map(id => `<i title="${guvenli(adi(id))}">${guvenli(adi(id).slice(0, 2))}</i>`).join('');
    const sinif = ['kelime', k.renk ? `r${k.renk}` : '', k.acik ? 'acik' : '', kaptanim && !k.acik ? 'kaptanGorur' : '', benIsaretledim ? 'benim' : '', tahmincim && !k.acik ? 'secilebilir' : ''].join(' ');
    return `<div class="${sinif}" data-i="${i}"><span>${guvenli(k.k)}</span>${k.acik && k.renk === 'x' ? '<b class="olum">☠️</b>' : ''}`
      + `${isaretciler ? `<div class="isaretler">${isaretciler}</div>` : ''}${benIsaretledim && tahmincim ? `<button class="buKelime" data-sec="${i}">✅ Bu kelime!</button>` : ''}</div>`;
  }).join('');
  // İpucu kutusu
  const ip = d.ipucu;
  if (ip && d.asama !== 'anlatim') {
    const resim = ui.cizimler[ip.turNo];
    $('ipucuKutusu').innerHTML = `<div class="ipBaslik t${ip.takim}">${TAKIM_EMOJI[ip.takim]} ${TAKIM_ADI[ip.takim]} anlatıcısının ipucu</div>`
      + (ip.cizim ? (resim ? `<img class="ipResim" src="${resim}" alt="çizim">` : '<p>⏳ Çizim yükleniyor…</p>') : `<div class="ipYazi">${guvenli(ip.metin)}</div>`)
      + `<div class="ipSayi">${ip.sayi} kelime</div>`;
  } else $('ipucuKutusu').innerHTML = d.asama === 'anlatim' && !siradaKaptan ? `<div class="bekliyor">${d.ayar.anlatim === 'cizim' ? '🎨' : '💭'} ${TAKIM_ADI[d.sira]} anlatıcısı hazırlıyor…<br><small>Çizim gönderilince burada görünecek</small></div>` : '';
  $('ipucuKutusu').hidden = siradaKaptan;
  // Kaptan paneli
  $('kaptanPaneli').hidden = !siradaKaptan;
  if (siradaKaptan) {
    $('cizimAlani').hidden = d.ayar.anlatim !== 'cizim';
    $('yaziAlani').hidden = d.ayar.anlatim !== 'yazi';
    $('sayilar').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}" class="${n === ui.secilenSayi ? 'secili' : ''}">${n}</button>`).join('');
  }
  $('alan').classList.toggle('cizimModu', siradaKaptan && d.ayar.anlatim === 'cizim');
  // Tahminci paneli
  $('tahminPaneli').hidden = !tahmincim;
  if (tahmincim) {
    $('tahminYazi').textContent = 'Kelimeye dokun: işaretlenir (takımın görür). Emin olunca “✅ Bu kelime!” de.';
    $('bitirBtn').disabled = !d.tahminSayisi;
  }
}

$('tahta').addEventListener('click', e => {
  const sec = e.target.closest('button[data-sec]');
  if (sec) {
    e.stopPropagation();
    Ag.eylem('sec', +sec.dataset.sec);
    return;
  }
  const kart = e.target.closest('.kelime.secilebilir');
  if (!kart) return;
  Ses.sec();
  Ag.eylem('isaret', +kart.dataset.i);
});
$('bitirBtn').addEventListener('click', () => Ag.eylem('bitir'));
$('sayilar').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]');
  if (!b) return;
  ui.secilenSayi = +b.dataset.n;
  Ses.sec();
  ciz();
});
$('gonderBtn').addEventListener('click', () => {
  const d = ui.durum;
  if (d.ayar.anlatim === 'cizim') {
    if (!cizgiler.length) return mesaj('Önce bir şey çiz 🙂', 'kirmizi', 1500);
    Ag.cizimGonder(cizimResmi(), ui.secilenSayi);
  } else {
    const metin = $('ipucuYazi').value.trim();
    if (!metin) return mesaj('Önce ipucunu yaz 🙂', 'kirmizi', 1500);
    if (d.kelimeler.some(k => !k.acik && k.k === metin.toLocaleUpperCase('tr'))) return mesaj('Tahtadaki bir kelimeyi ipucu olarak veremezsin!', 'kirmizi', 2200);
    Ag.eylem('ipucu', ui.secilenSayi, metin.split(/\s+/)[0], false);
    $('ipucuYazi').value = '';
  }
  Ses.sec();
});

// ---------- Çizim tuvali ----------
const tuval = $('tuval');
const g = tuval.getContext('2d');
const RENKLER = ['#1a1a1a', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#ae3ec9', '#8a5a2b', '#f783ac'];
let cizgiler = [], kalem = { renk: RENKLER[0], kalinlik: 9, silgi: false }, aktifCizgi = null;
$('renkler').innerHTML = RENKLER.map((r, i) => `<button data-r="${r}" style="background:${r}" class="${i ? '' : 'secili'}"></button>`).join('');
$('renkler').addEventListener('click', e => {
  const b = e.target.closest('button[data-r]');
  if (!b) return;
  kalem.renk = b.dataset.r;
  kalem.silgi = false;
  document.querySelectorAll('#renkler button').forEach(x => x.classList.toggle('secili', x === b));
  $('silgiBtn').classList.remove('secili');
});
document.querySelectorAll('.kalinlik button').forEach(b => b.addEventListener('click', () => {
  kalem.kalinlik = +b.dataset.k;
  document.querySelectorAll('.kalinlik button').forEach(x => x.classList.toggle('secili', x === b));
}));
$('silgiBtn').addEventListener('click', () => {
  kalem.silgi = !kalem.silgi;
  $('silgiBtn').classList.toggle('secili', kalem.silgi);
});
$('geriAlBtn').addEventListener('click', () => { cizgiler.pop(); tuvalCiz(); });
$('temizleBtn').addEventListener('click', () => { cizgiler = []; tuvalCiz(); });
function cizimTemizle() { cizgiler = []; tuvalCiz(); }
function tuvalNoktasi(e) {
  const r = tuval.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * tuval.width, ((e.clientY - r.top) / r.height) * tuval.height];
}
tuval.addEventListener('pointerdown', e => {
  tuval.setPointerCapture(e.pointerId);
  aktifCizgi = { renk: kalem.silgi ? '#ffffff' : kalem.renk, kalinlik: kalem.silgi ? kalem.kalinlik * 2.5 : kalem.kalinlik, noktalar: [tuvalNoktasi(e)] };
  cizgiler.push(aktifCizgi);
  tuvalCiz();
});
tuval.addEventListener('pointermove', e => {
  if (!aktifCizgi) return;
  aktifCizgi.noktalar.push(tuvalNoktasi(e));
  tuvalCiz();
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => tuval.addEventListener(t, () => (aktifCizgi = null)));
function tuvalCiz(hedef = g, w = tuval.width, h = tuval.height) {
  const s = w / tuval.width;
  hedef.fillStyle = '#ffffff';
  hedef.fillRect(0, 0, w, h);
  hedef.lineCap = hedef.lineJoin = 'round';
  cizgiler.forEach(c => {
    hedef.strokeStyle = c.renk;
    hedef.fillStyle = c.renk;
    hedef.lineWidth = c.kalinlik * s;
    if (c.noktalar.length === 1) {
      hedef.beginPath();
      hedef.arc(c.noktalar[0][0] * s, c.noktalar[0][1] * s, (c.kalinlik * s) / 2, 0, 7);
      hedef.fill();
      return;
    }
    hedef.beginPath();
    c.noktalar.forEach(([x, y], i) => (i ? hedef.lineTo(x * s, y * s) : hedef.moveTo(x * s, y * s)));
    hedef.stroke();
  });
}
// Gönderilecek resim: küçültülmüş JPEG (hızlı gitsin)
function cizimResmi() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 448;
  tuvalCiz(c.getContext('2d'), 640, 448);
  return c.toDataURL('image/jpeg', 0.8);
}
tuvalCiz();

// ---------- Mesaj, oyun sonu ----------
let mesajZamani = null;
function mesaj(yazi, sinif = '', sure = 2000) {
  const m = $('mesaj');
  m.textContent = yazi;
  m.className = 'goster ' + sinif;
  clearTimeout(mesajZamani);
  mesajZamani = setTimeout(() => (m.className = sinif), sure);
}

function sonuGoster() {
  const d = ui.durum;
  const ben = benimOyuncu();
  const kazandim = ben?.takim === d.kazanan;
  if (kazandim) Ses.kazandin();
  $('sonBaslik').innerHTML = `🏆 ${TAKIM_EMOJI[d.kazanan]} ${TAKIM_ADI[d.kazanan]} takım kazandı!`;
  $('sonYazi').textContent = d.sebep === 'olumcul' ? `☠️ ${TAKIM_ADI[d.kazanan === 'k' ? 'm' : 'k']} takım ölümcül kelimeyi açtı!` : 'Bütün kelimelerini buldular! 🎉';
  $('galeri').innerHTML = d.gecmis.filter(g2 => !g2.bos).map(g2 => `<div class="galeriKart t${g2.takim}">`
    + (g2.cizim ? (ui.cizimler[g2.turNo] ? `<img src="${ui.cizimler[g2.turNo]}" alt="">` : '<div class="yok">çizim yok</div>') : `<div class="ipYazi">${guvenli(g2.metin || '')}</div>`)
    + `<small>${TAKIM_EMOJI[g2.takim]} ${g2.sayi} kelime · Bulunan: ${g2.acilanlar.map(a => `<span class="r${a.renk}">${guvenli(a.k)}</span>`).join(', ') || '–'}</small></div>`).join('') || '<p class="not">Bu oyunda ipucu yok.</p>';
  const ev = Ag.mod === 'ev';
  $('lobiyeDonBtn').hidden = !ev;
  $('sonBekle').hidden = ev;
  $('sonEkran').hidden = false;
}
$('lobiyeDonBtn').addEventListener('click', () => Ag.lobiyeDon());
$('sonKapatBtn').addEventListener('click', () => ($('sonEkran').hidden = true));
$('menuBtn').addEventListener('click', () => {
  if (confirm(Ag.mod === 'ev' ? 'Odayı kapatıp ana menüye dönülsün mü? (Arkadaşlarının oyunu da biter)' : 'Odadan çıkılsın mı? (Aynı adla geri girebilirsin)')) Ag.ayril();
});
function sesDugmesi() { $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇'; }
$('sesBtn').addEventListener('click', () => { Ses.ac(!Ses.acik); sesDugmesi(); });
sesDugmesi();

// Süre çubukları
setInterval(() => {
  const d = ui.durum;
  if (!d) return;
  if (d.asama === 'kelime') {
    $('kelimeSure').style.width = `${Math.max(0, Math.min(1, (d.bitis - Date.now()) / (Motor.KELIME_SURESI * 1000))) * 100}%`;
    return;
  }
  const oran = d.asama === 'anlatim' ? Math.max(0, Math.min(1, (d.bitis - Date.now()) / (d.ayar.sure * 1000))) : 0;
  $('sure').style.width = `${oran * 100}%`;
  const ben = benimOyuncu();
  if (d.asama === 'anlatim' && ben?.kaptan && ben.takim === d.sira && oran < 0.15 && Math.round(Date.now() / 250) % 4 === 0) Ses.tikTak();
}, 250);
