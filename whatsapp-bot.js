const botBaslangicZamani = Math.floor(Date.now() / 1000);
const VARSAYILAN_OYUNCU = {
  anaMevki: "ORT",
  alternatifMevki: "Yok",
  kl: 60,
  def: 60,
  ort: 60,
  for: 60,
  hiz: 60,
  pas: 60,
  sut: 60,
  anaTakim: "Yok",
};

const express = require("express");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set, remove, runTransaction } = require("firebase/database");

const app = express();
const PORT = process.env.PORT || 10000;
const firebaseConfig = {
  apiKey: "AIzaSyCreidC1Ybdx_s7663HGnuYhqUBNwmAEXU",
  authDomain: "halisaha-taktik.firebaseapp.com",
  databaseURL: "https://halisaha-taktik-default-rtdb.firebaseio.com/",
  projectId: "halisaha-taktik",
  storageBucket: "halisaha-taktik.firebasestorage.app",
  messagingSenderId: "682186454054",
  appId: "1:682186454054:web:27f9299909557daea2e7",
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
let botHeartbeatInterval = null;
let yoklamaSchedulerInterval = null;
let sonYoklamaTarihi = null;

async function botDurumunuKaydet(durum) {
  await set(ref(database, "sistem_hafizasi/bot_durum"), durum);
}

async function canliQrKodunuTemizle() {
  await Promise.all([
    remove(ref(database, "sistem_hafizasi/canli_qr")),
    remove(ref(database, "sistem_hafizasi/canli_qr_gorsel")),
  ]);
}

function istanbulSaatiniAl(tarih = new Date()) {
  const parcalar = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(tarih);
  const degerler = Object.fromEntries(
    parcalar
      .filter((parca) => parca.type !== "literal")
      .map((parca) => [parca.type, parca.value])
  );

  return {
    haftaGunu: degerler.weekday,
    saat: Number(degerler.hour),
    dakika: Number(degerler.minute),
    tarih: `${degerler.year}-${degerler.month}-${degerler.day}`,
  };
}

function oyuncuIsimleriniAl(oyuncular) {
  return Object.values(oyuncular || {})
    .filter(Boolean)
    .map((oyuncu) => (typeof oyuncu === "string" ? oyuncu : oyuncu.isim))
    .filter((isim) => typeof isim === "string" && isim.trim())
    .map((isim) => isim.trim());
}

function yoklamaMesajiniOlustur(kadro) {
  const kirmiziOyuncular = oyuncuIsimleriniAl(kadro.kadro.red);
  const beyazOyuncular = oyuncuIsimleriniAl(kadro.kadro.white);
  const yedekler = oyuncuIsimleriniAl(kadro.yedekler);

  return `⚽ *Maç Tamamlandı! Gelecek Hafta Yoklaması Başladı* 📋

Bu haftanın son kadrosu aşağıdadır. Gelecek hafta Perşembe maçına *gelemeyecek* olanlar lütfen gruba *-1* yazsın:

🔴 *KIRMIZI TAKIM*
${kirmiziOyuncular.join("\n") || "Oyuncu yok"}

⚪ *BEYAZ TAKIM*
${beyazOyuncular.join("\n") || "Oyuncu yok"}

⏳ *YEDEK LİSTESİ*
${yedekler.join("\n") || "Yedek oyuncu yok"}

Not: -1 yazanların yerine sıradaki yedek oyuncular otomatik davet edilecektir.`;
}

async function haftalikYoklamaGonder() {
  const kadroSnapshot = await get(ref(database, "sistem_hafizasi/canli_kadro"));
  const kadro = kadroSnapshot.val();
  if (!kadro?.kadro) {
    console.log("ℹ️ Haftalık yoklama gönderilmedi: aktif kadro bulunamadı.");
    return;
  }

  const kirmiziOyuncular = oyuncuIsimleriniAl(kadro.kadro.red);
  const beyazOyuncular = oyuncuIsimleriniAl(kadro.kadro.white);
  if (kirmiziOyuncular.length + beyazOyuncular.length === 0) {
    console.log("ℹ️ Haftalık yoklama gönderilmedi: aktif kadro boş.");
    return;
  }

  const sohbetler = await client.getChats();
  const hedefGruplar = [
    { ad: "Bot Test", sohbet: sohbetler.find((sohbet) => sohbet.isGroup && /bot\s*test/i.test(sohbet.name || "")) },
    { ad: "Has Kadro", sohbet: sohbetler.find((sohbet) => sohbet.isGroup && /has\s*kadro/i.test(sohbet.name || "")) },
  ];
  const mesaj = yoklamaMesajiniOlustur(kadro);
  let enAzBirMesajGonderildi = false;

  for (const hedef of hedefGruplar) {
    if (!hedef.sohbet) {
      console.error(`❌ Haftalık yoklama hedef grubu bulunamadı: ${hedef.ad}`);
      continue;
    }

    try {
      await client.sendMessage(hedef.sohbet.id._serialized, mesaj);
      enAzBirMesajGonderildi = true;
      console.log(`✅ Haftalık yoklama gönderildi: ${hedef.ad}`);
    } catch (error) {
      console.error(`❌ Haftalık yoklama gönderilemedi (${hedef.ad}):`, error);
    }
  }

  if (!enAzBirMesajGonderildi) {
    throw new Error("Haftalık yoklama hiçbir hedef gruba gönderilemedi.");
  }

  await set(ref(database, "sistem_hafizasi/yoklama_durumu"), {
    aktif: true,
    baslangicZamani: Date.now(),
  });
}

function haftalikYoklamaZamanlayicisiniBaslat() {
  if (yoklamaSchedulerInterval) clearInterval(yoklamaSchedulerInterval);

  yoklamaSchedulerInterval = setInterval(async () => {
    const simdi = istanbulSaatiniAl();
    if (
      simdi.haftaGunu !== "Thursday" ||
      simdi.saat !== 22 ||
      simdi.dakika !== 30 ||
      sonYoklamaTarihi === simdi.tarih
    ) {
      return;
    }

    sonYoklamaTarihi = simdi.tarih;
    try {
      await haftalikYoklamaGonder();
    } catch (error) {
      console.error("❌ Haftalık yoklama görevi başarısız oldu:", error);
    }
  }, 30000);
}

function temizleIsim(raw) {
  if (raw === null || raw === undefined) return "";

  let name = String(raw)
    .replace(/\r/g, "")
    .replace(/\u200B/g, "")
    .trim();

  name = name
    .replace(/^(?:(?:\d+[\.\)])|[-*•])\s*/, "")
    .replace(/[\n\t]+/g, " ")
    .replace(/^[\s\-•*]+|[\s\-•*]+$/g, "")
    .replace(/[\.,;]+$/g, "")
    .trim();

  if (!name) return "";

  if (/^(ana kadro|yedek listesi|kadro|notlar|toplam|güncelleme|örnek)$/i.test(name)) {
    return "";
  }

  if (/[A-Za-zÇçĞğİıÖöŞşÜü]/.test(name) === false) {
    return "";
  }

  if (name.includes(":")) return "";

  return name;
}

