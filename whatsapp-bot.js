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
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set, remove } = require("firebase/database");

const app = express();
const PORT = process.env.PORT || 10000;
const CANLI_KADRO_YOLU = "sistem_hafizasi/canli_kadro";
const WHATSAPP_PROFIL_YOLU = path.join(__dirname, ".wwebjs_auth", "session-halisaha-bot");
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

  return `⚽ *Maç Tamamlandı! Gelecek Hafta Yoklaması Başladı* 📋

Bu haftanın son kadrosu aşağıdadır. Gelecek hafta Perşembe maçına *gelemeyecek* olanlar lütfen gruba *-1* yazsın:

🔴 *KIRMIZI TAKIM*
${kirmiziOyuncular.join("\n") || "Oyuncu yok"}

⚪ *BEYAZ TAKIM*
${beyazOyuncular.join("\n") || "Oyuncu yok"}

Not: -1 yazanların yerine sıradaki yedek oyuncular otomatik davet edilecektir.`;
}

async function haftalikYoklamaGonder() {
  const kadroSnapshot = await get(ref(database, CANLI_KADRO_YOLU));
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
      simdi.dakika !== 15 ||
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
  authTimeoutMs: 60000,
  authStrategy: new LocalAuth({
    clientId: "halisaha-bot",
    dataPath: path.join(__dirname, ".wwebjs_auth"),
  }),
  webVersionCache: { type: 'none' },
  puppeteer: {
    headless: true,
    executablePath: require('fs').existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  },
});

let whatsappAuthenticated = false;
let whatsappReady = false;
let reconnectTimer = null;
let reconnectInProgress = false;
let readyWatchdogTimer = null;

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
  reconnectInProgress = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (readyWatchdogTimer) clearTimeout(readyWatchdogTimer);
  readyWatchdogTimer = setTimeout(() => {
    readyWatchdogTimer = null;
    void (async () => {
      if (!whatsappAuthenticated || whatsappReady) return;

      let storeHazir = false;
      try {
        storeHazir = await client.pupPage.evaluate(() =>
          Boolean(window.Store && window.Store.Msg && window.Store.Chat)
        );
      } catch (error) {
        console.error("❌ WhatsApp Web hazır durumu kontrol edilemedi:", error);
      }

      if (storeHazir) {
        console.warn("⚠️ WhatsApp hazır olayı gelmedi; hazır Store üzerinden devam ediliyor.");
        await istemciHazirOldu();
        return;
      }

      console.error("❌ WhatsApp Web 25 saniyede hazır olmadı; istemci yeniden başlatılıyor.");
      whatsappAuthenticated = false;
      whatsappReady = false;
      reconnectInProgress = true;
      try {
        await client.destroy();
      } catch (error) {
        console.error("❌ WhatsApp istemcisi watchdog öncesi kapatılamadı:", error);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      await botuBaslat();
    })().catch((error) => {
      console.error("❌ WhatsApp hazır watchdog başarısız oldu:", error);
    });
  }, 25000);
  console.log("⏳ WhatsApp Web arayüzü yükleniyor, lütfen bekleyin...");
  console.log("✅ WhatsApp kimlik doğrulandı; yerel oturum kaydedildi.");
});

client.on('loading_screen', (percent, message) =>
  console.log('⏳ Yükleniyor:', percent, message)
);

