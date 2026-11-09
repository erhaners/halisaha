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
const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set, remove } = require("firebase/database");

const app = express();
const PORT = process.env.PORT || 10000;
const isRender =
  process.env.PORT !== undefined ||
  process.env.RENDER === "true" ||
  process.platform === "linux";

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
const mongoStore = new MongoStore({ mongoose });

async function botDurumunuKaydet(durum) {
  await set(ref(database, "sistem_hafizasi/bot_durum"), durum);
}

async function canliQrKodunuTemizle() {
  await Promise.all([
    remove(ref(database, "sistem_hafizasi/canli_qr")),
    remove(ref(database, "sistem_hafizasi/canli_qr_gorsel")),
  ]);
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

function genelPuanHesapla(oyuncu) {
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

  switch (mevkiKodunuNormallestir(oyuncu.anaMevki)) {
    case "KL":
      return kl;
    case "DEF":
      return Math.round((def * 0.50) + (hiz * 0.20) + (pas * 0.20) + (ort * 0.10));
    case "FOR":
      return Math.round((forPuani * 0.50) + (sut * 0.25) + (hiz * 0.15) + (pas * 0.10));
    case "ORT":
    default:
      return Math.round((ort * 0.40) + (pas * 0.30) + (hiz * 0.15) + (sut * 0.15));
  }
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
    DEFANS: "DEF",
    "ORTA SAHA": "ORT",
    HUC: "FOR",
    HÜCUM: "FOR",
  };
  return mevkiKodlari[kod] || kod;
}

function takimi3_2_1Diz(takim) {
  const kalanOyuncular = [...takim];
  const kadro = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [`pos_${index}`, null])
  );
  const slotlar = [
    { pozisyon: "KL", idler: ["pos_0"] },
    { pozisyon: "DEF", idler: ["pos_1", "pos_2", "pos_3"] },
    { pozisyon: "ORT", idler: ["pos_4", "pos_5"] },
    { pozisyon: "FOR", idler: ["pos_6"] },
  ];

  const oyuncuSec = (pozisyon, alternatifMi = false) => {
    const index = kalanOyuncular.findIndex((oyuncu) => {
      const oyuncuMevkisi = alternatifMi
        ? oyuncu.alternatifMevki || oyuncu.alternatifPosition
        : oyuncu.anaMevki;
      return mevkiKodunuNormallestir(oyuncuMevkisi) === pozisyon;
    });
    return index < 0 ? null : kalanOyuncular.splice(index, 1)[0];
  };

  for (const { pozisyon, idler } of slotlar) {
    for (const id of idler) {
      kadro[id] = oyuncuSec(pozisyon);
    }
    for (const id of idler) {
      if (!kadro[id]) kadro[id] = oyuncuSec(pozisyon, true);
    }
  }

  for (const { idler } of slotlar) {
    for (const id of idler) {
      if (!kadro[id] && kalanOyuncular.length > 0) {
        kadro[id] = kalanOyuncular.shift();
      }
    }
  }

  return kadro;
}

async function akllliTakimlariKur(gelenIsimler, oyuncuHavuzu) {
  console.log("Ayıklanan İsimler:", gelenIsimler);
  const anaKadro = (gelenIsimler || []).filter(Boolean).slice(0, 14);

  const mod = "7v7";
  const takimBoyutu = 7;

  const oyuncuListesi = anaKadro.map((isim, index) => {
    const bulunanOyuncu = oyuncuyuHavuzdaBul(isim, oyuncuHavuzu);
    if (bulunanOyuncu) return bulunanOyuncu;

    return {
      ...VARSAYILAN_OYUNCU,
      id: `whatsapp-${index}-${isimAnahtari(isim)}`,
      isim,
    };
  });

  const takimlar = { red: [], white: [] };
  const esnekOyuncular = [];

  oyuncuListesi.forEach((oyuncu) => {
    const anaTakim = isimAnahtari(oyuncu.anaTakim);
    if (anaTakim === "KIRMIZI" && takimlar.red.length < takimBoyutu) {
      takimlar.red.push(oyuncu);
    } else if (anaTakim === "BEYAZ" && takimlar.white.length < takimBoyutu) {
      takimlar.white.push(oyuncu);
    } else {
      esnekOyuncular.push(oyuncu);
    }
  });

  esnekOyuncular.forEach((oyuncu) => {
    const redGucu = takimlar.red.reduce((toplam, kisi) => toplam + genelPuanHesapla(kisi), 0);
    const whiteGucu = takimlar.white.reduce((toplam, kisi) => toplam + genelPuanHesapla(kisi), 0);

    if (takimlar.red.length >= takimBoyutu) {
      takimlar.white.push(oyuncu);
    } else if (takimlar.white.length >= takimBoyutu) {
      takimlar.red.push(oyuncu);
    } else if (takimlar.red.length < takimlar.white.length) {
      takimlar.red.push(oyuncu);
    } else if (takimlar.white.length < takimlar.red.length) {
      takimlar.white.push(oyuncu);
    } else if (redGucu <= whiteGucu) {
      takimlar.red.push(oyuncu);
    } else {
      takimlar.white.push(oyuncu);
    }
  });

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
  authStrategy: new RemoteAuth({
    clientId: "halisaha-bot",
    dataPath: process.cwd(),
    store: mongoStore,
    backupSyncIntervalMs: 600000,
  }),
  puppeteer: {
    headless: isRender ? true : "new",
    executablePath: isRender
      ? null
      : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
      '--js-flags="--max-old-space-size=150"', // Chrome'un RAM kullanımını 150MB ile sınırlandırır
    ],
  },
});

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
  console.log("✅ WhatsApp kimlik doğrulandı; kalıcı MongoDB oturum yedeği bağlantı hazır olunca alınacak.");
});

