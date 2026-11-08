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
const { Client, LocalAuth } = require("whatsapp-web.js");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, get, set } = require("firebase/database");

const app = express();
const PORT = process.env.PORT || 3000;
let currentQrCode = "";

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
  authStrategy: new LocalAuth({ dataPath: "./whatsapp-session" }),
  puppeteer: {
    headless: "new",
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    protocolTimeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-extensions",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--headless",
      "--disable-software-rasterizer",
    ],
  },
});

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>WhatsApp QR</title>
      <style>
        body {
          margin: 0;
          background: #111827;
          color: white;
          font-family: Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .card {
          background: #1f2937;
          padding: 24px;
          border-radius: 18px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
          text-align: center;
          width: min(90vw, 420px);
        }
        h1 {
          margin-top: 0;
          font-size: 22px;
        }
        .qr-box {
          background: white;
          padding: 18px;
          border-radius: 12px;
          display: inline-block;
          margin-top: 14px;
        }
        img {
          display: block;
          width: 220px;
          height: 220px;
        }
        p {
          color: #d1d5db;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>WhatsApp QR Kodu</h1>
        <p>Telefonunuzdan bu QR kodunu taratın.</p>
        <div class="qr-box">
          ${currentQrCode ? `<img src="data:image/png;base64,${currentQrCode}" alt="WhatsApp QR" />` : `<p>QR kod bekleniyor...</p>`}
        </div>
      </div>
    </body>
    </html>
  `);
});

client.on("qr", (qr) => {
  currentQrCode = qr;
  console.log("QR kod üretildi. Telefonunuzdan taratın:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp bot hazır. Grup mesajları dinleniyor...");
});

app.listen(PORT, () => {
  console.log(`🌐 QR sayfası http://localhost:${PORT} adresinde çalışıyor.`);
});

async function mesajıIsle(msg) {
  const body = typeof msg.body === "string" ? msg.body : "";
  console.log("📩 Arka Plan Tetiklendi! Gönderen ID:", msg.from, "| İçerik Boyutu:", body.length);
  if (msg.fromMe && body.includes("Akıllı Kadro Dağıtımı")) return;

  const izinliGonderenMi = msg.from === "61027207114891@lid";
  if (!izinliGonderenMi || !body.toLocaleUpperCase("tr-TR").includes("ANA KADRO")) return;

  console.log("🎯 İzinli kadro mesajı alındı ->", msg.from);

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

    console.log(
      "✅ Canlı kadro Firebase'e kaydedildi:\n",
      JSON.stringify(firebaseKadro, null, 2)
    );
    try {
      await msg.reply(yanitMetni);
      console.log("🚀 Akıllı kadro mesajı WhatsApp grubuna başarıyla fırlatıldı!");
    } catch (error) {
      console.error("❌ WhatsApp mesajı gönderilirken hata oluştu:", error);
    }
  } catch (error) {
    console.error("❌ Mesaj işleme hatası:", error);
  }
}

client.on("message", mesajıIsle);
client.on("message_create", mesajıIsle);

client.on("auth_failure", (msg) => {
  console.error("❌ WhatsApp kimlik doğrulama hatası:", msg);
});

client.on("disconnected", (reason) => {
  console.log("⚠️ WhatsApp bağlantısı koptu:", reason);
});

client.initialize();