async function istemciHazirOldu() {
  if (readyWatchdogTimer) {
    clearTimeout(readyWatchdogTimer);
    readyWatchdogTimer = null;
  }
  if (whatsappReady) return;
  whatsappReady = true;
  if (!client.info) {
    console.log("⏳ WhatsApp istemci bilgileri bekleniyor...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

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
}

client.on("ready", istemciHazirOldu);

async function mesajıIsle(msg) {
  if (!msg) return;
  const kucukGovde = String(msg.body || "").toLocaleLowerCase("tr-TR");
  const botSablonCumleleri = [
    "sakin ol şampiyon",
    "heyecanını anlıyorum",
    "yedek listesinden kaydını sildim",
    "listeye baktım ama",
    "kadrodaki boş yere eklendi",
    "yedek listesinin sonuna eklendi",
    "kadroda değişiklik var",
    "kadro tamamlandı",
    "akıllı kadro dağıtımı",
    "halı saha otomasyon botu aktif",
    "maç tamamlandı",
    "ana kadro dolu",
    "güncel kadro durumu",
    "yedek olarak eklendi",
    "daveti kabul etti",
    "sıra sende",
    "sana yer açıldı",
    "kadroda kayıtlısın",
    "yedek kulübesine alıyorum",
  ];
  if (
    msg.fromMe &&
    botSablonCumleleri.some((cumle) => kucukGovde.includes(cumle))
  ) return;

  console.log("📥 HAM SİNYAL:", msg.from, msg.body?.substring(0, 20));
  if (msg.timestamp < botBaslangicZamani) return;
  const chat = await msg.getChat();
  if (!chat.isGroup) return;
  const grupAdi = (chat.name || "").toLocaleLowerCase("tr-TR");
  if (!grupAdi.includes("bot test") && !grupAdi.includes("has kadro")) return;
  const hedefGrupId = chat.id._serialized;
  msg.hedefGrupId = hedefGrupId;

  console.log(`📡 [YENİ MESAJ GELDİ] -> msg.from: "${msg?.from}" | Gövde: "${String(msg?.body || "").substring(0, 15)}..."`);

  if (!msg || !msg.from || msg.from.includes('broadcast')) return;

  const body = typeof msg.body === "string" ? msg.body : "";
  if (!body.trim()) return;
  const etiketliMesajMi = Boolean(msg.mentionedIds?.length) || body.includes("@");
  const ayrilmaKomutuMu = olumsuzYanitMi(body);
  const katilmaKomutuMu = olumluYanitMi(body);

  let canliKadroVerisi = null;
  if (ayrilmaKomutuMu || katilmaKomutuMu) {
    try {
      const canliKadroSnapshot = await get(ref(database, CANLI_KADRO_YOLU));
      canliKadroVerisi = canliKadroSnapshot.val();
      const kadro = canliKadroVerisi?.kadro || {};
      const takimOyuncuSayisi = (takim) =>
        Object.values(kadro[takim] || {}).filter(Boolean).length;
      const yedekSayisi = yedekleriDiziOlarakAl(canliKadroVerisi?.yedekler).length;
      console.log(
        `📦 Kadro verisi okundu (Kırmızı: ${takimOyuncuSayisi("red")}, Beyaz: ${takimOyuncuSayisi("white")}, Yedek: ${yedekSayisi})`
      );
    } catch (error) {
      console.error("❌ Canlı kadro verisi okunamadı:", error);
    }
  }

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
    if (!etiketliMesajMi) {
      contact = await guvenliKisiBilgisiAl(msg);
    }
    try {
      const davetYanitlandi = await davetYanitiniIsle(
        msg,
        body,
        davetBekleyen,
        contact,
        canliKadroVerisi
      );
      if (davetYanitlandi) return;
    } catch (error) {
      console.error("❌ Bekleyen davet yanıtı işlenemedi:", error);
      return;
    }
  }

  const katilimAyrilmaKomutuMu = ayrilmaKomutuMu || katilmaKomutuMu;
  let katilimAyrilmaBilgisi = null;
  if (katilimAyrilmaKomutuMu) {
    try {
      katilimAyrilmaBilgisi = await katilimAyrilmaKisisiniBul(
        msg,
        canliKadroVerisi,
        contact
      );
      contact = etiketliMesajMi
        ? katilimAyrilmaBilgisi.contact
        : katilimAyrilmaBilgisi.contact || contact;
      console.log(
        "🔍 Katılım/Ayrılma algılandı -> Ham İsim:",
        katilimAyrilmaBilgisi.bulunanIsim,
        "| Mesaj:",
        body
      );
      if (!katilimAyrilmaBilgisi.oyuncu) {
        console.log(
          "⚠️ Eşleşme başarısız! Tanınamayan kişi:",
          katilimAyrilmaBilgisi.bulunanIsim
        );
      }
    } catch (error) {
      console.error("❌ Katılım/Ayrılma kişi eşleşmesi alınamadı:", error);
    }
  }

  if (ayrilmaKomutuMu) {
    try {
      await eksiBirIsle(msg, contact, katilimAyrilmaBilgisi, canliKadroVerisi);
    } catch (error) {
      console.error("❌ Olumsuz yanıt kadro değişikliği işlenemedi:", error);
    }
    return;
  }

  if (katilmaKomutuMu) {
    try {
      await artiBirIsle(msg, contact, katilimAyrilmaBilgisi, canliKadroVerisi);
    } catch (error) {
      console.error("❌ Katılma isteği işlenemedi:", error);
    }
    return;
  }

  if (body.toLocaleUpperCase("tr-TR").includes("BOT AKTİF Mİ")) {
    console.log("🎲 Kalp atışı kontrolü tetiklendi. Yanıt fırlatılıyor...");
    if (!hedefGrupId || (!hedefGrupId.includes("@g.us") && !hedefGrupId.includes("@lid"))) return;
    await client.sendMessage(hedefGrupId, "🤖 *Halı Saha Otomasyon Botu Aktif!* \n\n💻 Ev bilgisayarı üzerinden her gün *08:30 - 00:30* saatleri arasında dinlemedeyim. Komutlarınızı bekliyorum.");
    return;
  }

  const anaKadroBasligiVarMi = body
    .split(/\r?\n/)
    .some((satir) => satir.toLocaleUpperCase("tr-TR").includes("ANA KADRO"));
  if (!anaKadroBasligiVarMi) return;

  console.log(`🎯 [BAŞARILI] Bot Test grubundan mesaj yakalandı! Gönderen ID: ${msg.from}`);

  try {
    const { anaKadro, yedekKadro: yedekKadroIsimleri } = isimListesiniAyikla(body);
    if (anaKadro.length < 5) {
      console.log("ℹ️ Kadro dağıtımı atlandı: ANA KADRO başlığının altında en az 5 oyuncu bulunmalı.");
      return;
    }

    const oyuncuHavuzu = await oyuncuHavuzunuGetir();
    const yedekler = yedekKadroIsimleri.map((isim, index) => {
      const oyuncu = oyuncuyuHavuzdaBul(isim, oyuncuHavuzu);
      return oyuncu
        ? oyuncu
        : {
            ...VARSAYILAN_OYUNCU,
            id: `whatsapp-yedek-${index}-${isimAnahtari(isim)}`,
            isim,
          };
    });

    const { kadro, mod, takimlar } = await akllliTakimlariKur(anaKadro, oyuncuHavuzu);
    const firebaseKadro = webArayuzuCanliKadroVerisi({ mod }, kadro, yedekler);
    await set(ref(database, CANLI_KADRO_YOLU), firebaseKadro);

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
      .map((oyuncu, index) => `${index + 1}. ${oyuncu.isim} (${mevkiKodunuNormallestir(oyuncu.anaMevki)})`)
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
      if (!hedefGrupId || (!hedefGrupId.includes("@g.us") && !hedefGrupId.includes("@lid"))) return;
      await client.sendMessage(hedefGrupId, yanitMetni);
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

function webArayuzuIcinMevkiyiNormallestir(mevki) {
  const kod = String(mevki || "").trim().toLocaleUpperCase("tr-TR");
  const mevkiKodlari = {
    KALECI: "KL",
    KALECİ: "KL",
    GK: "KL",
    DEF: "STP",
    DEFANS: "STP",
    "SOL BEK": "SLB",
    "SOL DEFANS": "SLB",
    LB: "SLB",
    STOPER: "STP",
    "MERKEZ DEFANS": "STP",
    CB: "STP",
    "SAĞ BEK": "SĞB",
    "SAG BEK": "SĞB",
    "SAĞ DEFANS": "SĞB",
    "SAG DEFANS": "SĞB",
    RB: "SĞB",
    "ORTA SAHA": "SLO",
    ORT: "SLO",
    "SOL ORTA SAHA": "SLO",
    "SAĞ ORTA SAHA": "SĞO",
    "SAG ORTA SAHA": "SĞO",
    HUC: "FOR",
    HÜCUM: "FOR",
    SANTRAFOR: "FOR",
    ST: "FOR",
    KL: "KL",
    SLB: "SLB",
    STP: "STP",
    "SĞB": "SĞB",
    SLO: "SLO",
    "SĞO": "SĞO",
    FOR: "FOR",
  };
  return mevkiKodlari[kod] || kod || "Yok";
}

function webArayuzuOyuncusunaDonustur(oyuncu) {
  const oyuncuVerisi = oyuncu && typeof oyuncu === "object" ? oyuncu : {};
  const isim = kadroOyuncusununAdi(oyuncu) || "";
  return {
    id: String(oyuncuVerisi.id ?? `whatsapp-${isimAnahtari(isim)}`),
    isim,
    anaMevki: webArayuzuIcinMevkiyiNormallestir(
      oyuncuVerisi.anaMevki || VARSAYILAN_OYUNCU.anaMevki
    ),
    anaTakim: oyuncuVerisi.anaTakim || "Yok",
    alternatifMevki: webArayuzuIcinMevkiyiNormallestir(
      oyuncuVerisi.alternatifMevki ||
      oyuncuVerisi.alternatifPosition ||
      "Yok"
    ),
    kl: oyuncuVerisi.kl ?? VARSAYILAN_OYUNCU.kl,
    def: oyuncuVerisi.def ?? VARSAYILAN_OYUNCU.def,
    ort: oyuncuVerisi.ort ?? VARSAYILAN_OYUNCU.ort,
    for: oyuncuVerisi.for ?? oyuncuVerisi.huc ?? VARSAYILAN_OYUNCU.for,
    hiz: oyuncuVerisi.hiz ?? VARSAYILAN_OYUNCU.hiz,
    pas: oyuncuVerisi.pas ?? VARSAYILAN_OYUNCU.pas,
    sut: oyuncuVerisi.sut ?? VARSAYILAN_OYUNCU.sut,
  };
}

function webArayuzuCanliKadroVerisi(kayit, kadro, yedekler) {
  const takimKadrosu = (takim) =>
    Object.fromEntries(
      Object.entries(takim || {}).map(([slot, oyuncu]) => [
        slot,
        oyuncu ? webArayuzuOyuncusunaDonustur(oyuncu) : null,
      ])
    );

  return {
    kadro: {
      red: takimKadrosu(kadro?.red),
      white: takimKadrosu(kadro?.white),
    },
    mod: kayit?.mod || "6v6",
    yedekler: yedekleriDiziOlarakAl(yedekler).map(webArayuzuOyuncusunaDonustur),
  };
}

function kadroSlotunuGec(takimKadro, isle) {
  if (!takimKadro) return null;
  for (let index = 0; index <= 6; index++) {
    const slot = `pos_${index}`;
    const sonuc = isle(slot, takimKadro[slot]);
    if (sonuc) return sonuc;
  }
  return null;
}

function takimObjesiniAl(veri, takimAdi) {
  if (veri?.kadro?.[takimAdi] && typeof veri.kadro[takimAdi] === "object") {
    return veri.kadro[takimAdi];
  }
  if (veri?.[takimAdi] && typeof veri[takimAdi] === "object") {
    return veri[takimAdi];
  }
  return null;
}

function slotIsminiAl(slotDegeri) {
  if (typeof slotDegeri === "string") return slotDegeri;
  if (slotDegeri && typeof slotDegeri === "object") {
    return slotDegeri.isim || slotDegeri.name || "";
  }
  return "";
}

function derinKadrodaEslesmeBul(veri, mesajIsmi) {
  const mesajAdlari = Array.isArray(mesajIsmi) ? mesajIsmi : [mesajIsmi];
  for (const takimAdi of ["red", "white"]) {
    const takimObjesi = takimObjesiniAl(veri, takimAdi);
    if (!takimObjesi) continue;
    for (const [slot, slotDegeri] of Object.entries(takimObjesi)) {
      if (!slotDegeri) continue;
      const slotAdi = slotIsminiAl(slotDegeri);
      if (
        slotAdi &&
        mesajAdlari.some((mesajAdi) => isimEslesiyorMu(mesajAdi, slotAdi))
      ) {
        return { takim: takimAdi, slot, slotDegeri };
      }
    }
  }
  return null;
}

function turkceKucukIsim(isim) {
  return String(isim || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");
}

function isimEslesiyorMu(isim1, isim2) {
  let mesajIsmi = turkceKucukIsim(isim1).replace(/i/g, "ı").replace(/İ/g, "ı");
  let kadroIsmi = turkceKucukIsim(isim2).replace(/i/g, "ı").replace(/İ/g, "ı");
  if (!mesajIsmi || !kadroIsmi) return false;
  if (mesajIsmi === kadroIsmi) return true;
  if (mesajIsmi.includes(kadroIsmi) && kadroIsmi.length >= 3) return true;
  if (kadroIsmi.includes(mesajIsmi) && kadroIsmi.length >= 3) return true;
  return false;
}

function esnekIsimEslesti(bulunanIsim, adayIsim) {
  return isimEslesiyorMu(bulunanIsim, adayIsim);
}

async function guvenliKisiBilgisiAl(msg) {
  try {
    const contact = await client.getContactById(msg.author || msg.from);
    if (contact) return contact;
  } catch {
  }

  const notifyName = String(msg?._data?.notifyName || "").trim();
  return {
    name: notifyName || (msg?.fromMe ? "Erhan Ersoy" : ""),
    pushname: msg?.fromMe ? "Erhan Ersoy" : notifyName,
  };
}

async function katilimAyrilmaKisisiniBul(msg, canliKadroVerisi = null, contact = null) {
  const adayIsimler = [];
  const etiketliKisiId = msg.mentionedIds?.[0];
  const etiketliMesajMi = Boolean(msg.mentionedIds?.length) ||
    String(msg.body || "").includes("@");

  if (etiketliMesajMi) {
    contact = null;
    if (etiketliKisiId) {
      try {
        contact = await client.getContactById(etiketliKisiId);
      } catch (error) {
        console.error("❌ Etiketlenen kişinin WhatsApp bilgileri alınamadı:", error);
      }
    }

    const contactName = String(contact?.name || "").trim();
    const pushName = String(contact?.pushname || "").trim();
    if (contactName) adayIsimler.push(contactName);
    if (pushName && pushName !== contactName) adayIsimler.push(pushName);

    const mesajdakiIsim = etiketliKisiAdiniAl(msg.body);
    if (mesajdakiIsim && !adayIsimler.includes(mesajdakiIsim)) {
      adayIsimler.push(mesajdakiIsim);
    }
  } else {
    if (!contact) {
      contact = await guvenliKisiBilgisiAl(msg);
    }
    const contactName = String(contact?.name || "").trim();
    const pushName = String(contact?.pushname || "").trim();
    if (contactName) adayIsimler.push(contactName);
    if (pushName && pushName !== contactName) adayIsimler.push(pushName);
    if (adayIsimler.length === 0) {
      const notifyName = String(msg?._data?.notifyName || "").trim();
      if (notifyName) adayIsimler.push(notifyName);
    }
    if (msg.fromMe) {
      adayIsimler.push("Erhan Ersoy");
    }
  }

  let bulunanIsim = adayIsimler[0] || "";

  const oyuncuHavuzu = await oyuncuHavuzunuGetir();
  const canliKadro = canliKadroVerisi;
  const kadroNesnesi = canliKadro?.kadro || canliKadro;
  if (!kadroNesnesi) {
    console.log("⚠️ Veritabanında aktif bir kadro bulunamadı, önce ANA KADRO listesi gönderilmeli.");
  }
  const kadroIsimleri = [];

  for (const takim of ["red", "white"]) {
    for (const oyuncu of Object.values(kadroNesnesi?.[takim] || {})) {
      kadroIsimleri.push(kadroOyuncusununAdi(oyuncu));
    }
  }
  kadroIsimleri.push(...yedekleriDiziOlarakAl(canliKadro?.yedekler).map(kadroOyuncusununAdi));

  const eslesenOyuncu = oyuncuHavuzu.find((oyuncu) =>
    adayIsimler.some((adayIsim) => esnekIsimEslesti(adayIsim, oyuncu.isim))
  );
  if (eslesenOyuncu) {
    bulunanIsim =
      adayIsimler.find((adayIsim) =>
        esnekIsimEslesti(adayIsim, eslesenOyuncu.isim)
      ) || bulunanIsim;
    return { bulunanIsim, oyuncu: eslesenOyuncu, contact };
  }

  const eslesenKadroAdi = kadroIsimleri.find((isim) =>
    adayIsimler.some((adayIsim) => esnekIsimEslesti(adayIsim, isim))
  );
  if (eslesenKadroAdi) {
    const havuzdakiEslesme = oyuncuHavuzu.find((oyuncu) =>
      esnekIsimEslesti(eslesenKadroAdi, oyuncu.isim)
    );
    if (havuzdakiEslesme) {
      bulunanIsim =
        adayIsimler.find((adayIsim) =>
          esnekIsimEslesti(adayIsim, eslesenKadroAdi)
        ) || bulunanIsim;
      return { bulunanIsim, oyuncu: havuzdakiEslesme, contact };
    }
  }

  return { bulunanIsim, oyuncu: null, contact };
}

function etiketliKisiAdiniAl(metin) {
  return String(metin || "")
    .replace(/@/g, " ")
    .replace(/(^|[\s,.;!?])(?:\+\s*1|-\s*1|_\s*1|\+|-)(?=$|[\s,.;!?])/g, " ")
    .replace(
      /(^|[\s,.;!?])(?:beni de ekle|ben de varım|gelirim|varım|kadroya ekle|gelemiyorum|gelemem|yokum|katılamayacağım|ok|tamam)(?=$|[\s,.;!?])/giu,
      " "
    )
    .replace(/^[\s,.;!?]+|[\s,.;!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function etiketliDavetYanitiTemizle(metin, hedefIsim) {
  let temiz = String(metin || "");
  const isimParcalari = String(hedefIsim || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (isimParcalari.length) {
    const isimRegex = isimParcalari
      .map((parca) => parca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    temiz = temiz.replace(
      new RegExp(`(^|[\\s@])${isimRegex}(?=$|[\\s,.;!?])`, "iu"),
      "$1 "
    );
  }

  return temiz
    .replace(/@\S+/g, " ")
    .replace(/@/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function yanitMetniniTemizle(yanit) {
  return String(yanit || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function olumsuzYanitMi(yanit) {
  const temiz = yanitMetniniTemizle(yanit);
  return /(?:^|\s)(?:-1|_1|-)(?=\s|$)/.test(temiz) ||
    ["gelemiyorum", "gelemem", "yokum", "katılamayacağım"].some((ifade) => temiz.includes(ifade));
}

function olumluYanitMi(yanit) {
  const temiz = yanitMetniniTemizle(yanit);
  return /(?:^|\s)\+(?:\s*1)?(?=\s|$)/.test(temiz) ||
    ["beni de ekle", "gelirim", "varım", "ben de varım", "kadroya ekle"].some((ifade) => temiz.includes(ifade));
}

function davetTakiminiNormallestir(takim) {
  const takimAnahtari = String(takim || "").trim().toLowerCase();
  if (takimAnahtari === "red" || takimAnahtari === "kırmızı") return "red";
  if (takimAnahtari === "white" || takimAnahtari === "beyaz") return "white";
  return null;
}

function rastgeleSec(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

function anaKadrodaZatenVarMesaji(isim) {
  return rastgeleSec([
    `😎 *${isim}*, kadroda yerin rezerve.\n+1'inle kadroya ikinci kez giremezsin!`,
    `⚽ *${isim}*, adın zaten ilk 11'de (tamam, 7'de) yazıyor.\nÇift krampon yeter!`,
    `📝 *${isim}*, seni kadroya çoktan yazdık.\nBu +1'i yedek kulübesine alıyorum.`,
    `🏃 *${isim}*, sahada zaten varsın!\nBir de kendine pas atmana gerek yok.`,
    `✅ *${isim}*, kadroda kayıtlısın.\nBu hafta seni klonlamıyoruz, tek kişilik yer var!`,
    `😄 *${isim}*, adın kadroda duruyor.\n+1 mesajın da moral desteği sayıldı.`,
    `🎟️ *${isim}*, biletin kesilmiş, koltuğun belli.\nKadroda zaten yerin hazır!`,
    `📋 *${isim}*, listeyi kontrol ettim: kadrodasın.\nHeyecandan iki kez yazdın galiba!`,
    `🥅 *${isim}*, kadroda zaten top koşturacaksın.\nBu +1'i ısınma turu sayalım.`,
    `🤝 *${isim}*, seni unutmadık merak etme.\nKadroda adın zaten baş köşede!`,
  ]);
}

function yedekteZatenVarMesaji(isim, sira) {
  return rastgeleSec([
    `⏳ *${isim}*, yedek listesinin ${sira}. sırasında zaten bekliyorsun.\n+1'le sıranı öne alamıyoruz!`,
    `🪑 *${isim}*, yedek koltuğun ${sira}. sıra.\nBir kez yazman yeter, mesajın sırayı değiştirmiyor!`,
    `📋 *${isim}*, kaydın hazır: ${sira}. yedeksin.\nListeye ikinci kez giriş yapmana gerek yok.`,
    `😄 *${isim}*, ${sira}. yedek olarak sıradasın.\n+1'in geldi, numara sistemi çalışıyor!`,
    `🫡 *${isim}*, yedek kuyruğunda ${sira}. sıradasın.\nYerini koruyorum, öne atlamaca yok!`,
    `🎟️ *${isim}*, yedek biletin ${sira}. sıra için kesildi.\nBir tane daha basmıyoruz!`,
    `⚽ *${isim}*, yedek listesindesin (${sira}. sıra).\nSahaya çağrılırsan haber uçuracağız!`,
    `🔎 *${isim}*, kontrol ettim: ${sira}. yedeksin.\nAynı +1'i iki kez saymıyoruz, VAR da onayladı!`,
    `📣 *${isim}*, sıran ${sira}. yedek.\nTribünden takip et, çağrı gelirse kramponları kap!`,
    `🙌 *${isim}*, kaydın zaten ${sira}. yedek olarak duruyor.\nBu mesajını da tezahürat hanesine yazdım!`,
  ]);
}

function yedekSonunaEklendiMesaji(isim, sira) {
  return rastgeleSec([
    `⏳ Ana kadro dolu; *${isim}* ${sira}. yedek olarak eklendi.\nBence sana sıra gelmez, fazla ümitlenme!`,
    `🪑 *${isim}* yedek listesinin sonuna, ${sira}. sıraya eklendi.\nKendine başka planlar yap, bu hafta yer çıkmaz gibi!`,
    `📋 *${isim}*, ${sira}. yedeksin.\nKramponları hazırla ama şimdilik takvimi de boşuna kilitleme!`,
    `😅 Kadro dolu olduğu için *${isim}* ${sira}. yedek oldu.\nSahaya çıkma ihtimalin var... matematiksel olarak!`,
    `⏳ *${isim}* yedek kuyruğunun ${sira}. sırasında.\nÇok erken sevinme; sıranın sana gelmesi biraz sürpriz olur!`,
    `🎟️ *${isim}* ${sira}. yedek olarak yazıldı.\nBu hafta planını yap, telefonun çalarsa bonus olur!`,
    `🫡 *${isim}*, yedek listesinin sonuna (${sira}. sıra) eklendin.\nUmudu kesme ama başka planı da iptal etme!`,
    `⚽ Kadro doldu; *${isim}* ${sira}. yedek.\nForma çantada dursun, ama tozunu alman gerekmeyebilir!`,
    `📣 *${isim}* ${sira}. yedek olarak listeye girdi.\nSana sıra gelirse bunu haftanın sürprizi ilan ederiz!`,
    `🙃 *${isim}*, ${sira}. yedeksin.\nBu hafta saha kenarı manzarası da fena değil, fazla ümitlenme!`,
  ]);
}

function guncelKadroMetniOlustur(canliKadroVerisi) {
  const slotMevkileri = {
    pos_0: "KL",
    pos_1: "SLB",
    pos_2: "STP",
    pos_3: "SĞB",
    pos_4: "SLO",
    pos_5: "SĞO",
    pos_6: "FOR",
  };
  const kadro = canliKadroVerisi?.kadro || canliKadroVerisi || {};
  const takimMetni = (takim) =>
    Array.from({ length: 7 }, (_, index) => {
      const slot = `pos_${index}`;
      const oyuncu = kadro[takim]?.[slot];
      if (!oyuncu) return `_[BOŞ YER - ${slotMevkileri[slot]}]_`;
      return `${index + 1}. ${kadroOyuncusununAdi(oyuncu)} (${slotMevkileri[slot]})`;
    }).join("\n");
  const yedekler = yedekleriDiziOlarakAl(canliKadroVerisi?.yedekler);
  const yedekMetni = yedekler.length
    ? yedekler.map((yedek, index) =>
        `${index + 1}. ${kadroOyuncusununAdi(yedek)} (${mevkiKodunuNormallestir(yedek?.anaMevki) || VARSAYILAN_OYUNCU.anaMevki})`
      ).join("\n")
    : "Yedek oyuncu yok";

  return `🔴 *KIRMIZI TAKIM*\n${takimMetni("red")}\n\n⚪ *BEYAZ TAKIM*\n${takimMetni("white")}\n\n⏳ *YEDEK LİSTESİ*\n${yedekMetni}\n\n🏟️ _Kadrolar https://erhaners.github.io/halisaha/ taktik tahtasına işlenmiştir._`;
}

async function davetYanitiniIsle(
  msg,
  body,
  davetBekleyen,
  contact,
  canliKadroVerisi = null
) {
  const ilkYanitlayan = [
    msg?._data?.notifyName,
    contact?.name,
    contact?.pushname,
    msg?.from,
  ].filter(Boolean).join(" / ") || "bilinmiyor";
  console.log(`📩 Davet yanıtı alındı: yanıtlayan ${ilkYanitlayan}.`);
  if (!davetBekleyen?.isim) {
    console.log("ℹ️ Yanıtlanacak bekleyen davet bulunamadı.");
    return false;
  }
  console.log(`📨 Bekleyen davet: ${davetBekleyen.isim} (${davetBekleyen.takim || "takım yok"}/${davetBekleyen.slot || "slot yok"}).`);

  const etiketliMesajMi = Boolean(msg.mentionedIds?.length) ||
    String(body || "").includes("@");
  const yanit = etiketliMesajMi
    ? etiketliDavetYanitiTemizle(body, davetBekleyen.isim)
    : body.trim().toLocaleLowerCase("tr-TR");
  const yanitKelimeleri = yanit.match(/[a-zçğıöşü0-9+-]+/g) || [];
  const olumsuzYanit = olumsuzYanitMi(yanit);
  const olumluYanit = olumluYanitMi(yanit) ||
    ["ok", "tamam"].some((ifade) => yanitKelimeleri.includes(ifade));
  console.log(
    `🔎 Davet yanıtı algısı: ${olumsuzYanit ? "olumsuz" : olumluYanit ? "olumlu" : "tanınmadı"} (metin: "${yanit}").`
  );
  if (!olumsuzYanit && !olumluYanit) {
    console.log("ℹ️ Mesaj davet yanıtı olmadığı için işlem yapılmadı.");
    return false;
  }

  let gonderenAdlari;
  if (etiketliMesajMi) {
    if (!canliKadroVerisi) {
      const canliKadroSnapshot = await get(ref(database, CANLI_KADRO_YOLU));
      canliKadroVerisi = canliKadroSnapshot.val();
    }
    const etiketliKisi = await katilimAyrilmaKisisiniBul(
      msg,
      canliKadroVerisi
    );
    gonderenAdlari = [
      etiketliKisi.bulunanIsim,
      etiketliKisi.oyuncu?.isim,
      etiketliKisi.contact?.name,
      etiketliKisi.contact?.pushname,
      etiketliKisiAdiniAl(body),
    ];
  } else {
    gonderenAdlari = [
      msg._data?.notifyName,
      contact?.name,
      contact?.pushname,
      msg.fromMe ? "Erhan Ersoy" : null,
    ];
  }
  gonderenAdlari = gonderenAdlari
    .map((isim) => String(isim || "").trim())
    .filter(Boolean);
  const eslesenGonderen = gonderenAdlari.find((isim) =>
    isimEslesiyorMu(isim, davetBekleyen.isim)
  );
  if (!eslesenGonderen) {
    console.log(
      `ℹ️ Yanıtlayan davet edilen kişiyle eşleşmedi. Beklenen: ${davetBekleyen.isim}; bulunan: ${gonderenAdlari.join(", ") || "isim yok"}.`
    );
    return false;
  }
  console.log(`✅ Yanıtlayan davet edilen kişiyle eşleşti: ${eslesenGonderen}.`);

  const takim = davetTakiminiNormallestir(davetBekleyen.takim);
  const slot = davetBekleyen.slot;
  if (!takim || !/^pos_\d+$/.test(String(slot || ""))) {
    console.error("❌ Bekleyen davetin takım veya slot bilgisi geçersiz:", davetBekleyen);
    return true;
  }

  console.log('📥 Bekleyen davet doğrulaması için "sistem_hafizasi/davet_bekleyen" okunuyor.');
  const mevcutDavetSnapshot = await get(ref(database, "sistem_hafizasi/davet_bekleyen"));
  const mevcutDavet = mevcutDavetSnapshot.val();
  if (
    !mevcutDavet ||
    !isimEslesiyorMu(mevcutDavet.isim, davetBekleyen.isim) ||
    davetTakiminiNormallestir(mevcutDavet.takim) !== takim ||
    mevcutDavet.slot !== slot
  ) {
    console.log(`ℹ️ ${davetBekleyen.isim} için bekleyen davet değişmiş veya silinmiş; yanıt uygulanmadı.`);
    return true;
  }

  console.log(`📥 Güncel kadro "${CANLI_KADRO_YOLU}" yolundan okunuyor.`);
  const canliKadroSnapshot = await get(ref(database, CANLI_KADRO_YOLU));
  canliKadroVerisi = canliKadroSnapshot.val();
  if (!canliKadroVerisi || typeof canliKadroVerisi !== "object") {
    console.error(`❌ "${CANLI_KADRO_YOLU}" yolunda güncellenecek kadro bulunamadı.`);
    return true;
  }
  const kadroKatmaniVar = canliKadroVerisi.kadro &&
    typeof canliKadroVerisi.kadro === "object";
  const kadro = kadroKatmaniVar
    ? canliKadroVerisi.kadro
    : canliKadroVerisi;
  console.log(
    `📦 Kadro katmanı: ${kadroKatmaniVar ? "canliKadroVerisi.kadro" : "canliKadroVerisi (kök)"}.`
  );

  if (olumsuzYanit) {
    const yedekler = yedekleriDiziOlarakAl(canliKadroVerisi.yedekler);
    if (
      !yedekler.length ||
      !isimEslesiyorMu(kadroOyuncusununAdi(yedekler[0]), davetBekleyen.isim)
    ) {
      console.log(`ℹ️ ${davetBekleyen.isim} ret yanıtı uygulanmadı: davetli artık yedek listesinin başında değil.`);
      return true;
    }
    const reddeden = yedekler.shift();
    yedekler.push(reddeden);
    const yeniDavetEdilen = yedekler.length > 1
      ? kadroOyuncusununAdi(yedekler[0])
      : null;
    const yeniCanliKadroVerisi = {
      ...canliKadroVerisi,
      yedekler,
    };
    console.log(`💾 Ret sonrası kadro "${CANLI_KADRO_YOLU}" yoluna yazılıyor.`);
    await set(ref(database, CANLI_KADRO_YOLU), yeniCanliKadroVerisi);

    if (yeniDavetEdilen) {
      console.log(`💾 Yeni bekleyen davet ${yeniDavetEdilen}; "sistem_hafizasi/davet_bekleyen" yoluna yazılıyor.`);
      await set(ref(database, "sistem_hafizasi/davet_bekleyen"), {
        ...davetBekleyen,
        isim: yeniDavetEdilen,
        takim,
        slot,
      });
    } else {
      console.log('🗑️ Yedek kalmadığı için "sistem_hafizasi/davet_bekleyen" kaydı siliniyor.');
      await remove(ref(database, "sistem_hafizasi/davet_bekleyen"));
    }

    const redMesaji = yeniDavetEdilen
      ? `⏭️ *${kadroOyuncusununAdi(reddeden) || davetBekleyen.isim}* bu hafta müsait değilmiş.\n\n🎉 *Hey ${yeniDavetEdilen}, sıra sende!* Sahada yerin hazır. Geliyorsan lütfen gruba *+1* veya *gelirim* yaz!`
      : "⚠️ Yedek listesinde davet edilecek başka oyuncu kalmadı.";
    if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return true;
    await client.sendMessage(
      msg.hedefGrupId,
      `${redMesaji}\n\n${guncelKadroMetniOlustur(yeniCanliKadroVerisi)}`
    );
    return true;
  }

  const oyuncuHavuzu = await oyuncuHavuzunuGetir();
  const oyuncu = oyuncuHavuzu.find(
    (aday) => isimEslesiyorMu(aday.isim, davetBekleyen.isim)
  );
  if (!oyuncu) {
    console.error(`❌ Davet edilen oyuncu güncel havuzda bulunamadı: ${davetBekleyen.isim}`);
    return true;
  }

  if (!kadro[takim] || typeof kadro[takim] !== "object") {
    console.error(`❌ Kabul yanıtı uygulanmadı: kadroda "${takim}" takımı bulunamadı.`);
    return true;
  }
  if (kadro[takim][slot]) {
    console.log(`ℹ️ Kabul yanıtı uygulanmadı: ${takim}/${slot} slotu zaten dolu.`);
    return true;
  }

  const yedekler = yedekleriDiziOlarakAl(canliKadroVerisi.yedekler);
  const yedekIndex = yedekler.findIndex((yedek) =>
    (yedek?.id !== undefined && String(yedek.id) === String(oyuncu.id)) ||
    isimEslesiyorMu(kadroOyuncusununAdi(yedek), davetBekleyen.isim)
  );
  if (yedekIndex < 0) {
    console.log(`ℹ️ Kabul yanıtı uygulanmadı: ${davetBekleyen.isim} artık yedek listesinde değil.`);
    return true;
  }
  yedekler.splice(yedekIndex, 1);
  const guncellenmisKadro = {
    ...kadro,
    [takim]: {
      ...kadro[takim],
      [slot]: webArayuzuOyuncusunaDonustur(oyuncu),
    },
  };
  const yeniCanliKadroVerisi = {
    ...canliKadroVerisi,
    ...(kadroKatmaniVar
      ? { kadro: guncellenmisKadro }
      : guncellenmisKadro),
    yedekler,
  };
  console.log(`💾 ${oyuncu.isim}, ${takim}/${slot} konumuna yerleştirilerek "${CANLI_KADRO_YOLU}" yoluna yazılıyor.`);
  await set(ref(database, CANLI_KADRO_YOLU), yeniCanliKadroVerisi);
  console.log('🗑️ Kabul edilen davet "sistem_hafizasi/davet_bekleyen" yolundan siliniyor.');
  await remove(ref(database, "sistem_hafizasi/davet_bekleyen"));

  if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return true;
  await client.sendMessage(
    msg.hedefGrupId,
    `✅ *Kadro Tamamlandı!*\n\n🎉 *${oyuncu.isim}* daveti kabul etti ve takımdaki yerini aldı! Güncel dizilim taktik tahtasına işlendi.\n\n${guncelKadroMetniOlustur(yeniCanliKadroVerisi)}`
  );
  return true;
}

async function artiBirIsle(msg, contact, katilimAyrilmaBilgisi = null, canliKadroVerisi = null) {
  if (katilimAyrilmaBilgisi && !katilimAyrilmaBilgisi.oyuncu) return;
  if (!canliKadroVerisi) {
    console.log("⚠️ Veritabanında aktif bir kadro bulunamadı, önce ANA KADRO listesi gönderilmeli.");
    return;
  }

  let oyuncu = katilimAyrilmaBilgisi?.oyuncu || null;
  if (!oyuncu) {
    const gonderenAdlari = [
      katilimAyrilmaBilgisi?.bulunanIsim,
      contact?.name,
      contact?.pushname,
      !contact?.name && !contact?.pushname ? msg._data?.notifyName : null,
      msg.fromMe ? "Erhan Ersoy" : null,
    ]
      .map(oyuncuAdiAnahtari)
      .filter(Boolean);
    if (gonderenAdlari.length === 0) {
      console.log("ℹ️ Katılma isteği gönderen kişinin rehber veya profil adı bulunamadı.");
      return;
    }

    oyuncu = (await oyuncuHavuzunuGetir()).find((aday) =>
      gonderenAdlari.some((gonderenAdi) =>
        esnekIsimEslesti(gonderenAdi, aday.isim)
      )
    );
    if (!oyuncu) {
      console.log(`ℹ️ Katılma isteği gönderen kişi oyuncu havuzunda bulunamadı: ${gonderenAdlari.join(" / ")}`);
      return;
    }
  }
  let degisiklik = null;
  const kadroNesnesi = canliKadroVerisi.kadro || {};
  const kadro = {
    red: { ...(kadroNesnesi.red || {}) },
    white: { ...(kadroNesnesi.white || {}) },
  };
  const yedekler = yedekleriDiziOlarakAl(canliKadroVerisi.yedekler);
  const anaKadrodaVar = ["red", "white"].some((takim) =>
    Object.values(kadro[takim]).some((kadroOyuncusu) =>
      kadroOyuncusu &&
      ((typeof kadroOyuncusu === "object" && kadroOyuncusu.id !== undefined &&
        String(kadroOyuncusu.id) === String(oyuncu.id)) ||
        isimEslesiyorMu(slotIsminiAl(kadroOyuncusu), oyuncu.isim))
    )
  );
  const yedekteVar = yedekler.some((yedek) =>
    (yedek?.id !== undefined && String(yedek.id) === String(oyuncu.id)) ||
    isimEslesiyorMu(kadroOyuncusununAdi(yedek), oyuncu.isim)
  );
  if (anaKadrodaVar) {
    if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
    await client.sendMessage(msg.hedefGrupId, anaKadrodaZatenVarMesaji(oyuncu.isim));
    return;
  }
  if (yedekteVar) {
    const yedekIndex = yedekler.findIndex((yedek) =>
      (yedek?.id !== undefined && String(yedek.id) === String(oyuncu.id)) ||
      isimEslesiyorMu(kadroOyuncusununAdi(yedek), oyuncu.isim)
    );
    if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
    await client.sendMessage(msg.hedefGrupId, yedekteZatenVarMesaji(oyuncu.isim, yedekIndex + 1));
    return;
  }
  if (!anaKadrodaVar && !yedekteVar) {
    const toplamOyuncu = ["red", "white"].reduce(
      (toplam, takim) => toplam + Object.values(kadro[takim]).filter(Boolean).length,
      0
    );
    let bosYer = null;
    if (toplamOyuncu < 14) {
      for (const takim of ["red", "white"]) {
        const bosSlot = Array.from({ length: 7 }, (_, index) => `pos_${index}`)
          .find((slot) => !kadro[takim][slot]);
        if (bosSlot) {
          bosYer = { takim, slot: bosSlot };
          break;
        }
      }
    }

    if (bosYer) {
      kadro[bosYer.takim][bosYer.slot] = webArayuzuOyuncusunaDonustur(oyuncu);
      degisiklik = { tur: "ana_kadro", isim: oyuncu.isim };
    } else {
      yedekler.push(webArayuzuOyuncusunaDonustur(oyuncu));
      degisiklik = { tur: "yedek", isim: oyuncu.isim, sira: yedekler.length };
    }

    const guncellenmisCanliVeri = webArayuzuCanliKadroVerisi(
      canliKadroVerisi,
      kadro,
      yedekler
    );
    await set(ref(database, CANLI_KADRO_YOLU), guncellenmisCanliVeri);
    degisiklik.canliKadroVerisi = guncellenmisCanliVeri;
  }

  if (!degisiklik) {
    console.log(`ℹ️ Katılma isteği için oyuncu zaten kadroda/yedeklerde veya aktif kadro bulunamadı: ${oyuncu.isim}`);
    return;
  }

  const mesaj = degisiklik.tur === "ana_kadro"
    ? `✅ *${degisiklik.isim}* kadrodaki boş yere eklendi!`
    : yedekSonunaEklendiMesaji(degisiklik.isim, degisiklik.sira);
  if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
  await client.sendMessage(
    msg.hedefGrupId,
    `${mesaj}\n\n${guncelKadroMetniOlustur(degisiklik.canliKadroVerisi)}`
  );
  console.log(`✅ Katılma isteği işlendi: ${degisiklik.isim} (${degisiklik.tur}).`);
  return;
}

async function eksiBirIsle(msg, contact = null, katilimAyrilmaBilgisi = null, canliKadroVerisi = null) {
  if (katilimAyrilmaBilgisi && !katilimAyrilmaBilgisi.oyuncu) return;
  if (!canliKadroVerisi) {
    console.log("⚠️ Veritabanında aktif bir kadro bulunamadı, önce ANA KADRO listesi gönderilmeli.");
    return;
  }

  if (!contact && !katilimAyrilmaBilgisi) {
    contact = await guvenliKisiBilgisiAl(msg);
  }
  let gonderenAdlari = [];
  let oyuncu = katilimAyrilmaBilgisi?.oyuncu || null;
  if (!oyuncu) {
    gonderenAdlari = [
      katilimAyrilmaBilgisi?.bulunanIsim,
      contact?.name,
      contact?.pushname,
      !contact?.name && !contact?.pushname ? msg._data?.notifyName : null,
      msg.fromMe ? "Erhan Ersoy" : null,
    ]
      .map(oyuncuAdiAnahtari)
      .filter(Boolean);
    if (gonderenAdlari.length === 0) {
      console.log("ℹ️ -1 gönderen kişinin rehber veya profil adı bulunamadı.");
      return;
    }

    oyuncu = (await oyuncuHavuzunuGetir()).find((aday) =>
      gonderenAdlari.some((gonderenAdi) =>
        esnekIsimEslesti(gonderenAdi, aday.isim)
      )
    );
    if (!oyuncu) {
      console.log(`ℹ️ -1 gönderen kişi oyuncu havuzunda bulunamadı: ${gonderenAdlari.join(" / ")}`);
      return;
    }
  }
  const kadroNesnesi = canliKadroVerisi.kadro || {};
  const kadro = {
    red: { ...(kadroNesnesi.red || {}) },
    white: { ...(kadroNesnesi.white || {}) },
  };
  const yedekler = yedekleriDiziOlarakAl(canliKadroVerisi.yedekler);
  const yedekIndex = yedekler.findIndex((yedek) =>
    (yedek?.id !== undefined && String(yedek.id) === String(oyuncu.id)) ||
    isimEslesiyorMu(kadroOyuncusununAdi(yedek), oyuncu.isim)
  );
  if (yedekIndex >= 0) {
    yedekler.splice(yedekIndex, 1);
    const guncellenmisCanliVeri = webArayuzuCanliKadroVerisi(
      canliKadroVerisi,
      kadro,
      yedekler
    );
    await set(ref(database, CANLI_KADRO_YOLU), guncellenmisCanliVeri);
    if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
    await client.sendMessage(
      msg.hedefGrupId,
      `👋 *${oyuncu.isim}* yedek listesinden kaydını sildim, bilgin için teşekkürler. Haftaya sahalarda görüşmek üzere!\n\n${guncelKadroMetniOlustur(guncellenmisCanliVeri)}`
    );
    return;
  }
  let cikanOyuncu = null;
  let takim = null;
  let slot = null;

  for (const takimAdi of ["red", "white"]) {
    const eslesme = derinKadrodaEslesmeBul(
      { [takimAdi]: kadro[takimAdi] },
      gonderenAdlari.concat(oyuncu.isim)
    );
    if (eslesme) {
      takim = takimAdi;
      slot = eslesme.slot;
      cikanOyuncu = eslesme.slotDegeri;
      break;
    }
  }

  if (!takim) {
    if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
    await client.sendMessage(
      msg.hedefGrupId,
      `🤔 *${oyuncu.isim}* listeye baktım ama adın zaten ne kadroda ne de yedeklerde var. Kafan rahat olsun, bu hafta izindesin! 🏖️`
    );
    console.log(`ℹ️ -1 gönderen oyuncu aktif kadroda veya yedeklerde bulunamadı: ${oyuncu.isim}`);
    return;
  }

  kadro[takim][slot] = null;
  yedekler.push(oyuncu);
  const ilkYedek = yedekler[0];
  const davetEdilenIsim = kadroOyuncusununAdi(ilkYedek);

  const guncellenmisCanliVeri = webArayuzuCanliKadroVerisi(
    canliKadroVerisi,
    kadro,
    yedekler
  );
  await set(ref(database, CANLI_KADRO_YOLU), guncellenmisCanliVeri);
  await set(ref(database, "sistem_hafizasi/davet_bekleyen"), davetEdilenIsim
    ? { isim: davetEdilenIsim, takim, slot }
    : null);

  const degisiklik = {
    cikanIsim: kadroOyuncusununAdi(cikanOyuncu) || oyuncu.isim,
    davetEdilenIsim,
    takim,
    slot,
  };
  if (!degisiklik.davetEdilenIsim) return;

  const mesaj = `🚨 *Kadroda Değişiklik Var!*

❌ *${degisiklik.cikanIsim}* bu hafta aramızda olamayacak ve yedek listesinin sonuna eklendi.

🎉 *Hey ${degisiklik.davetEdilenIsim}, sana yer açıldı!* Bu fırsatı kaçırmak istemezsin, sahada yerin hazır. Geliyorsan lütfen gruba *+1* veya *gelirim* yaz!\n\n${guncelKadroMetniOlustur(guncellenmisCanliVeri)}`;
  if (!msg.hedefGrupId || (!msg.hedefGrupId.includes("@g.us") && !msg.hedefGrupId.includes("@lid"))) return;
  await client.sendMessage(msg.hedefGrupId, mesaj);
  console.log(
    `✅ ${degisiklik.cikanIsim} kadrodan çıkarıldı; ${degisiklik.davetEdilenIsim} davet edildi (${degisiklik.takim}, ${degisiklik.slot}).`
  );
  return;
}


client.on("message_create", mesajıIsle);

client.on("auth_failure", async (msg) => {
  whatsappAuthenticated = false;
  whatsappReady = false;
  if (readyWatchdogTimer) {
    clearTimeout(readyWatchdogTimer);
    readyWatchdogTimer = null;
  }
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
  whatsappReady = false;
  if (readyWatchdogTimer) {
    clearTimeout(readyWatchdogTimer);
    readyWatchdogTimer = null;
  }
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

async function firebaseErisimiVarMi() {
  try {
    const baglantiSnapshot = await get(ref(database, ".info/connected"));
    if (baglantiSnapshot.val() !== true) return false;

    await get(ref(database, CANLI_KADRO_YOLU));
    return true;
  } catch (error) {
    console.warn("⚠️ Firebase erişimi henüz hazır değil:", error);
    return false;
  }
}

function oncekiTarayiciSurecleriniTemizle() {
  if (process.platform !== "win32") return;

  const profilYolu = WHATSAPP_PROFIL_YOLU.replace(/'/g, "''");
  const powershellKomutu = [
    "$ErrorActionPreference = 'Stop'",
    `$profilePath = '${profilYolu}'`,
    "$processes = Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($profilePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }",
    "foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop; Wait-Process -Id $process.ProcessId -Timeout 5 -ErrorAction SilentlyContinue }",
  ].join("; ");

  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", powershellKomutu], {
    stdio: "ignore",
  });
}

function tarayiciKilitleriniTemizle() {
  for (const kilitDosyasi of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    fs.rmSync(path.join(WHATSAPP_PROFIL_YOLU, kilitDosyasi), { force: true });
  }
}

async function botuBaslat() {
  while (!whatsappAuthenticated) {
    if (!(await firebaseErisimiVarMi())) {
      console.log("⏳ İnternet/Firebase bağlantısı bekleniyor; 5 saniye sonra yeniden denenecek...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    try {
      console.log("⏳ 1. Firebase QR temizleniyor...");
      await canliQrKodunuTemizle();
      console.log("⏳ 2. Firebase durum güncelleniyor...");
      await botDurumunuKaydet("DISCONNECTED");
      oncekiTarayiciSurecleriniTemizle();
      tarayiciKilitleriniTemizle();
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

const server = app.listen(PORT, () => {
  console.log(`Render port köprüsü aktif: ${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("⚠️ Bot zaten arka planda çalışıyor, ikinci kopya kapatılıyor.");
    process.exit(0);
  }

  console.error("❌ Bot sunucusu başlatılamadı:", error);
  process.exit(1);
});

botuBaslat();