client.on("remote_session_saved", () => {
  console.log("🎉 Oturum yedeği MongoDB Atlas veritabanına başarıyla kilitlendi!");
});

client.on("ready", async () => {
  try {
    await canliQrKodunuTemizle();
    await botDurumunuKaydet("CONNECTED");
  } catch (error) {
    console.error("❌ Bot bağlantı durumu Firebase'e yazılamadı:", error);
  }
  console.log("✅ WhatsApp bot hazır. Grup mesajları dinleniyor...");
});

async function mesajıIsle(msg) {
  console.log(`📡 [YENİ MESAJ GELDİ] -> msg.from: "${msg?.from}" | Gövde: "${String(msg?.body || "").substring(0, 15)}..."`);

  if (!msg || !msg.from || msg.from.includes('broadcast')) return;

  const body = typeof msg.body === "string" ? msg.body : "";
  if (!body.trim()) return;

  if (msg.fromMe && (body.includes("Akıllı Kadro Dağıtımı") || body.includes("KIRMIZI TAKIM"))) return;

  const izinVerilenGrupIDs = ["120363415017155084@g.us", "120363162701833@lid", "132628606922999@lid"];
  if (!izinVerilenGrupIDs.includes(msg.from)) return;

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

    const takimMesaji = (takimKadro) => Object.values(takimKadro)
      .filter(Boolean)
      .map((oyuncu, index) =>
        `${index + 1}. ${oyuncu.isim || oyuncu} (${oyuncu.anaMevki || VARSAYILAN_OYUNCU.anaMevki})`
      )
      .join("\n");
    const yedekMesaji = yedekler
      .map((oyuncu) => `• ${oyuncu.isim} (${oyuncu.anaMevki})`)
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
      await msg.reply(yanitMetni);
      console.log("🚀 Dağıtım yanıtı gruba başarıyla gönderildi!");
    } catch (error) {
      console.error("❌ WhatsApp yanıtı gönderilirken hata oluştu:", error);
    }
  } catch (error) {
    console.error("❌ Kadro işleme adımlarında hata oluştu:", error);
  }
}


client.on("message", mesajıIsle);
client.on("message_create", mesajıIsle);

client.on("auth_failure", async (msg) => {
  console.error("❌ WhatsApp kimlik doğrulama hatası:", msg);
  await canliQrKodunuTemizle().catch((error) => {
    console.error("❌ Eski QR kodu Firebase'den temizlenemedi:", error);
  });
  await mongoStore.delete({ session: "RemoteAuth-halisaha-bot" }).catch((error) => {
    console.error("❌ Geçersiz WhatsApp oturumu MongoDB'den silinemedi:", error);
  });
  await botDurumunuKaydet("DISCONNECTED").catch((error) => {
    console.error("❌ Bot durumu Firebase'e yazılamadı:", error);
  });
});

let reconnectTimer = null;
let reconnectInProgress = false;

function yenidenBaglanmayiPlanla() {
  if (reconnectTimer || reconnectInProgress) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnectInProgress = true;
    let retryNeeded = false;

    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ MongoDB Atlas bağlantısı yeniden kuruldu.");
      }

      await client.destroy();
      await client.initialize();
      console.log("🔄 WhatsApp istemcisi yeniden başlatıldı.");
    } catch (error) {
      retryNeeded = true;
      console.error("❌ BULUTTA BAŞLATMA HATASI:", error);
      console.error("❌ WhatsApp yeniden başlatılamadı:", error);
      await botDurumunuKaydet("DISCONNECTED").catch((durumHatasi) => {
        console.error("❌ Bot durumu Firebase'e yazılamadı:", durumHatasi);
      });
    } finally {
      reconnectInProgress = false;
      if (retryNeeded) yenidenBaglanmayiPlanla();
    }
  }, 5000);
}

client.on("disconnected", async (reason) => {
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
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI ortam değişkeni tanımlı değil; WhatsApp botu başlatılmadı.");
    await botDurumunuKaydet("DISCONNECTED").catch((error) => {
      console.error("❌ Bot durumu Firebase'e yazılamadı:", error);
    });
    process.exitCode = 1;
    return;
  }

  while (true) {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB Atlas bağlantısı kuruldu.");
      }
      await canliQrKodunuTemizle();
      await botDurumunuKaydet("DISCONNECTED");
      await client.initialize();
      return;
    } catch (error) {
      console.error("❌ BULUTTA BAŞLATMA HATASI:", error);
      console.error("❌ WhatsApp bot başlatılamadı; 5 saniye sonra yeniden denenecek:", error);
      await botDurumunuKaydet("DISCONNECTED").catch((durumHatasi) => {
        console.error("❌ Bot durumu Firebase'e yazılamadı:", durumHatasi);
      });
      await client.destroy().catch((temizlemeHatasi) => {
        console.error("❌ WhatsApp istemcisi yeniden başlatma öncesi kapatılamadı:", temizlemeHatasi);
      });
      await mongoose.disconnect().catch((mongoHatasi) => {
        console.error("❌ MongoDB bağlantısı kapatılamadı:", mongoHatasi);
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
