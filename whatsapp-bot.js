const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { initializeApp, getApps } = require("firebase/app");
const { getDatabase, ref, set } = require("firebase/database");

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
    .replace(/^(?:[-*•\d\s\.\)]|\d+\.)+/, "")
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

function isimListesiniAyikla(mesaj) {
  const lines = String(mesaj || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { anaKadro: [], yedekKadro: [] };

  const anaKadro = [];
  const yedekKadro = [];
  let aktifListe = null;

  for (const line of lines) {
    const duzMetin = line.trim();
    const lower = duzMetin.toLowerCase();

    if (lower.includes("ana kadro")) {
      aktifListe = "ana";
      continue;
    }

    if (lower.includes("yedek listesi")) {
      aktifListe = "yedek";
      continue;
    }

    if (!duzMetin || duzMetin.length < 2) continue;

    const temizIsim = temizleIsim(duzMetin);
    if (!temizIsim) continue;

    if (aktifListe === "ana") {
      if (!anaKadro.includes(temizIsim)) anaKadro.push(temizIsim);
    } else if (aktifListe === "yedek") {
      if (!yedekKadro.includes(temizIsim)) yedekKadro.push(temizIsim);
    }
  }

  return { anaKadro, yedekKadro };
}

async function aktifKadroyuFirebaseeYaz(anaKadro, yedekKadro) {
  try {
    await set(ref(database, "aktif_kadro/ana_kadro"), anaKadro);
    await set(ref(database, "aktif_kadro/yedek_kadro"), yedekKadro);
    console.log("✅ Firebase güncellendi:", { anaKadro, yedekKadro });
  } catch (error) {
    console.error("❌ Firebase yazma hatası:", error);
  }
}

const IZIN_VERILEN_GRUP_ADI = "Has kadro Perşembe 21:00-22:00";

function izinliMesajMi(msg) {
  const grupAdi = msg && msg.chat && msg.chat.name ? String(msg.chat.name).trim() : "";
  const metin = String(msg && msg.body ? msg.body : "");

  return (
    grupAdi === IZIN_VERILEN_GRUP_ADI &&
    metin.toLowerCase().includes("ana kadro") &&
    metin.toLowerCase().includes("yedek listesi")
  );
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./whatsapp-session" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

client.on("message", async (msg) => {
  if (msg.fromMe) return;
  if (!izinliMesajMi(msg)) return;

  const metin = msg.body || "";

  try {
    const { anaKadro, yedekKadro } = isimListesiniAyikla(metin);

    if (anaKadro.length === 0 && yedekKadro.length === 0) {
      console.log("ℹ️ Ana kadro / yedek listesi bulundu ama isim çözümlenemedi.");
      return;
    }

    await aktifKadroyuFirebaseeYaz(anaKadro, yedekKadro);
  } catch (error) {
    console.error("❌ Mesaj işleme hatası:", error);
  }
});

client.on("auth_failure", (msg) => {
  console.error("❌ WhatsApp kimlik doğrulama hatası:", msg);
});

client.on("disconnected", (reason) => {
  console.log("⚠️ WhatsApp bağlantısı koptu:", reason);
});

client.initialize();
