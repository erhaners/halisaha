console.log("🚀 DOSYA OKUNDU: app.js başarıyla tetiklendi!");
// ==========================================
// 🛠️ FIREBASE BAĞLANTI AYARLARI
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCreidC1Ybdx_s7663HGnuYhqUBNwmAEXU",
    authDomain: "halisaha-taktik.firebaseapp.com",
    databaseURL: "https://halisaha-taktik-default-rtdb.firebaseio.com/", // Konsolda "Realtime Database" oluşturduğunda bu URL netleşecek, genelde bu formatta olur.
    projectId: "halisaha-taktik",
    storageBucket: "halisaha-taktik.firebasestorage.app",
    messagingSenderId: "682186454054",
    appId: "1:682186454054:web:27f9299909557daea2e7"
};

// Küresel değişkenlerimiz
let database;
let oyuncular = [];
let duzenlenenId = null;
let manuelKadro = { red: {}, white: {} };

// 🎯 GARANTİLİ BAŞLATICI: window.onload yerine tarayıcının yerleşik dinleyicisini kullanıyoruz
// Bu sayede hiçbir şekilde başka bir kodla çakışmaz ve HTML hazır olduğu an kesin çalışır.
document.addEventListener("DOMContentLoaded", () => {
    console.log("📌 Sayfa tamamen yüklendi, Firebase dinleyicisi başlatılıyor...");
    
    try {
        // Firebase'i güvenli modda başlatıyoruz
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("🔥 2. Adım: Firebase başarıyla initialize edildi.");
        }
        database = firebase.database();
        
        // Veritabanını dinlemeye başla
        veriTabaniniDinle();
        
        // Mod fonksiyonunu çağır
        modDegisti();
        
    } catch (hata) {
        console.error("❌ Firebase başlatılırken KRİTİK HATA oluştu:", hata);
    }
});

// 🎯 Veri dinleme fonksiyonu (Geliştirilmiş log takibi ile)
function veriTabaniniDinle() {
    console.log("🛰️ 3. Adım: Veri tabanına köprü kuruluyor, 'oyuncular' düğümü dinleniyor...");
    
    database.ref("oyuncular").on("value", (snapshot) => {
        console.log("📥 4. Adım: Firebase'den bir veri sinyali geldi!");
        const data = snapshot.val();
        console.log("📊 Gelen veri içeriği:", data);
        
        oyuncular = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                oyuncular.push({
                    id: key,
                    isim: data[key].isim,
                    anaMevki: data[key].anaMevki,
                    kl: data[key].kl,
                    def: data[key].def,
                    ort: data[key].ort,
                    huc: data[key].huc
                });
            });
        }
        
        console.log("✅ 5. Adım: Oyuncu dizisi güncellendi, arayüz çiziliyor. Toplam oyuncu:", oyuncular.length);
        listeyiYenile();
    }, (error) => {
        console.error("❌ Firebase okuma izni hatası (Kurallar engelliyor olabilir):", error);
    });
}

window.onload = function() {
    modDegisti();
};

function modDegisti() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const header = document.getElementById("listHeader");
    if (mod === "6v6") {
        header.innerText = "Oyuncu Havuzu (Maç için 12 kişi seçin)";
    } else {
        header.innerText = "Oyuncu Havuzu (Maç için 14 kişi seçin)";
    }
    // Mod değiştiğinde manuel seçimleri sıfırlayalım ki harita kaymasın
    manuelKadro = { red: {}, white: {} };
    listeyiYenile();
}