function isimAnahtari(isim) {
  return String(isim || "").trim().toLocaleUpperCase("tr-TR");
}

function mevkiyeGorePuanHesapla(oyuncu, mevki) {
  if (!oyuncu) return 50;

  const puanAl = (deger) => {
    const puan = parseInt(deger, 10);
    return Number.isNaN(puan) ? 50 : puan;
  };
  const kl = puanAl(oyuncu.kl);
  const def = puanAl(oyuncu.def);
  const ort = puanAl(oyuncu.ort);
  const forPuani = puanAl(oyuncu.for ?? oyuncu.huc);
  const hiz = puanAl(oyuncu.hiz);
  const pas = puanAl(oyuncu.pas);
  const sut = puanAl(oyuncu.sut);

  switch (mevkiKodunuNormallestir(mevki)) {
    case "KL":
      return kl;
    case "SLB":
    case "STP":
    case "SĞB":
    case "DEF":
      return Math.round((def * 0.50) + (hiz * 0.20) + (pas * 0.20) + (ort * 0.10));
    case "SLO":
    case "SĞO":
    case "ORT":
      return Math.round((ort * 0.40) + (pas * 0.30) + (hiz * 0.15) + (sut * 0.15));
    case "FOR":
      return Math.round((forPuani * 0.50) + (sut * 0.25) + (hiz * 0.15) + (pas * 0.10));
    default:
      return Math.round((ort * 0.40) + (pas * 0.30) + (hiz * 0.15) + (sut * 0.15));
  }
}

function genelPuanHesapla(oyuncu) {
  return mevkiyeGorePuanHesapla(oyuncu, oyuncu?.anaMevki);
}

function isimListesiniAyikla(mesaj) {
  const lines = String(mesaj || "")
    .replace(/\r/g, "")
    .split(/\n/);

  const anaKadro = [];
  const yedekKadro = [];
  let anaKadroBasladiMi = false;
  let yedekKadroBasladiMi = false;

  for (const line of lines) {
    const duzMetin = line.trim();
    if (!duzMetin || /^\d+[\s.)]*$/.test(duzMetin)) continue;

    const lower = duzMetin.toLocaleLowerCase("tr-TR");

    if (lower.includes("ana kadro")) {
      anaKadroBasladiMi = true;
      yedekKadroBasladiMi = false;
      continue;
    }

    if (lower.includes("yedek listesi")) {
      anaKadroBasladiMi = false;
      yedekKadroBasladiMi = true;
      continue;
    }

    const temizIsim = temizleIsim(duzMetin);
    if (
      temizIsim.length < 2 ||
      /^\d+$/.test(temizIsim)
    ) continue;

    if (anaKadroBasladiMi) {
      if (!anaKadro.some((isim) => isimAnahtari(isim) === isimAnahtari(temizIsim))) {
        anaKadro.push(temizIsim);
      }
    } else if (yedekKadroBasladiMi) {
      if (!yedekKadro.some((isim) => isimAnahtari(isim) === isimAnahtari(temizIsim))) {
        yedekKadro.push(temizIsim);
      }
    }
  }

  return {
    anaKadro: anaKadro.filter(Boolean),
    yedekKadro: yedekKadro.filter(Boolean),
  };
}

async function oyuncuHavuzunuGetir() {
  let oyuncularSnapshot;
  try {
    oyuncularSnapshot = await get(ref(database, "oyuncular"));
  } catch (error) {
    throw new Error(`Oyuncu havuzu Firebase'den okunamadı: ${error.message}`, { cause: error });
  }

  const oyuncuVerileri = oyuncularSnapshot.val() || {};
  return Object.entries(oyuncuVerileri)
    .filter(([, kayit]) => kayit && kayit.isim)
    .map(([id, kayit]) => ({
      ...VARSAYILAN_OYUNCU,
      ...kayit,
      id,
      isim: kayit.isim,
      anaMevki: mevkiKodunuNormallestir(kayit.anaMevki || VARSAYILAN_OYUNCU.anaMevki),
      for: kayit.for ?? kayit.huc ?? VARSAYILAN_OYUNCU.for,
      hiz: kayit.hiz ?? VARSAYILAN_OYUNCU.hiz,
      pas: kayit.pas ?? VARSAYILAN_OYUNCU.pas,
      sut: kayit.sut ?? VARSAYILAN_OYUNCU.sut,
      alternatifMevki: kayit.alternatifMevki || kayit.alternatifPosition || VARSAYILAN_OYUNCU.alternatifMevki,
      anaTakim: kayit.anaTakim || VARSAYILAN_OYUNCU.anaTakim,
    }));
}

