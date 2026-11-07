// =============================================================
// Kod Adı Çizim - sesler (hepsi o an üretilir, ses dosyası yok)
// Kart atma, kart açma, "Yalancı!", tabanca topu dönmesi, boş tetik "tık", "BAM", mum sönmesi,
// sıra sende zili, kazanma.
// =============================================================

const Ses = (() => {
  let ctx = null, ana = null, acik = true, gurultu = null;
  const ANAHTAR = 'kodAdiCizim.ses';
  try { acik = localStorage.getItem(ANAHTAR) !== '0'; } catch (e) { /* yok */ }

  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.8 : 0;
      ana.connect(ctx.destination);
      // Beyaz gürültü (2 sn)
      gurultu = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const v = gurultu.getChannelData(0);
      for (let i = 0; i < v.length; i++) v[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const oyna = (a, b) => a + Math.random() * (b - a);

  // Gürültü patlaması (filtreli)
  function hisirti(gecikme, sure, frekans, q, seviye, tip = 'bandpass') {
    motor();
    const t = ctx.currentTime + gecikme;
    const k = ctx.createBufferSource();
    k.buffer = gurultu;
    const f = ctx.createBiquadFilter();
    f.type = tip;
    f.frequency.value = frekans;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    k.connect(f).connect(g).connect(ana);
    k.start(t, Math.random() * 1.5, sure + 0.05);
    return { f, t };
  }

  function nota(gecikme, frekans, sure, seviye, tip = 'sine', kayma = 0) {
    motor();
    const t = ctx.currentTime + gecikme;
    const o = ctx.createOscillator();
    o.type = tip;
    o.frequency.setValueAtTime(frekans, t);
    if (kayma) o.frequency.exponentialRampToValueAtTime(frekans * kayma, t + sure);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g).connect(ana);
    o.start(t);
    o.stop(t + sure + 0.05);
  }

  // ---------- Müzik ----------
  // Arka planda kısık sesle çalan kovboy ezgisi (o an üretilir): kontrbas "um-pa", gitar tıngırtısı,
  // nal sesi gibi tahta tıkırtısı ve ıslıkla çalınan bir melodi. La minör, Am-G-F-E (western dizisi).
  // Tetik çekilirken müzik kısılır, yerine gerilim müziği girer.
  const MUZIK_ANAHTAR = 'kodAdiCizim.muzik';
  let muzikAcik = true;
  try { muzikAcik = localStorage.getItem(MUZIK_ANAHTAR) !== '0'; } catch (e) { /* yok */ }
  let muzikBus = null, muzikZaman = null, adim = 0, sonrakiNota = 0, caliyor = false, gerilimNodlar = [];
  const SEKIZLIK = 60 / 104 / 2;
  const AKOR = [
    { kok: 110, besli: 82.4, notalar: [220, 261.6, 329.6] },   // Am
    { kok: 98, besli: 73.4, notalar: [196, 246.9, 293.7] },    // G
    { kok: 87.3, besli: 130.8, notalar: [174.6, 220, 261.6] }, // F
    { kok: 82.4, besli: 123.5, notalar: [164.8, 207.7, 246.9] }, // E
  ];
  const N = { E5: 659.3, D5: 587.3, C5: 523.3, B4: 493.9, A4: 440, Gd4: 415.3, G4: 392, F4: 349.2, E4: 329.6 };
  const MELODI = [
    ['E5', 0, 'A4', 0, 'C5', 'B4', 'A4', 0], ['G4', 0, 'B4', 'D5', 0, 'C5', 'B4', 0],
    ['A4', 0, 'F4', 0, 'A4', 'C5', 0, 0], ['B4', 0, 'Gd4', 0, 'E4', 0, 0, 0],
    ['A4', 'C5', 'E5', 0, 'E5', 'D5', 'C5', 0], ['B4', 0, 'D5', 0, 'B4', 'G4', 0, 0],
    ['C5', 0, 'A4', 0, 'F4', 'A4', 'C5', 0], ['B4', 0, 0, 'Gd4', 'A4', 0, 0, 0],
  ];

  function muzikNota(t, frekans, sure, seviye, tip, filtre = 2000, hedef = muzikBus) {
    const o = ctx.createOscillator();
    o.type = tip;
    o.frequency.setValueAtTime(frekans, t);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filtre;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(f).connect(g).connect(hedef);
    o.start(t);
    o.stop(t + sure + 0.05);
    return o;
  }
  function islik(t, frekans, sure) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(frekans * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(frekans, t + 0.06);   // ıslıkta sese kayarak girilir
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.value = frekans * 0.006;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.setValueAtTime(0.09, t + sure * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g).connect(muzikBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + sure + 0.05);
    lfo.stop(t + sure + 0.05);
  }
  function tahta(t, seviye) {
    const k = ctx.createBufferSource();
    k.buffer = gurultu;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    k.connect(f).connect(g).connect(muzikBus);
    k.start(t, Math.random(), 0.08);
  }

  function muzikPlanla() {
    if (!caliyor || !ctx) return;
    while (sonrakiNota < ctx.currentTime + 0.25) {
      const t = Math.max(sonrakiNota, ctx.currentTime);
      const bar = Math.floor(adim / 8) % 8, s = adim % 8;
      const akor = AKOR[bar % 4];
      // Kontrbas: 1. ve 3. vuruşta kök ve beşli
      if (s === 0) muzikNota(t, akor.kok, 0.5, 0.35, 'triangle', 600);
      if (s === 4) muzikNota(t, akor.besli, 0.5, 0.3, 'triangle', 600);
      // Gitar: 2. ve 4. vuruşta akor, araya dörtnal tıngırtısı
      if (s === 2 || s === 6) akor.notalar.forEach((f, i) => muzikNota(t + i * 0.012, f, 0.35, 0.07, 'sawtooth', 1600));
      if (s === 3 || s === 7) akor.notalar.forEach((f, i) => muzikNota(t + i * 0.01, f * 2, 0.15, 0.025, 'sawtooth', 2200));
      // Nal sesi (tahta tıkırtısı): da-da-DUM
      if (s % 2 === 0) tahta(t, s % 4 === 0 ? 0.18 : 0.1);
      else tahta(t + SEKIZLIK * 0.5, 0.07);
      // Islık melodisi (ikinci turda)
      const nota = Math.floor(adim / 64) % 2 === 1 || adim >= 64 ? MELODI[bar][s] : 0;
      if (nota) {
        let uzunluk = 1;
        while (s + uzunluk < 8 && !MELODI[bar][s + uzunluk]) uzunluk++;
        islik(t, N[nota], Math.min(uzunluk, 3) * SEKIZLIK * 0.95);
      }
      adim = (adim + 1) % 128;
      sonrakiNota = t + SEKIZLIK;
    }
  }

  function muzikBaslat() {
    if (!muzikAcik || caliyor) return;
    motor();
    if (!muzikBus) {
      muzikBus = ctx.createGain();
      muzikBus.connect(ana);
    }
    muzikBus.gain.cancelScheduledValues(ctx.currentTime);
    muzikBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    muzikBus.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 2);
    caliyor = true;
    sonrakiNota = ctx.currentTime + 0.1;
    clearInterval(muzikZaman);
    muzikZaman = setInterval(muzikPlanla, 60);
  }
  function muzikDurdur() {
    caliyor = false;
    clearInterval(muzikZaman);
    if (muzikBus) muzikBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  }

  // Gerilim: kalın uğultu yükselir, tiz titrek yaylılar, müzik kısılır
  function gerilimBaslat(sure = 4) {
    motor();
    gerilimDurdur(true);
    const t = ctx.currentTime;
    if (muzikBus && caliyor) muzikBus.gain.setTargetAtTime(0.03, t, 0.15);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.5, t + sure * 0.9);
    bus.connect(ana);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + sure);
    f.connect(bus);
    const nodlar = [bus];
    [55, 58.3, 82.4].forEach(fr => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(f);
      o.start(t);
      nodlar.push(o);
    });
    // Tiz yaylılar: titreyen (tremolo) uyumsuz iki nota, giderek yükselir
    const trem = ctx.createGain();
    trem.gain.value = 0;
    trem.connect(bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.linearRampToValueAtTime(13, t + sure);
    const lg = ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    nodlar.push(lfo);
    [880, 932.3].forEach(fr => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(fr, t);
      o.frequency.linearRampToValueAtTime(fr * 1.06, t + sure);
      o.connect(trem);
      o.start(t);
      nodlar.push(o);
    });
    gerilimNodlar = nodlar;
  }
  function gerilimDurdur(hemen) {
    if (!gerilimNodlar.length) return;
    const t = ctx.currentTime;
    const [bus, ...oslar] = gerilimNodlar;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(0.0001, t, hemen ? 0.01 : 0.08);
    oslar.forEach(o => o.stop(t + (hemen ? 0.05 : 0.6)));
    gerilimNodlar = [];
    if (muzikBus && caliyor) muzikBus.gain.setTargetAtTime(0.32, t + 1.5, 0.8);
  }

  return {
    muzikBaslat, muzikDurdur, gerilimBaslat, gerilimDurdur,
    get muzikCaliyor() { return caliyor; },
    get muzikAcik() { return muzikAcik; },
    muzikAc(deger) {
      muzikAcik = deger;
      try { localStorage.setItem(MUZIK_ANAHTAR, deger ? '1' : '0'); } catch (e) { /* yok */ }
      deger ? muzikBaslat() : muzikDurdur();
    },
    baglam: () => motor(),
    // Kart seçme: kısa kâğıt tıkı
    sec: () => hisirti(0, 0.05, 3500, 1.5, 0.25),
    // Kart masaya atılınca: kâğıt kayması + masaya değme
    kartAt: (adet = 1) => {
      for (let i = 0; i < adet; i++) {
        hisirti(i * 0.08, 0.14, 2600, 0.8, 0.22);
        hisirti(i * 0.08 + 0.12, 0.06, 900, 1, 0.35);
      }
    },
    // Kart çevirme
    kartAc: (adet = 1) => {
      for (let i = 0; i < adet; i++) hisirti(i * 0.15, 0.09, 4200, 1.2, 0.3);
    },
    // Dağıtma: art arda kart sesleri
    dagit: () => {
      for (let i = 0; i < 10; i++) hisirti(i * 0.06, 0.07, oyna(2200, 3400), 1, 0.16);
    },
    // Dağıtımda tek kart: kısa kâğıt fışırtısı + masaya değme
    tekKart: () => {
      hisirti(0, 0.08, oyna(2600, 3600), 1, 0.13);
      hisirti(0.33, 0.04, 1100, 1, 0.12);
    },
    // "YALANCI!": dramatik vuruş + akor
    yalanci: () => {
      hisirti(0, 0.3, 120, 0.7, 0.9, 'lowpass');
      [196, 233, 277, 330].forEach(f => nota(0.02, f, 1.1, 0.09, 'sawtooth'));
      nota(0, 98, 0.8, 0.3, 'triangle', 0.7);
    },
    // Doğru çıktı / yalan çıktı
    dogruCikti: () => [523, 659, 784].forEach((f, i) => nota(i * 0.09, f, 0.35, 0.12, 'triangle')),
    yalanCikti: () => [392, 330, 262].forEach((f, i) => nota(i * 0.12, f, 0.4, 0.13, 'square')),
    // Tabanca topu döner: tırtıklı tıkırtılar
    topDon: () => {
      for (let i = 0; i < 14; i++) hisirti(i * 0.035 * (1 + i * 0.06), 0.02, 5200, 4, 0.18);
    },
    // Horoz çekilir (kalp atışı gibi gerilim)
    gerilim: () => {
      for (let i = 0; i < 3; i++) {
        nota(i * 0.75, 55, 0.18, 0.5, 'sine', 0.6);
        nota(i * 0.75 + 0.2, 50, 0.16, 0.35, 'sine', 0.6);
      }
      hisirti(2.1, 0.05, 2500, 3, 0.4);   // horozun kalkması
    },
    // Boş hazne: kuru metal tık
    tik: () => {
      hisirti(0, 0.04, 3800, 6, 0.9);
      nota(0, 2400, 0.05, 0.15, 'square');
    },
    // Mermi: güçlü patlama + yankı
    bam: () => {
      hisirti(0, 0.08, 3000, 0.5, 1.0, 'highpass');
      hisirti(0, 0.9, 400, 0.5, 1.0, 'lowpass');
      nota(0, 70, 0.6, 0.9, 'sine', 0.4);
      hisirti(0.25, 1.2, 250, 0.7, 0.25, 'lowpass');
    },
    // Domates: fırlatma vınnn + ezilme şlap
    domates: () => {
      hisirti(0, 0.5, 900, 1.5, 0.15, 'bandpass');
      hisirti(0.7, 0.25, 500, 0.6, 0.6, 'lowpass');
      hisirti(0.7, 0.1, 2500, 0.8, 0.3);
    },
    // Mum söner: pfff
    mum: () => hisirti(0, 0.5, 700, 0.4, 0.3, 'lowpass'),
    // Sıra sende: iki notalı zil
    siraSende: () => {
      nota(0, 784, 0.4, 0.14);
      nota(0.13, 1175, 0.55, 0.14);
    },
    // Kazanma
    kazandin: () => [392, 494, 587, 784, 988].forEach((f, i) => nota(i * 0.12, f, 0.5, 0.12, 'triangle')),
    // Süre azalıyor
    tikTak: () => hisirti(0, 0.03, 2800, 4, 0.25),
    hazirla: () => motor(),
    get acik() { return acik; },
    ac(deger) {
      acik = deger;
      try { localStorage.setItem(ANAHTAR, deger ? '1' : '0'); } catch (e) { /* yok */ }
      if (ana) ana.gain.value = deger ? 0.8 : 0;
    },
  };
})();