// ✏️ Oyuncu Ekleme VE Düzenleme Ortak Fonksiyonu
function oyuncuEkle() {
    let isim = document.getElementById("playerName").value.trim();
    const anaMevki = document.getElementById("playerRole").value;
    const kl = parseInt(document.getElementById("skillKL").value) || 50;
    const def = parseInt(document.getElementById("skillDEF").value) || 50;
    const ort = parseInt(document.getElementById("skillORT").value) || 50;
    const huc = parseInt(document.getElementById("skillHUC").value) || 50;

    if (!isim) {
        alert("Lütfen oyuncu adı girin!");
        return;
    }

    // 🎯 ÇÖZÜM 4: Oyuncu ismini otomatik olarak Türkçe büyük harfe çeviriyoruz
    isim = isim.toLocaleUpperCase('tr-TR');

    if (duzenlenenId !== null) {
        database.ref("oyuncular/" + duzenlenenId).set({
            isim, anaMevki, kl, def, ort, huc
        });
        duzenlenenId = null;
        const btn = document.querySelector("button[onclick='oyuncuEkle()']");
        if (btn) btn.innerText = "Oyuncu Ekle";
    } else {
        database.ref("oyuncular").push({
            isim, anaMevki, kl, def, ort, huc
        });
    }

    document.getElementById("playerName").value = "";
}

// ✏️ Düzenleme Modunu Tetikleyen Fonksiyon
function oyuncuDuzenleFormDoldur(id) {
    const oyuncu = oyuncular.find(o => o.id === id);
    if (!oyuncu) return;

    // Bilgileri input alanlarına geri dolduruyoruz
    document.getElementById("playerName").value = oyuncu.isim;
    document.getElementById("playerRole").value = oyuncu.anaMevki;
    document.getElementById("skillKL").value = oyuncu.kl;
    document.getElementById("skillDEF").value = oyuncu.def;
    document.getElementById("skillORT").value = oyuncu.ort;
    document.getElementById("skillHUC").value = oyuncu.huc;

    // Küresel id'yi kaydet ve ekleme butonunun metnini değiştir
    duzenlenenId = id;
    const btn = document.querySelector("button[onclick='oyuncuEkle()']");
    if (btn) btn.innerText = "Değişiklikleri Kaydet";
    
    // Sayfayı hafifçe yukarı kaydır ki kullanıcı formu net görsün
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function oyuncuSil(id) {
    const onay = confirm("Bu oyuncuyu listeden tamamen silmek istediğinize emin misiniz?");
    if (onay) {
        // Firebase'den tek satırda silme işlemi
        database.ref("oyuncular/" + id).remove();
        
        if (duzenlenenId === id) {
            duzenlenenId = null;
            const btn = document.querySelector("button[onclick='oyuncuEkle()']");
            if (btn) btn.innerText = "Oyuncu Ekle";
        }
    }
}

function listeyiYenile() {
    const listeDiv = document.getElementById("playerList");
    listeDiv.innerHTML = "";

    oyuncular.forEach(o => {
        listeDiv.innerHTML += `
            <div class="player-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div class="player-item-left">
                    <input type="checkbox" checked value="${o.id}" class="player-checkbox">
                    <span><strong>${o.isim}</strong> (${o.anaMevki})</span>
                </div>
                <div class="player-item-right" style="display: flex; align-items: center; gap: 10px;">
                    <div class="skill-badges">
                        <span style="color:#ffcc00">KL:${o.kl}</span>
                        <span style="color:#5995ff">DF:${o.def}</span>
                        <span style="color:#55ff55">OS:${o.ort}</span>
                        <span style="color:#ff5555">HC:${o.huc}</span>
                    </div>
                    <button onclick="oyuncuDuzenleFormDoldur('${o.id}')" style="background: none; border: none; color: #ffcc00; cursor: pointer; font-size: 16px; padding: 0 2px;" title="Oyuncuyu Düzenle">✏️</button>
                    <button onclick="oyuncuSil('${o.id}')" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 16px; padding: 0 2px;" title="Oyuncuyu Sil">🗑️</button>
                </div>
            </div>
        `;
    });
}

function genelPuanHesapla(puanObj) {
    if (!puanObj) return 50; // Koruma amaçlı varsayılan değer

    // Gelen değerlerin sayısal olduğundan emin oluyoruz
    const kl = parseInt(puanObj.kl) || 50;
    const def = parseInt(puanObj.def) || 50;
    const ort = parseInt(puanObj.ort) || 50;
    const huc = parseInt(puanObj.huc) || 50;

    // Oyuncunun ana mevkisi "KL" (Kaleci) ise
    if (puanObj.anaMevki === "KL") {
        // 🧤 Kaleciler için sadece Kalecilik ve Defans ortalaması
        return Math.round(kl);
    } else {
        // 🏃 Diğer oyuncular için Kalecilik HARİÇ (Defans, Orta Saha, Hücum) ortalaması
        return Math.round((def + ort + huc) / 3);
    }
}

function takimiPozisyonlandir(takim, mod) {
    let kalanlar = [...takim];
    let kadro = { KL: null, DEF: [], ORT: [], HUC: [] };

    kalanlar.sort((a, b) => b.kl - a.kl);
    kadro.KL = kalanlar.shift();

    kalanlar.sort((a, b) => b.huc - a.huc);
    kadro.HUC.push(kalanlar.shift());

    kalanlar.sort((a, b) => b.def - a.def);
    if (mod === "6v6") {
        kadro.DEF.push(kalanlar.shift(), kalanlar.shift());
    } else {
        kadro.DEF.push(kalanlar.shift(), kalanlar.shift(), kalanlar.shift());
    }

    kadro.ORT = kalanlar;
    return kadro;
}

// 📋 Yeni: Boş Sahayı Manuel Seçim İçin Hazırlayan Fonksiyon
function manuelKadroBaslat() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    
    // Boş kadro şablonu oluşturuyoruz
    const bosKadroRed = { KL: null, DEF: mod === "6v6" ? [null, null] : [null, null, null], ORT: [null, null], HUC: [null] };
    const bosKadroWhite = { KL: null, DEF: mod === "6v6" ? [null, null] : [null, null, null], ORT: [null, null], HUC: [null] };
    
    sahayaDiz(bosKadroRed, "redTeamPitch", "red", mod, true);
    sahayaDiz(bosKadroWhite, "whiteTeamPitch", "white", mod, true);
}