function oyuncuyuHavuzdaBul(isim, oyuncuHavuzu) {
  const arananIsim = isimAnahtari(isim);
  return oyuncuHavuzu.find((oyuncu) => {
    const havuzIsmi = isimAnahtari(oyuncu.isim);
    return havuzIsmi.includes(arananIsim) || arananIsim.includes(havuzIsmi);
  });
}

function mevkiKodunuNormallestir(mevki) {
  const kod = String(mevki || "").trim().toLocaleUpperCase("tr-TR");
  const mevkiKodlari = {
    KALECI: "KL",
    KALECİ: "KL",
    GK: "KL",
    GOALKEEPER: "KL",
    "SOL BEK": "SLB",
    "SOL DEFANS": "SLB",
    LB: "SLB",
    LEFTBACK: "SLB",
    STOPER: "STP",
    "MERKEZ DEFANS": "STP",
    CB: "STP",
    CENTERBACK: "STP",
    "SAĞ BEK": "SĞB",
    "SAG BEK": "SĞB",
    "SAĞ DEFANS": "SĞB",
    "SAG DEFANS": "SĞB",
    RB: "SĞB",
    RIGHTBACK: "SĞB",
    DEFANS: "DEF",
    "SOL ORTA SAHA": "SLO",
    "SAĞ ORTA SAHA": "SĞO",
    "SAG ORTA SAHA": "SĞO",
    "ORTA SAHA": "ORT",
    HUC: "FOR",
    HÜCUM: "FOR",
    SANTRAFOR: "FOR",
    ST: "FOR",
  };
  return mevkiKodlari[kod] || kod;
}

function mevkiGrubunuBul(mevki) {
  switch (mevkiKodunuNormallestir(mevki)) {
    case "KL":
      return "KL";
    case "DEF":
    case "SLB":
    case "STP":
    case "SĞB":
      return "DEF";
    case "ORT":
    case "SLO":
    case "SĞO":
      return "ORT";
    case "FOR":
      return "FOR";
    default:
      return null;
  }
}

function takimi3_2_1Diz(takim) {
  const slotlar = [
    { kod: "KL", id: "pos_0", grup: "KL" },
    { kod: "SLB", id: "pos_1", grup: "DEF" },
    { kod: "STP", id: "pos_2", grup: "DEF" },
    { kod: "SĞB", id: "pos_3", grup: "DEF" },
    { kod: "SLO", id: "pos_4", grup: "ORT" },
    { kod: "SĞO", id: "pos_5", grup: "ORT" },
    { kod: "FOR", id: "pos_6", grup: "FOR" },
  ];
  const kadro = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [`pos_${index}`, null])
  );
  const kalanOyuncular = [...takim];

  const yuvayaYerles = (slot, puanlayici, oyuncuPuani) => {
    const uygunOyuncular = kalanOyuncular
      .filter((oyuncu) => puanlayici(oyuncu, slot))
      .sort((a, b) => oyuncuPuani(b, slot) - oyuncuPuani(a, slot));
    if (uygunOyuncular.length === 0) return;

    kadro[slot.id] = uygunOyuncular[0];
    kalanOyuncular.splice(kalanOyuncular.indexOf(uygunOyuncular[0]), 1);
  };

  // Aşama 1: Oyuncuları ana mevkilerindeki yuvalara yerleştir.
  for (const slot of slotlar) {
    yuvayaYerles(
      slot,
      (oyuncu) => mevkiKodunuNormallestir(oyuncu.anaMevki) === slot.kod,
      (oyuncu) => genelPuanHesapla(oyuncu)
    );
  }

  // Aşama 2: Boş kalan yuvaları oyuncuların alternatif mevkileriyle doldur.
  for (const slot of slotlar) {
    if (kadro[slot.id]) continue;
    yuvayaYerles(
      slot,
      (oyuncu) => mevkiKodunuNormallestir(
        oyuncu.alternatifMevki || oyuncu.alternatifPosition
      ) === slot.kod,
      (oyuncu) => mevkiyeGorePuanHesapla(oyuncu, slot.kod)
    );
  }

  // Aşama 3: Kalan oyuncu-yuva eşleşmelerinin en iyi puanlı olanını seç.
  while (kalanOyuncular.length > 0) {
    const bosSlotlar = slotlar.filter((slot) => !kadro[slot.id]);
    if (bosSlotlar.length === 0) break;

    let enIyiEslesme = null;
    for (const slot of bosSlotlar) {
      for (const oyuncu of kalanOyuncular) {
        const puan = mevkiyeGorePuanHesapla(oyuncu, slot.kod);
        if (!enIyiEslesme || puan > enIyiEslesme.puan) {
          enIyiEslesme = { slot, oyuncu, puan };
        }
      }
    }

    kadro[enIyiEslesme.slot.id] = enIyiEslesme.oyuncu;
    kalanOyuncular.splice(kalanOyuncular.indexOf(enIyiEslesme.oyuncu), 1);
  }

  return kadro;
}

async function akllliTakimlariKur(gelenIsimler, oyuncuHavuzu) {
  console.log("Ayıklanan İsimler:", gelenIsimler);
  const anaKadro = (gelenIsimler || []).filter(Boolean).slice(0, 14);

  const mod = "7v7";
  const oyuncuListesi = anaKadro.map((isim, index) => {
    const bulunanOyuncu = oyuncuyuHavuzdaBul(isim, oyuncuHavuzu);
    if (bulunanOyuncu) return bulunanOyuncu;

    return {
      ...VARSAYILAN_OYUNCU,
      id: `whatsapp-${index}-${isimAnahtari(isim)}`,
      isim,
    };
  });

  const tercihEdilenTakim = (oyuncu) => {
    const takim = isimAnahtari(oyuncu.anaTakim);
    if (takim === "KIRMIZI" || takim === "RED") return "red";
    if (takim === "BEYAZ" || takim === "WHITE") return "white";
    return null;
  };
  const takimlar = { red: [], white: [] };
  const atanmamisOyuncular = [];

  for (const oyuncu of oyuncuListesi) {
    const tercih = tercihEdilenTakim(oyuncu);
    if (tercih && takimlar[tercih].length < 7) {
      takimlar[tercih].push(oyuncu);
    } else {
      atanmamisOyuncular.push(oyuncu);
    }
  }

  for (const oyuncu of atanmamisOyuncular) {
    const redGucu = takimlar.red.reduce(
      (toplam, kisi) => toplam + genelPuanHesapla(kisi),
      0
    );
    const whiteGucu = takimlar.white.reduce(
      (toplam, kisi) => toplam + genelPuanHesapla(kisi),
      0
    );

    if (takimlar.red.length < takimlar.white.length) {
      takimlar.red.push(oyuncu);
    } else if (takimlar.white.length < takimlar.red.length) {
      takimlar.white.push(oyuncu);
    } else if (takimlar.red.length < 7 && redGucu <= whiteGucu) {
      takimlar.red.push(oyuncu);
    } else if (takimlar.white.length < 7) {
      takimlar.white.push(oyuncu);
    } else {
      takimlar.red.push(oyuncu);
    }
  }

  const limitler = { KL: 1, DEF: 3, ORT: 2, FOR: 1 };
  const rolGrubu = (oyuncu) => mevkiGrubunuBul(oyuncu.anaMevki);
  const rolAdetleri = (takim) => {
    const adetler = { KL: 0, DEF: 0, ORT: 0, FOR: 0 };
    for (const oyuncu of takim) {
      const grup = rolGrubu(oyuncu);
      if (grup) adetler[grup] += 1;
    }
    return adetler;
  };
  const fazlalikPuani = (adetler) =>
    Object.keys(limitler).reduce(
      (toplam, grup) => toplam + Math.max(0, adetler[grup] - limitler[grup]),
      0
    );
  const takimGucu = (takim) =>
    takim.reduce((toplam, oyuncu) => toplam + genelPuanHesapla(oyuncu), 0);

  while (true) {
    const adetler = {
      red: rolAdetleri(takimlar.red),
      white: rolAdetleri(takimlar.white),
    };
    const mevcutFazlalik =
      fazlalikPuani(adetler.red) + fazlalikPuani(adetler.white);
    let enIyiTakas = null;
    const gucler = {
      red: takimGucu(takimlar.red),
      white: takimGucu(takimlar.white),
    };

    for (const kaynak of ["red", "white"]) {
      const hedef = kaynak === "red" ? "white" : "red";
      for (let kaynakIndex = 0; kaynakIndex < takimlar[kaynak].length; kaynakIndex += 1) {
        const tasinacakOyuncu = takimlar[kaynak][kaynakIndex];
        const tasinacakGrup = rolGrubu(tasinacakOyuncu);
        if (!tasinacakGrup || adetler[kaynak][tasinacakGrup] <= limitler[tasinacakGrup]) {
          continue;
        }

        for (let hedefIndex = 0; hedefIndex < takimlar[hedef].length; hedefIndex += 1) {
          const takasOyuncusu = takimlar[hedef][hedefIndex];
          const takasGrubu = rolGrubu(takasOyuncusu);
          if (!takasGrubu || adetler[hedef][takasGrubu] <= limitler[takasGrubu]) {
            continue;
          }

          const kaynakYeni = { ...adetler[kaynak] };
          const hedefYeni = { ...adetler[hedef] };
          kaynakYeni[tasinacakGrup] -= 1;
          kaynakYeni[takasGrubu] += 1;
          hedefYeni[takasGrubu] -= 1;
          hedefYeni[tasinacakGrup] += 1;
          const yeniFazlalik =
            fazlalikPuani(kaynakYeni) + fazlalikPuani(hedefYeni);
          if (yeniFazlalik >= mevcutFazlalik) continue;

          const redDegisikligi = kaynak === "red"
            ? genelPuanHesapla(takasOyuncusu) - genelPuanHesapla(tasinacakOyuncu)
            : genelPuanHesapla(tasinacakOyuncu) - genelPuanHesapla(takasOyuncusu);
          const gucFarki = Math.abs(
            gucler.red + redDegisikligi - (gucler.white - redDegisikligi)
          );
          const tercihIhlali =
            (tercihEdilenTakim(tasinacakOyuncu) &&
              tercihEdilenTakim(tasinacakOyuncu) !== hedef ? 1 : 0) +
            (tercihEdilenTakim(takasOyuncusu) &&
              tercihEdilenTakim(takasOyuncusu) !== kaynak ? 1 : 0);
          const aday = {
            kaynak,
            kaynakIndex,
            hedef,
            hedefIndex,
            yeniFazlalik,
            tercihIhlali,
            gucFarki,
          };
          if (
            !enIyiTakas ||
            aday.yeniFazlalik < enIyiTakas.yeniFazlalik ||
            aday.yeniFazlalik === enIyiTakas.yeniFazlalik &&
              aday.tercihIhlali < enIyiTakas.tercihIhlali ||
            aday.yeniFazlalik === enIyiTakas.yeniFazlalik &&
              aday.tercihIhlali === enIyiTakas.tercihIhlali &&
              aday.gucFarki < enIyiTakas.gucFarki
          ) {
            enIyiTakas = aday;
          }
        }
      }
    }

    if (!enIyiTakas) break;
    [
      takimlar[enIyiTakas.kaynak][enIyiTakas.kaynakIndex],
      takimlar[enIyiTakas.hedef][enIyiTakas.hedefIndex],
    ] = [
      takimlar[enIyiTakas.hedef][enIyiTakas.hedefIndex],
      takimlar[enIyiTakas.kaynak][enIyiTakas.kaynakIndex],
    ];
  }

  return {
    mod,
    kadro: {
      red: takimi3_2_1Diz(takimlar.red),
      white: takimi3_2_1Diz(takimlar.white),
    },
    takimlar,
  };
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "halisaha-bot" }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wwebjs/wa-version/main/html/{version}.html',
  },
  puppeteer: {
    headless: true,
    executablePath: require('fs').existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    protocolTimeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-runtime-info',
      '--no-experiments',
      '--disable-breakpad',
      '--disable-notifications',
      '--autoplay-policy=user-gesture-required',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--mandate-sync-proxy-for-tests',
      '--disable-features=AudioServiceSandbox',
      '--disable-software-rasterizer',
      '--prerender-from-omnibox=disabled',
    ],
  },
});