// 🔄 Güncellenmiş Sahaya Dizme Fonksiyonu (Manuel Seçim Desteği Eklendi)
function sahayaDiz(kadro, sahaId, takimRenk, mod, isManuel = false) {
    const sahaDiv = document.getElementById(sahaId);
    if (!sahaDiv) {
        console.warn("⚠️ Saha elementi henüz HTML'de bulunamadı. Çizim erteleniyor...");
        return;
    }
    sahaDiv.innerHTML = "";

    let konumlar = [];
    const genelGen = (puanObj) => genelPuanHesapla(puanObj);

    if (takimRenk === "red") {
        // ==========================================
        // KIRMIZI TAKIM (ÜST YARI) KOORDİNATLARI
        // ==========================================
        
        konumlar.push({ id: "pos_0", x: 50, y: 2, s: "gk-jersey red-gk", p: isManuel ? (manuelKadro.red["pos_0"] || null) : kadro.KL }); // Kaleci
        
        if (mod === "6v6") { 
            // 6v6 Modunda Kırmızı Oyuncular
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_1"] || null) : kadro.DEF[0] }); // Sol Bek
            konumlar.push({ id: "pos_2", x: 80, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_2"] || null) : kadro.DEF[1] }); // Sağ Bek
            konumlar.push({ id: "pos_3", x: 32, y: 52, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_3"] || null) : kadro.ORT[0] }); // Sol Orta Saha
            konumlar.push({ id: "pos_4", x: 68, y: 52, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_4"] || null) : kadro.ORT[1] }); // Sağ Orta Saha
        } else { 
            // 7v7 Modunda Kırmızı Oyuncular
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_1"] || null) : kadro.DEF[0] }); // Sol Bek
            konumlar.push({ id: "pos_2", x: 50, y: 24, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_2"] || null) : kadro.DEF[1] }); // Stoper
            konumlar.push({ id: "pos_3", x: 80, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_3"] || null) : kadro.DEF[2] }); // Sağ Bek
            konumlar.push({ id: "pos_4", x: 32, y: 52, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_4"] || null) : kadro.ORT[0] }); // Sol Orta Saha
            konumlar.push({ id: "pos_5", x: 68, y: 52, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_5"] || null) : kadro.ORT[1] }); // Sağ Orta Saha
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 72, s: "red-jersey", p: isManuel ? (manuelKadro.red[fvtId] || null) : kadro.HUC[0] }); // Forvet
    
    } else {
        // ==========================================
        // BEYAZ TAKIM (ALT YARI) KOORDİNATLARI
        // ==========================================
        
        konumlar.push({ id: "pos_0", x: 50, y: 81, s: "gk-jersey", p: isManuel ? (manuelKadro.white["pos_0"] || null) : kadro.KL }); // Kaleci
        
        if (mod === "6v6") { 
            // 6v6 Modunda Beyaz Oyuncular
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_1"] || null) : kadro.DEF[0] }); // Sol Bek
            konumlar.push({ id: "pos_2", x: 80, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_2"] || null) : kadro.DEF[1] }); // Sağ Bek
            konumlar.push({ id: "pos_3", x: 32, y: 30, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_3"] || null) : kadro.ORT[0] }); // Sol Orta Saha
            konumlar.push({ id: "pos_4", x: 68, y: 30, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_4"] || null) : kadro.ORT[1] }); // Sağ Orta Saha
        } else { 
            // 7v7 Modunda Beyaz Oyuncular
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_1"] || null) : kadro.DEF[0] }); // Sol Bek
            konumlar.push({ id: "pos_2", x: 50, y: 58, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_2"] || null) : kadro.DEF[1] }); // Stoper
            konumlar.push({ id: "pos_3", x: 80, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_3"] || null) : kadro.DEF[2] }); // Sağ Bek
            konumlar.push({ id: "pos_4", x: 32, y: 30, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_4"] || null) : kadro.ORT[0] }); // Sol Orta Saha
            konumlar.push({ id: "pos_5", x: 68, y: 30, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_5"] || null) : kadro.ORT[1] }); // Sağ Orta Saha
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 10, s: "white-jersey", p: isManuel ? (manuelKadro.white[fvtId] || null) : kadro.HUC[0] }); // Forvet
    }

    // Arayüze Elemanları Basma Döngüsü
    konumlar.forEach(k => {
        const cardClass = takimRenk === "red" ? "player-card red-card" : "player-card white-card";
        
        if (k.p) {
            // 🎯 GÜNCELLENDİ: Formaya tıklandığında oyuncuyu o pozisyondan kaldıran onclick eklendi
            sahaDiv.innerHTML += `
                <div class="${cardClass}" style="left: ${k.x}%; top: ${k.y}%; cursor: pointer;" onclick="manuelOyuncuKaldır('${takimRenk}', '${k.id}', '${mod}')" title="Oyuncuyu kaldırmak için tıklayın">
                    <div class="shirt-container ${k.s}">
                        <div class="shirt-sleeve-left"></div>
                        <div class="shirt-main">${genelGen(k.p)}</div>
                        <div class="shirt-sleeve-right"></div>
                    </div>
                    <div class="player-name">${k.p.isim}</div>
                </div>
            `;
        } else {
            // Hem kırmızı hem beyaz takıma atanmış TÜM oyuncuların id'lerini güvenli şekilde topluyoruz
            const atananRedIdler = Object.values(manuelKadro.red).filter(o => o !== null).map(o => String(o.id));
            const atananWhiteIdler = Object.values(manuelKadro.white).filter(o => o !== null).map(o => String(o.id));
            const kesinlikleSeciliIdler = [...atananRedIdler, ...atananWhiteIdler];

            // Havuzdaki oyunculardan halihazırda sahada olanları tamamen eliyoruz
            const kullanilabilirOyuncular = oyuncular.filter(o => !kesinlikleSeciliIdler.includes(String(o.id)));

            sahaDiv.innerHTML += `
                <div class="${cardClass}" style="left: ${k.x}%; top: ${k.y}%; z-index: 20;">
                    <select onchange="manuelOyuncuSec(this, '${takimRenk}', '${k.id}', '${sahaId}', '${mod}')" style="width: 140px; font-size: 11px; background: #1e1e1e; color: white; border: 1px solid #555; border-radius: 4px; padding: 2px; cursor: pointer;">
                        <option value="">Seç...</option>
                        ${kullanilabilirOyuncular.map(o => `<option value="${o.id}">${o.isim} (${o.anaMevki})</option>`).join("")}
                    </select>
                </div>
            `;
        }
    });
}

// 🤝 Yeni: Manuel Olarak Açılır Kutudan Oyuncu Seçildiğinde Tetiklenen Fonksiyon
function manuelOyuncuSec(selectElement, takimRenk, posId, sahaId, mod) {
    const secilenId = selectElement.value;
    
    if (!secilenId) {
        delete manuelKadro[takimRenk][posId];
    } else {
        const oyuncu = oyuncular.find(o => o.id == secilenId);
        manuelKadro[takimRenk][posId] = oyuncu;
    }

    // 🎯 ÇÖZÜM: Bir oyuncu seçildiğinde her iki takımın sahasını da yeniden çiziyoruz
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
}

// 🔄 Yeni: Formaya tıklandığında oyuncuyu pozisyondan silip açılır kutuyu geri getiren fonksiyon
function manuelOyuncuKaldır(takimRenk, posId, mod) {
    // Sadece manuel kadro modundaysak bu tıklama çalışsın
    // (Otomatik kadro kurulduğunda yanlışlıkla tıklayıp bozmamak için koruma)
    if (Object.keys(manuelKadro.red).length === 0 && Object.keys(manuelKadro.white).length === 0) {
        // Eğer her iki hafıza da tamamen boşsa, muhtemelen otomatik kadrodur, işlem yapma.
        // Ama eğer manuel başlattıysan hafıza nesneleri dolmaya başlar. 
    }

    // Seçilen pozisyondaki oyuncuyu hafızadan siliyoruz
    delete manuelKadro[takimRenk][posId];

    // Her iki sahayı da yeniden çizerek açılır kutuyu geri getiriyoruz
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
}

// ==========================================
// 🤖 ORİJİNAL YAPIDA OTOMATİK DENGELİ TAKIM KURMA
// ==========================================
// ==========================================
// 🤖 ORİJİNAL YAPIDA OTOMATİK DENGELİ TAKIM KURMA (SİLİNME KORUMALI)
// ==========================================
function takimlariKur() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const gerekenOyuncu = mod === "6v6" ? 12 : 14;
 
    const checkboxes = document.querySelectorAll(".player-checkbox");
    let seciliOyuncular = [];
 
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const oyuncu = oyuncular.find(o => o.id == cb.value);
            if (oyuncu) seciliOyuncular.push(oyuncu);
        }
    });
 
    if (seciliOyuncular.length !== gerekenOyuncu) {
        alert(`Şu an ${seciliOyuncular.length} oyuncu seçili. Seçtiğiniz moda göre tam olarak ${gerekenOyuncu} oyuncu seçmelisiniz!`);
        return;
    }
 
    // 🎯 YENİ GÜÇ HESAPLAMA KURALI
    const yeniGenelPuanHesapla = (o) => {
        const kl = parseInt(o.kl) || 50;
        const def = parseInt(o.def) || 50;
        const ort = parseInt(o.ort) || 50;
        const huc = parseInt(o.huc) || 50;
        
        if (o.anaMevki === "KL") {
            return kl;
        } else {
            return Math.round((def + ort + huc) / 3);
        }
    };

    seciliOyuncular.sort((a, b) => yeniGenelPuanHesapla(b) - yeniGenelPuanHesapla(a));
 
    let takimA = [];
    let takimB = [];
    let güçA = 0;
    let güçB = 0;
 
    seciliOyuncular.forEach((o, index) => {
        const p = yeniGenelPuanHesapla(o);
        if (index % 2 === 0) {
            if (güçA <= güçB) { takimA.push(o); güçA += p; }
            else { takimB.push(o); güçB += p; }
        } else {
            if (güçB <= güçA) { takimB.push(o); güçB += p; }
            else { takimA.push(o); güçA += p; }
        }
    });
 
    const diziliA = takimiPozisyonlandir(takimA, mod);
    const diziliB = takimiPozisyonlandir(takimB, mod);

    // ==========================================================
    // 🧠 ADAPTİF DÖNÜŞTÜRÜCÜ: Otomatik Kadroyu Manuel Kadroya Eşitleme
    // ==========================================================
    manuelKadro = { red: {}, white: {} };

    // Kırmızı Takımı (DiziliA) pos_0, pos_1 formatına çeviriyoruz
    manuelKadro.red["pos_0"] = diziliA.KL || null;
    manuelKadro.red["pos_1"] = diziliA.DEF[0] || null;
    manuelKadro.red["pos_2"] = diziliA.DEF[1] || null;
    if (mod === "6v6") {
        manuelKadro.red["pos_3"] = diziliA.ORT[0] || null;
        manuelKadro.red["pos_4"] = diziliA.ORT[1] || null;
        manuelKadro.red["pos_5"] = diziliA.HUC[0] || null;
    } else {
        manuelKadro.red["pos_3"] = diziliA.DEF[2] || null;
        manuelKadro.red["pos_4"] = diziliA.ORT[0] || null;
        manuelKadro.red["pos_5"] = diziliA.ORT[1] || null;
        manuelKadro.red["pos_6"] = diziliA.HUC[0] || null;
    }

    // Beyaz Takımı (DiziliB) pos_0, pos_1 formatına çeviriyoruz
    manuelKadro.white["pos_0"] = diziliB.KL || null;
    manuelKadro.white["pos_1"] = diziliB.DEF[0] || null;
    manuelKadro.white["pos_2"] = diziliB.DEF[1] || null;
    if (mod === "6v6") {
        manuelKadro.white["pos_3"] = diziliB.ORT[0] || null;
        manuelKadro.white["pos_4"] = diziliB.ORT[1] || null;
        manuelKadro.white["pos_5"] = diziliB.HUC[0] || null;
    } else {
        manuelKadro.white["pos_3"] = diziliB.DEF[2] || null;
        manuelKadro.white["pos_4"] = diziliB.ORT[0] || null;
        manuelKadro.white["pos_5"] = diziliB.ORT[1] || null;
        manuelKadro.white["pos_6"] = diziliB.HUC[0] || null;
    }
    // ==========================================================
 
    // 🎯 Çizimi doğrudan MANUEL mod tetikleyicisiyle (true) başlatıyoruz ki köprü baştan kurulsun!
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
    
    console.log("🚀 Otomatik kadro başarıyla kuruldu ve düzenlenebilir korumalı moda senkronize edildi!");
}

// ==========================================
// ✏️ SARI BUTON İÇİN: MANUEL KADRO BAŞLATICISI
// ==========================================
function manuelKadroButonTetikle() {
    console.log("✏️ Manuel kadro kurulum modu başlatılıyor...");
    
    // Projenin orijinal hafıza nesnelerini temizliyoruz
    manuelKadro = { red: {}, white: {} };
    
    // Orijinal boş sahayı oluşturma fonksiyonunu çağırıyoruz
    if (typeof manuelKadroBaslat === "function") {
        manuelKadroBaslat();
        console.log("🟢 Boş saha seçici kutularla birlikte başarıyla hazırlandı.");
    } else {
        console.error("❌ Projede manuelKadroBaslat fonksiyonu bulunamadı!");
    }
}