let whatsappAuthenticated = false;
let reconnectTimer = null;
let reconnectInProgress = false;

client.on("qr", async (qr) => {
  console.log("QR kod üretildi. Telefonunuzdan taratın:");
  qrcode.generate(qr, { small: true });

  try {
    const qrGorseli = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    await set(ref(database, "sistem_hafizasi/canli_qr_gorsel"), qrGorseli);
    await set(ref(database, "sistem_hafizasi/canli_qr"), qr);
    await botDurumunuKaydet("DISCONNECTED");
  } catch (error) {
    console.error("❌ QR kodu Firebase'e yazılamadı:", error);
    await botDurumunuKaydet("DISCONNECTED").catch((durumHatasi) => {
      console.error("❌ Bot durumu Firebase'e yazılamadı:", durumHatasi);
    });
  }
});

client.on("authenticated", () => {
  whatsappAuthenticated = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  console.log("⏳ WhatsApp Web arayüzü yükleniyor, lütfen bekleyin...");
  console.log("✅ WhatsApp kimlik doğrulandı; yerel oturum kaydedildi.");
});

client.on("ready", async () => {
  if (botHeartbeatInterval) clearInterval(botHeartbeatInterval);
  haftalikYoklamaZamanlayicisiniBaslat();
  const heartbeatYaz = async () => {
    try {
      await set(ref(database, "sistem_hafizasi/son_gorulme"), Date.now());
    } catch (error) {
      console.error("❌ Bot heartbeat Firebase'e yazılamadı:", error);
    }
  };
  botHeartbeatInterval = setInterval(heartbeatYaz, 30000);

  try {
    await canliQrKodunuTemizle();
    await botDurumunuKaydet("CONNECTED");
    await heartbeatYaz();
  } catch (error) {
    console.error("❌ Bot bağlantı durumu Firebase'e yazılamadı:", error);
  }
  console.log("✅ WhatsApp bot hazır. Grup mesajları dinleniyor...");
});

async function mesajıIsle(msg) {
  if (msg.timestamp < botBaslangicZamani) return;

  console.log(`📡 [YENİ MESAJ GELDİ] -> msg.from: "${msg?.from}" | Gövde: "${String(msg?.body || "").substring(0, 15)}..."`);

  if (!msg || !msg.from || msg.from.includes('broadcast')) return;

  const body = typeof msg.body === "string" ? msg.body : "";
  if (!body.trim()) return;

  if (msg.fromMe && (body.includes("Akıllı Kadro Dağıtımı") || body.includes("KIRMIZI TAKIM"))) return;

  const izinVerilenGrupIDs = ["120363415017155084@g.us", "120363162701833@lid", "132628606922999@lid", "61027207114891@lid"];
  if (!izinVerilenGrupIDs.includes(msg.from)) return;

  let davetBekleyen = null;
  try {
    const davetSnapshot = await get(ref(database, "sistem_hafizasi/davet_bekleyen"));
    davetBekleyen = davetSnapshot.val();
  } catch (error) {
    console.error("❌ Bekleyen davet Firebase'den okunamadı:", error);
    return;
  }

  let contact = null;
  if (davetBekleyen) {
    try {
      contact = await msg.getContact();
      const davetYanitlandi = await davetYanitiniIsle(msg, body, davetBekleyen, contact);
      if (davetYanitlandi) return;
    } catch (error) {
      console.error("❌ Bekleyen davet yanıtı işlenemedi:", error);
      return;
    }
  }

  if (body.trim() === "-1") {
    try {
      await eksiBirIsle(msg, contact);
    } catch (error) {
      console.error("❌ -1 kadro değişikliği işlenemedi:", error);
    }
    return;
  }

  if (body.toUpperCase().trim() === "BOT AKTİF Mİ?") {
    console.log("🎲 Kalp atışı kontrolü tetiklendi. Yanıt fırlatılıyor...");
    await client.sendMessage(msg.from, "🤖 *Halı Saha Otomasyon Botu Aktif!* \n\n💻 Ev bilgisayarı üzerinden 7/24 (08:30 - 22:00) dinlemedeyim. Komutlarınızı bekliyorum.");
    return;
  }

  if (!(msg.body || "").toUpperCase().includes("ANA KADRO")) return;

  console.log(`🎯 [BAŞARILI] Bot Test grubundan mesaj yakalandı! Gönderen ID: ${msg.from}`);

  try {
    const { anaKadro, yedekKadro: yedekKadroIsimleri } = isimListesiniAyikla(body);
    const oyuncuHavuzu = await oyuncuHavuzunuGetir();
    const yedekler = yedekKadroIsimleri.map((isim) => {
      const oyuncu = oyuncuyuHavuzdaBul(isim, oyuncuHavuzu);
      return oyuncu
        ? { isim: oyuncu.isim, anaMevki: oyuncu.anaMevki }
        : { isim, anaMevki: VARSAYILAN_OYUNCU.anaMevki };
    });

    const { kadro, mod, takimlar } = await akllliTakimlariKur(anaKadro, oyuncuHavuzu);
    const firebaseKadro = { kadro, mod, yedekler };
    await set(ref(database, "sistem_hafizasi/canli_kadro"), firebaseKadro);

    const slotMevkileri = {
      pos_0: "KL",
      pos_1: "SLB",
      pos_2: "STP",
      pos_3: "SĞB",
      pos_4: "SLO",
      pos_5: "SĞO",
      pos_6: "FOR",
    };
    const takimMesaji = (takimKadro) => Object.entries(takimKadro)
      .filter(([, oyuncu]) => Boolean(oyuncu))
      .map(([slot, oyuncu], index) =>
        `${index + 1}. ${oyuncu.isim || oyuncu} (${slotMevkileri[slot] || mevkiKodunuNormallestir(oyuncu.anaMevki) || VARSAYILAN_OYUNCU.anaMevki})`
      )
      .join("\n");
    const yedekMesaji = yedekler
      .map((oyuncu) => `• ${oyuncu.isim} (${mevkiKodunuNormallestir(oyuncu.anaMevki)})`)
      .join("\n");
    const yanitMetni = `⚽ *Akıllı Kadro Dağıtımı Tamamlandı!*

🔴 *KIRMIZI TAKIM*
${takimMesaji(kadro.red) || "Oyuncu yok"}

⚪ *BEYAZ TAKIM*
${takimMesaji(kadro.white) || "Oyuncu yok"}

⏳ *YEDEK LİSTESİ*
${yedekMesaji || "Yedek oyuncu yok"}

🏟️ _Kadrolar https://erhaners.github.io/halisaha/ taktik tahtasına işlenmiştir._`;

    console.log("✅ Canlı kadro Firebase'e başarıyla kaydedildi.");
    try {
      const tumSohbetler = await client.getChats();
      const gercekSohbetOdasi = tumSohbetler.find(c => c.isGroup && (c.name.toLowerCase().includes("has kadro") || c.name.toLowerCase().includes("bot test")));

      let hedefGonderimID = msg.from;
      if (gercekSohbetOdasi) {
        hedefGonderimID = gercekSohbetOdasi.id._serialized;
        console.log(`💡 Dinamik Hedef Seçildi -> Grup Adı: ${gercekSohbetOdasi.name} | Gerçek ID: ${hedefGonderimID}`);
      }

      await client.sendMessage(hedefGonderimID, yanitMetni);
      console.log("🚀 Dağıtım yanıtı gruba başarıyla gönderildi!");
    } catch (error) {
      console.error("❌ WhatsApp yanıtı gönderilirken hata oluştu:", error);
    }
  } catch (error) {
    console.error("❌ Kadro işleme adımlarında hata oluştu:", error);
  }
}

function oyuncuAdiAnahtari(isim) {
  return String(isim || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR");
}

function kadroOyuncusununAdi(oyuncu) {
  return typeof oyuncu === "string" ? oyuncu : oyuncu?.isim;
}

function yedekleriDiziOlarakAl(yedekler) {
  return (
    Array.isArray(yedekler)
      ? [...yedekler]
      : Object.values(yedekler || {})
  ).filter(Boolean);
}

function davetTakiminiNormallestir(takim) {
  const takimAnahtari = String(takim || "").trim().toLowerCase();
  if (takimAnahtari === "red" || takimAnahtari === "kırmızı") return "red";
  if (takimAnahtari === "white" || takimAnahtari === "beyaz") return "white";
  return null;
}

async function davetYanitiniIsle(msg, body, davetBekleyen, contact) {
  if (msg.fromMe || !davetBekleyen?.isim) return false;

  const davetEdilenAnahtari = oyuncuAdiAnahtari(davetBekleyen.isim);
  const gonderenAdlari = [contact?.name, contact?.pushname]
    .map(oyuncuAdiAnahtari)
    .filter(Boolean);
  if (!gonderenAdlari.includes(davetEdilenAnahtari)) return false;

  const yanit = body.trim().toLocaleLowerCase("tr-TR");
  const yanitKelimeleri = yanit.match(/[a-zçğıöşü0-9+-]+/g) || [];
  const yanitIceriyor = (ifade) =>
    ifade === "+1" || ifade === "-1"
      ? yanit.includes(ifade)
      : yanitKelimeleri.includes(ifade);
  const olumsuzYanit = ["-1", "gelemem", "yokum", "gelemiyorum"]
    .some(yanitIceriyor);
  const olumluYanit = ["+1", "gelirim", "varım", "ok", "tamam"]
    .some(yanitIceriyor);
  if (!olumsuzYanit && !olumluYanit) return false;

  const takim = davetTakiminiNormallestir(davetBekleyen.takim);
  const slot = davetBekleyen.slot;
  if (!takim || !/^pos_\d+$/.test(String(slot || ""))) {
    console.error("❌ Bekleyen davetin takım veya slot bilgisi geçersiz:", davetBekleyen);
    return true;
  }

  if (olumsuzYanit) {
    let sonucBilgisi = null;
    const sonuc = await runTransaction(ref(database, "sistem_hafizasi"), (hafiza) => {
      sonucBilgisi = null;
      const mevcutDavet = hafiza?.davet_bekleyen;
      if (
        !mevcutDavet ||
        oyuncuAdiAnahtari(mevcutDavet.isim) !== davetEdilenAnahtari ||
        davetTakiminiNormallestir(mevcutDavet.takim) !== takim ||
        mevcutDavet.slot !== slot
      ) {
        return;
      }

      const canliKadro = hafiza.canli_kadro;
      if (!canliKadro) return;
      const yedekler = yedekleriDiziOlarakAl(canliKadro.yedekler);
      if (
        !yedekler.length ||
        oyuncuAdiAnahtari(kadroOyuncusununAdi(yedekler[0])) !== davetEdilenAnahtari
      ) {
        return;
      }

      const reddeden = yedekler.shift();
      yedekler.push(reddeden);
      const yeniDavetEdilen = yedekler.length > 1
        ? kadroOyuncusununAdi(yedekler[0])
        : null;
      const yeniDavet = yeniDavetEdilen
        ? { ...mevcutDavet, isim: yeniDavetEdilen, takim, slot }
        : null;
      sonucBilgisi = {
        reddeden: kadroOyuncusununAdi(reddeden) || davetBekleyen.isim,
        yeniDavetEdilen,
      };

      return {
        ...hafiza,
        canli_kadro: { ...canliKadro, yedekler },
        davet_bekleyen: yeniDavet,
      };
    });

    if (!sonuc.committed || !sonucBilgisi) {
      console.log(`ℹ️ ${davetBekleyen.isim} için bekleyen yedek kaydı değişmiş; ret yanıtı uygulanmadı.`);
      return true;
    }

    const redMesaji = sonucBilgisi.yeniDavetEdilen
      ? `⏭️ *${sonucBilgisi.reddeden}* bu hafta müsait değilmiş.\n\n🎉 *Hey ${sonucBilgisi.yeniDavetEdilen}, sıra sende!* Sahada yerin hazır. Geliyorsan lütfen gruba *+1* veya *gelirim* yaz!`
      : "⚠️ Yedek listesinde davet edilecek başka oyuncu kalmadı.";
    await client.sendMessage(msg.from, redMesaji);
    return true;
  }

  const oyuncuHavuzu = await oyuncuHavuzunuGetir();
  const oyuncu = oyuncuHavuzu.find(
    (aday) => oyuncuAdiAnahtari(aday.isim) === davetEdilenAnahtari
  );
  if (!oyuncu) {
    console.error(`❌ Davet edilen oyuncu güncel havuzda bulunamadı: ${davetBekleyen.isim}`);
    return true;
  }

  let yerlesenOyuncu = null;
  const sonuc = await runTransaction(ref(database, "sistem_hafizasi"), (hafiza) => {
    yerlesenOyuncu = null;
    const mevcutDavet = hafiza?.davet_bekleyen;
    if (
      !mevcutDavet ||
      oyuncuAdiAnahtari(mevcutDavet.isim) !== davetEdilenAnahtari ||
      davetTakiminiNormallestir(mevcutDavet.takim) !== takim ||
      mevcutDavet.slot !== slot
    ) {
      return;
    }

    const canliKadro = hafiza.canli_kadro;
    if (!canliKadro?.kadro) return;
    const kadro = {
      ...canliKadro.kadro,
      red: { ...(canliKadro.kadro.red || {}) },
      white: { ...(canliKadro.kadro.white || {}) },
    };
    if (kadro[takim][slot]) return;

    const yedekler = yedekleriDiziOlarakAl(canliKadro.yedekler);
    const yedekIndex = yedekler.findIndex((yedek) =>
      (yedek?.id !== undefined && String(yedek.id) === String(oyuncu.id)) ||
      oyuncuAdiAnahtari(kadroOyuncusununAdi(yedek)) === davetEdilenAnahtari
    );
    if (yedekIndex < 0) return;

    yedekler.splice(yedekIndex, 1);
    kadro[takim][slot] = oyuncu;
    yerlesenOyuncu = oyuncu.isim;
    return {
      ...hafiza,
      canli_kadro: { ...canliKadro, kadro, yedekler },
      davet_bekleyen: null,
    };
  });

  if (!sonuc.committed || !yerlesenOyuncu) {
    console.log(`ℹ️ ${davetBekleyen.isim} daveti için kadro kaydı değişmiş; kabul yanıtı uygulanmadı.`);
    return true;
  }

  await client.sendMessage(
    msg.from,
    `✅ *Kadro Tamamlandı!*\n\n🎉 *${yerlesenOyuncu}* daveti kabul etti ve takımdaki yerini aldı! Güncel dizilim taktik tahtasına işlendi.`
  );
  return true;
}

async function eksiBirIsle(msg, contact = null) {
  if (msg.fromMe) return;

  contact = contact || await msg.getContact();
  const gonderenAdlari = [contact?.name, contact?.pushname]
    .map(oyuncuAdiAnahtari)
    .filter(Boolean);
  if (gonderenAdlari.length === 0) {
    console.log("ℹ️ -1 gönderen kişinin rehber veya profil adı bulunamadı.");
    return;
  }

  const oyuncuHavuzu = await oyuncuHavuzunuGetir();
  const oyuncu = oyuncuHavuzu.find((aday) =>
    gonderenAdlari.includes(oyuncuAdiAnahtari(aday.isim))
  );
  if (!oyuncu) {
    console.log(`ℹ️ -1 gönderen kişi oyuncu havuzunda bulunamadı: ${gonderenAdlari.join(" / ")}`);
    return;
  }

  const oyuncuAdlari = new Set([
    ...gonderenAdlari,
    oyuncuAdiAnahtari(oyuncu.isim),
  ]);
  let degisiklik = null;
  const sonuc = await runTransaction(ref(database, "sistem_hafizasi"), (hafiza) => {
    degisiklik = null;
    if (!hafiza?.canli_kadro?.kadro) return;

    const canliKadro = hafiza.canli_kadro;
    const kadro = {
      ...canliKadro.kadro,
      red: { ...(canliKadro.kadro.red || {}) },
      white: { ...(canliKadro.kadro.white || {}) },
    };
    let cikanOyuncu = null;
    let takim = null;
    let slot = null;

    for (const takimAdi of ["red", "white"]) {
      const eslesme = Object.entries(kadro[takimAdi]).find(([, kadroOyuncusu]) => {
        if (!kadroOyuncusu) return false;
        if (kadroOyuncusu.id !== undefined && String(kadroOyuncusu.id) === String(oyuncu.id)) {
          return true;
        }
        return oyuncuAdlari.has(oyuncuAdiAnahtari(kadroOyuncusununAdi(kadroOyuncusu)));
      });
      if (eslesme) {
        takim = takimAdi;
        [slot, cikanOyuncu] = eslesme;
        break;
      }
    }

    if (!takim) return;

    kadro[takim][slot] = null;
    const yedekler = yedekleriDiziOlarakAl(canliKadro.yedekler);
    yedekler.push(oyuncu);

    const ilkYedek = yedekler[0];
    const davetEdilenIsim = kadroOyuncusununAdi(ilkYedek);
    const davetBekleyen = davetEdilenIsim
      ? {
          isim: davetEdilenIsim,
          takim,
          slot,
        }
      : null;

    degisiklik = {
      cikanIsim: kadroOyuncusununAdi(cikanOyuncu) || oyuncu.isim,
      davetEdilenIsim,
      takim,
      slot,
    };
    return {
      ...hafiza,
      canli_kadro: { ...canliKadro, kadro, yedekler },
      davet_bekleyen: davetBekleyen,
    };
  });

  if (!sonuc.committed || !degisiklik) {
    console.log(`ℹ️ -1 gönderen oyuncu aktif kadroda bulunamadı: ${oyuncu.isim}`);
    return;
  }

  if (!degisiklik.davetEdilenIsim) return;

  const mesaj = `🚨 *Kadroda Değişiklik Var!*

❌ *${degisiklik.cikanIsim}* bu hafta aramızda olamayacak ve yedek listesinin sonuna eklendi.

🎉 *Hey ${degisiklik.davetEdilenIsim}, sana yer açıldı!* Bu fırsatı kaçırmak istemezsin, sahada yerin hazır. Geliyorsan lütfen gruba *+1* veya *gelirim* yaz!`;
  await client.sendMessage(msg.from, mesaj);
  console.log(
    `✅ ${degisiklik.cikanIsim} kadrodan çıkarıldı; ${degisiklik.davetEdilenIsim} davet edildi (${degisiklik.takim}, ${degisiklik.slot}).`
  );
}


client.on("message", mesajıIsle);
client.on("message_create", mesajıIsle);

client.on("auth_failure", async (msg) => {
  whatsappAuthenticated = false;
  console.error("❌ WhatsApp kimlik doğrulama hatası:", msg);
  await canliQrKodunuTemizle().catch((error) => {
    console.error("❌ Eski QR kodu Firebase'den temizlenemedi:", error);
  });
  await botDurumunuKaydet("DISCONNECTED").catch((error) => {
    console.error("❌ Bot durumu Firebase'e yazılamadı:", error);
  });
});

function yenidenBaglanmayiPlanla() {
  if (whatsappAuthenticated || reconnectTimer || reconnectInProgress) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnectInProgress = true;
    let retryNeeded = false;

    try {
      await client.destroy();
      await client.initialize();
      console.log("🔄 WhatsApp istemcisi yeniden başlatıldı.");
    } catch (error) {
      retryNeeded = !whatsappAuthenticated;
      console.error("❌ WHATSAPP YENİDEN BAŞLATMA HATASI:", error);
      console.error("❌ WhatsApp yeniden başlatılamadı:", error);
      await botDurumunuKaydet("DISCONNECTED").catch((durumHatasi) => {
        console.error("❌ Bot durumu Firebase'e yazılamadı:", durumHatasi);
      });
    } finally {
      reconnectInProgress = false;
      if (retryNeeded && !whatsappAuthenticated) yenidenBaglanmayiPlanla();
    }
  }, 5000);
}

client.on("disconnected", async (reason) => {
  whatsappAuthenticated = false;
  console.log("⚠️ WhatsApp bağlantısı koptu:", reason);
  await canliQrKodunuTemizle().catch((error) => {
    console.error("❌ QR kodu Firebase'den temizlenemedi:", error);
  });
  await botDurumunuKaydet("DISCONNECTED").catch((error) => {
    console.error("❌ Bot durumu Firebase'e yazılamadı:", error);
  });
  yenidenBaglanmayiPlanla();
});

async function botHatasindaDurumuBildirVeCik() {
  await canliQrKodunuTemizle().catch((error) => {
    console.error("❌ QR kodu Firebase'den temizlenemedi:", error);
  });
  await botDurumunuKaydet("DISCONNECTED").catch((error) => {
    console.error("❌ Bot durumu Firebase'e yazılamadı:", error);
  });
  process.exit(1);
}

process.on("uncaughtException", (error) => {
  console.error("❌ Yakalanmamış hata, bot kapatılıyor:", error);
  botHatasindaDurumuBildirVeCik();
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Yakalanmamış promise hatası, bot kapatılıyor:", reason);
  botHatasindaDurumuBildirVeCik();
});

async function botuBaslat() {
  while (!whatsappAuthenticated) {
    try {
      console.log("⏳ 1. Firebase QR temizleniyor...");
      await canliQrKodunuTemizle();
      console.log("⏳ 2. Firebase durum güncelleniyor...");
      await botDurumunuKaydet("DISCONNECTED");
      console.log("⏳ 3. WhatsApp Web ve Chromium başlatılıyor...");
      await client.initialize();
      return;
    } catch (error) {
      if (whatsappAuthenticated) {
        console.error("❌ WhatsApp kimlik doğrulandı; başlangıç yeniden denemesi iptal edildi:", error);
        return;
      }
      console.error("❌ BOT BAŞLATMA HATASI:", error);
      console.error("❌ WhatsApp bot başlatılamadı; 5 saniye sonra yeniden denenecek:", error);
      await botDurumunuKaydet("DISCONNECTED").catch((durumHatasi) => {
        console.error("❌ Bot durumu Firebase'e yazılamadı:", durumHatasi);
      });
      await client.destroy().catch((temizlemeHatasi) => {
        console.error("❌ WhatsApp istemcisi yeniden başlatma öncesi kapatılamadı:", temizlemeHatasi);
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

app.get("/", (req, res) => {
  res.send("Halisaha Bot Arka Planda Aktif!");
});

app.listen(PORT, () => {
  console.log(`Render port köprüsü aktif: ${PORT}`);
});

botuBaslat();
