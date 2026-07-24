console.log("🚀 DOSYA OKUNDU: Geliştirilmiş app.js başarıyla tetiklendi!");

// ==========================================
// 🛠️ FIREBASE BAĞLANTI AYARLARI
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCreidC1Ybdx_s7663HGnuYhqUBNwmAEXU",
    authDomain: "halisaha-taktik.firebaseapp.com",
    databaseURL: "https://halisaha-taktik-default-rtdb.firebaseio.com/", 
    projectId: "halisaha-taktik",
    storageBucket: "halisaha-taktik.firebasestorage.app",
    messagingSenderId: "682186454054",
    appId: "1:682186454054:web:27f9299909557daea2e7"
};

// ==========================================
// 🔒 GÜVENLİK VE YÖNETİCİ AYARLARI
// ==========================================
const YONETICI_SIFRESI = "12";

// Küresel değişkenlerimiz
let database;
let oyuncular = [];
let duzenlenenId = null;
let manuelKadro = { red: {}, white: {} };

document.addEventListener("DOMContentLoaded", () => {
    console.log("📌 Sayfa tamamen yüklendi, Firebase dinleyicisi başlatılıyor...");
    
    ArayüzElemanlariniHazirla();

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("🔥 Firebase başarıyla initialize edildi.");
        }
        database = firebase.database();
        
        veriTabaniniDinle();
        modDegisti();
        
    } catch (hata) {
        console.error("❌ Firebase başlatılırken KRİTİK HATA oluştu:", hata);
    }

    // 💾 Sayfa Açılışında Hafızadan Yükleme Kontrolü (DOMContentLoaded İçine Alındı)
    const kayitliKadro = localStorage.getItem('sonKurulanKadro');
    const kayitliMod = localStorage.getItem('sonMatchMode');

    if (kayitliKadro) {
        try {
            manuelKadro = JSON.parse(kayitliKadro);
            const mod = kayitliMod || document.querySelector('input[name="matchMode"]:checked').value;
            
            // Kayıtlı kadroyu sahaya bas
            sahayaDiz(null, "redTeamPitch", "red", mod, true);
            sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
            
            console.log("💾 Son kurulan kadro hafızadan başarıyla yüklendi.");
        } catch (e) {
            console.error("Kayıtlı kadro okunurken hata oluştu:", e);
            localStorage.removeItem('sonKurulanKadro');
            localStorage.removeItem('sonMatchMode');
        }
    }
});

function ArayüzElemanlariniHazirla() {
    const listHeader = document.getElementById("listHeader");
    if (listHeader && !document.getElementById("btnTumunuKaldir")) {
        const btnDiv = document.createElement("div");
        btnDiv.style.margin = "8px 0";
        btnDiv.innerHTML = `
            <button id="btnTumunuKaldir" onclick="tumSecimleriDegistir(false)" style="background: #ff5555; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 5px;">Tümünü Kaldır</button>
            <button id="btnTumunuSec" onclick="tumSecimleriDegistir(true)" style="background: #55ff55; color: #111; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Tümünü Seç</button>
        `;
        listHeader.parentNode.insertBefore(btnDiv, listHeader.nextSibling);
    }

    if (!document.getElementById("macKayitPaneli")) {
        const anaContainer = document.querySelector(".container") || document.body;
        const kayitDiv = document.createElement("div");
        kayitDiv.id = "macKayitPaneli";
        kayitDiv.style.cssText = "background: #1e1e1e; border: 1px solid #333; padding: 15px; margin-top: 20px; border-radius: 8px; color: white;";
        kayitDiv.innerHTML = `
            <h3>⚽ Maç Sonucu ve Skor Kayıt Paneli</h3>
            <div style="display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap;">
                <label>Kırmızı Skor: <input type="number" id="skorRed" value="0" style="width: 50px; background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <label>Beyaz Skor: <input type="number" id="skorWhite" value="0" style="width: 50px; background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <label>Maç Tarihi: <input type="date" id="macTarihi" style="background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <button onclick="macSkorunuKaydet()" style="background: #ffcc00; color: #111; border:none; padding:5px 15px; font-weight:bold; border-radius:4px; cursor:pointer;">Maçı Geçmişe Kaydet</button>
            </div>
            <div id="macGecmisiListesi" style="margin-top: 10px; max-height: 150px; overflow-y: auto; font-size: 13px; color: #bbb;"></div>
        `;
        anaContainer.appendChild(kayitDiv);
        
        document.getElementById("macTarihi").valueAsDate = new Date();
    }
}

function veriTabaniniDinle() {
    database.ref("oyuncular").on("value", (snapshot) => {
        const data = snapshot.val();
        
        const seciliHafiza = {};
        document.querySelectorAll(".player-checkbox").forEach(cb => {
            seciliHafiza[cb.value] = cb.checked;
        });
        const ilkYuklemeMi = Object.keys(seciliHafiza).length === 0;

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
            oyuncular.sort((a, b) => a.isim.localeCompare(b.isim, 'tr', { sensitivity: 'base' }));
        }
        
        listeyiYenile(seciliHafiza, ilkYuklemeMi);
        macGecmisiniDinle();
    });
}

function modDegisti() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const header = document.getElementById("listHeader");
    if (header) {
        header.innerText = mod === "6v6" ? "Oyuncu Havuzu (Maç için 12 kişi seçin)" : "Oyuncu Havuzu (Maç için 14 kişi seçin)";
    }
    
    // Mod değiştiğinde yeni tertibat için hafızayı sıfırlıyoruz
    localStorage.removeItem('sonKurulanKadro');
    localStorage.removeItem('sonMatchMode');
    manuelKadro = { red: {}, white: {} };
    listeyiYenile({}, true);
}

function tumSecimleriDegistir(durum) {
    document.querySelectorAll(".player-checkbox").forEach(cb => {
        cb.checked = durum;
    });
}

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

function oyuncuDuzenleFormDoldur(id) {
    const oyuncu = oyuncular.find(o => o.id === id);
    if (!oyuncu) return;

    document.getElementById("playerName").value = oyuncu.isim;
    document.getElementById("playerRole").value = oyuncu.anaMevki;
    document.getElementById("skillKL").value = oyuncu.kl;
    document.getElementById("skillDEF").value = oyuncu.def;
    document.getElementById("skillORT").value = oyuncu.ort;
    document.getElementById("skillHUC").value = oyuncu.huc;

    duzenlenenId = id;
    const btn = document.querySelector("button[onclick='oyuncuEkle()']");
    if (btn) btn.innerText = "Değişiklikleri Kaydet";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function oyuncuSil(id) {
    const sifre = prompt("Güvenlik Doğrulaması: Lütfen silme işlemi için yönetici şifresini girin:");
    if (sifre === null) return; 
    if (sifre !== YONETICI_SIFRESI) {
        alert("❌ Hatalı Şifre! Yetkiniz olmadan oyuncu silemezsiniz.");
        return;
    }

    const onay = confirm("Bu oyuncuyu listeden tamamen silmek istediğinize emin misiniz?");
    if (onay) {
        database.ref("oyuncular/" + id).remove();
        if (duzenlenenId === id) {
            duzenlenenId = null;
            const btn = document.querySelector("button[onclick='oyuncuEkle()']");
            if (btn) btn.innerText = "Oyuncu Ekle";
        }
    }
}

function listeyiYenile(seciliHafiza = {}, ilkYuklemeMi = false) {
    const listeDiv = document.getElementById("playerList");
    if (!listeDiv) return;
    listeDiv.innerHTML = "";

    oyuncular.forEach(o => {
        const isChecked = ilkYuklemeMi ? true : (seciliHafiza[o.id] !== undefined ? seciliHafiza[o.id] : true);

        listeDiv.innerHTML += `
            <div class="player-item" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 5px; margin-bottom: 4px; border-bottom: 1px solid #2a2a2a;">
                <div class="player-item-left" style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" ${isChecked ? "checked" : ""} value="${o.id}" class="player-checkbox" style="margin: 0; cursor: pointer; transform: scale(0.9);">
                    <span style="font-size: 13px; line-height: 1;"><strong>${o.isim}</strong> <span style="color:#888; font-size:11px;">(${o.anaMevki})</span></span>
                </div>
                <div class="player-item-right" style="display: flex; align-items: center; gap: 10px;">
                    <div class="skill-badges" style="display: flex; gap: 3px; align-items: center;">
                        <span style="color:#ffcc00; font-size:11px; padding: 1px 4px; background: #222; border-radius:3px; font-weight:bold;">KL:${o.kl}</span>
                        <span style="color:#5995ff; font-size:11px; padding: 1px 4px; background: #222; border-radius:3px; font-weight:bold;">DF:${o.def}</span>
                        <span style="color:#55ff55; font-size:11px; padding: 1px 4px; background: #222; border-radius:3px; font-weight:bold;">OS:${o.ort}</span>
                        <span style="color:#ff5555; font-size:11px; padding: 1px 4px; background: #222; border-radius:3px; font-weight:bold;">HC:${o.huc}</span>
                    </div>
                    <button onclick="oyuncuDuzenleFormDoldur('${o.id}')" style="background: none; border: none; color: #ffcc00; cursor: pointer; font-size: 13px; display: flex; align-items: center; padding: 0;" title="Düzenle">✏️</button>
                    <button onclick="oyuncuSil('${o.id}')" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 13px; display: flex; align-items: center; padding: 0;" title="Sil">🗑️</button>
                </div>
            </div>
        `;
    });
}

function genelPuanHesapla(puanObj) {
    if (!puanObj) return 50;
    const kl = parseInt(puanObj.kl) || 50;
    const def = parseInt(puanObj.def) || 50;
    const ort = parseInt(puanObj.ort) || 50;
    const huc = parseInt(puanObj.huc) || 50;

    if (puanObj.anaMevki === "KL") {
        return Math.round(kl);
    } else {
        return Math.round((def + ort + huc) / 3);
    }
}

function takimiPozisyonlandir(takim, mod) {
    let kadro = { KL: null, DEF: [], ORT: [], HUC: [] };
    
    let kaleciler = takim.filter(o => o.anaMevki === "KL").sort((a, b) => b.kl - a.kl);
    let secilenKaleci = kaleciler.length > 0 ? kaleciler[0] : [...takim].sort((a, b) => b.kl - a.kl)[0];
    kadro.KL = secilenKaleci;
    
    let kalanlar = takim.filter(o => o.id !== secilenKaleci.id);

    let forvetler = kalanlar.filter(o => o.anaMevki === "HUC").sort((a, b) => b.huc - a.huc);
    let secilenForvet = forvetler.length > 0 ? forvetler[0] : [...kalanlar].sort((a, b) => b.huc - a.huc)[0];
    kadro.HUC.push(secilenForvet);
    kalanlar = kalanlar.filter(o => o.id !== secilenForvet.id);

    let gerekenDefansSayisi = mod === "6v6" ? 2 : 3;
    let defansAdaylari = kalanlar.filter(o => o.anaMevki === "DEF").sort((a, b) => b.def - a.def);
    
    while (defansAdaylari.length < gerekenDefansSayisi && kalanlar.length > 0) {
        let ekAday = kalanlar.filter(o => !defansAdaylari.includes(o)).sort((a, b) => b.def - a.def)[0];
        if(ekAday) defansAdaylari.push(ekAday);
        else break;
    }
    
    defansAdaylari.sort((a, b) => b.def - a.def);
    let stoper = defansAdaylari.shift(); 
    
    if (mod === "6v6") {
        kadro.DEF.push(stoper, defansAdaylari[0]);
    } else {
        kadro.DEF.push(defansAdaylari[0], stoper, defansAdaylari[1]);
    }
    
    let secilenDefIdleri = kadro.DEF.map(d => d ? d.id : null);
    kalanlar = kalanlar.filter(o => !secilenDefIdleri.includes(o.id));

    kalanlar.sort((a, b) => b.ort - a.ort);
    let ortMevkililer = kalanlar.filter(o => o.anaMevki === "ORT");
    let gobekOyuncusu = ortMevkililer.length > 0 ? ortMevkililer[0] : kalanlar[0];

    if (gobekOyuncusu) {
        let digerleri = kalanlar.filter(o => o.id !== gobekOyuncusu.id);
        kadro.ORT = [gobekOyuncusu, ...digerleri];
    } else {
        kadro.ORT = kalanlar;
    }

    return kadro;
}

function manuelKadroBaslat() {
    // Manuel boş başlatırken hafızayı sıfırla
    localStorage.removeItem('sonKurulanKadro');
    localStorage.removeItem('sonMatchMode');
    
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const bosKadroRed = { KL: null, DEF: mod === "6v6" ? [null, null] : [null, null, null], ORT: [null, null], HUC: [null] };
    const bosKadroWhite = { KL: null, DEF: mod === "6v6" ? [null, null] : [null, null, null], ORT: [null, null], HUC: [null] };
    
    sahayaDiz(bosKadroRed, "redTeamPitch", "red", mod, true);
    sahayaDiz(bosKadroWhite, "whiteTeamPitch", "white", mod, true);
}

function sahayaDiz(kadro, sahaId, takimRenk, mod, isManuel = false) {
    const sahaDiv = document.getElementById(sahaId);
    if (!sahaDiv) return;
    sahaDiv.innerHTML = "";

    sahaDiv.style.marginTop = "0px";

    let konumlar = [];
    const genelGen = (puanObj) => genelPuanHesapla(puanObj);

    if (takimRenk === "red") {
        konumlar.push({ id: "pos_0", x: 50, y: 0, s: "gk-jersey red-gk", p: isManuel ? (manuelKadro.red["pos_0"] || null) : kadro.KL });
        if (mod === "6v6") { 
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_1"] || null) : kadro.DEF[0] }); 
            konumlar.push({ id: "pos_2", x: 80, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_2"] || null) : kadro.DEF[1] }); 
            konumlar.push({ id: "pos_3", x: 32, y: 54, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_3"] || null) : kadro.ORT[0] }); 
            konumlar.push({ id: "pos_4", x: 68, y: 54, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_4"] || null) : kadro.ORT[1] });
        } else { 
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_1"] || null) : kadro.DEF[0] }); 
            konumlar.push({ id: "pos_2", x: 50, y: 22, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_2"] || null) : kadro.DEF[1] }); 
            konumlar.push({ id: "pos_3", x: 80, y: 32, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_3"] || null) : kadro.DEF[2] }); 
            konumlar.push({ id: "pos_4", x: 32, y: 54, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_4"] || null) : kadro.ORT[0] }); 
            konumlar.push({ id: "pos_5", x: 68, y: 54, s: "red-jersey", p: isManuel ? (manuelKadro.red["pos_5"] || null) : kadro.ORT[1] });
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 75, s: "red-jersey", p: isManuel ? (manuelKadro.red[fvtId] || null) : kadro.HUC[0] });
    
    } else {
        konumlar.push({ id: "pos_0", x: 50, y: 82, s: "gk-jersey", p: isManuel ? (manuelKadro.white["pos_0"] || null) : kadro.KL });
        if (mod === "6v6") { 
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_1"] || null) : kadro.DEF[0] }); 
            konumlar.push({ id: "pos_2", x: 80, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_2"] || null) : kadro.DEF[1] }); 
            konumlar.push({ id: "pos_3", x: 32, y: 28, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_3"] || null) : kadro.ORT[0] }); 
            konumlar.push({ id: "pos_4", x: 68, y: 28, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_4"] || null) : kadro.ORT[1] });
        } else { 
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_1"] || null) : kadro.DEF[0] }); 
            konumlar.push({ id: "pos_2", x: 50, y: 58, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_2"] || null) : kadro.DEF[1] }); 
            konumlar.push({ id: "pos_3", x: 80, y: 50, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_3"] || null) : kadro.DEF[2] }); 
            konumlar.push({ id: "pos_4", x: 32, y: 28, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_4"] || null) : kadro.ORT[0] }); 
            konumlar.push({ id: "pos_5", x: 68, y: 28, s: "white-jersey", p: isManuel ? (manuelKadro.white["pos_5"] || null) : kadro.ORT[1] });
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 7, s: "white-jersey", p: isManuel ? (manuelKadro.white[fvtId] || null) : kadro.HUC[0] });
    }

    const atananRedIdler = Object.values(manuelKadro.red).filter(o => o !== null).map(o => String(o.id));
    const atananWhiteIdler = Object.values(manuelKadro.white).filter(o => o !== null).map(o => String(o.id));
    const kesinlikleSeciliIdler = [...atananRedIdler, ...atananWhiteIdler];
    const kullanilabilirOyuncular = oyuncular.filter(o => !kesinlikleSeciliIdler.includes(String(o.id)));
    kullanilabilirOyuncular.sort((a, b) => a.isim.localeCompare(b.isim, 'tr'));

    let takimToplamGucu = 0;

    konumlar.forEach(k => {
        const cardClass = takimRenk === "red" ? "player-card red-card" : "player-card white-card";
        if (k.p) {
            takimToplamGucu += genelGen(k.p);
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

    GucEtiketiniGuncelle(takimRenk, takimToplamGucu);
}

function GucEtiketiniGuncelle(renk, guc) {
    let etiketId = renk === "red" ? "redTeamPowerLabel" : "whiteTeamPowerLabel";
    let etiket = document.getElementById(etiketId);
    
    let hedefKonteynir = document.querySelector(".pitch-container") || document.querySelector(".tactics-board");
    
    if (!etiket && hedefKonteynir) {
        etiket = document.createElement("div");
        etiket.id = etiketId;
        etiket.style.cssText = "padding: 8px 12px; background: #252529; border-radius: 8px; display: block; margin: 6px auto; width: 92%; border: 1px solid #333; box-shadow: 0 2px 5px rgba(0,0,0,0.4);";
        hedefKonteynir.parentNode.insertBefore(etiket, hedefKonteynir);
    }
    
    if (etiket) {
        const maksGuc = 500;
        let yuzde = Math.min((guc / maksGuc) * 100, 100);
        
        let barRengi = renk === "red" ? "#ff4d4d" : "#ffffff";
        let metinRengi = renk === "red" ? "#ff4d4d" : "#ffffff";
        let takimAdi = renk === "red" ? "🔴 Kırmızı Takım" : "⚪ Beyaz Takım";
        let icYaziRengi = renk === "red" ? "#ffffff" : "#111111";

        etiket.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: bold; color: ${metinRengi};">
                <span>${takimAdi}</span>
                <span>${guc} / ${maksGuc} Puan</span>
            </div>
            <div style="width: 100%; background: #1a1a1e; height: 16px; border-radius: 4px; overflow: hidden; border: 1px solid #444; position: relative;">
                <div style="width: ${yuzde}%; background: ${barRengi}; height: 100%; transition: width 0.4s ease-out; display: flex; align-items: center; justify-content: flex-end; padding-right: 5px; box-sizing: border-box;">
                    ${yuzde > 12 ? `<span style="color: ${icYaziRengi}; font-size: 10px; font-weight: bold;">%${Math.round(yuzde)}</span>` : ''}
                </div>
            </div>
        `;
    }
}

function manuelOyuncuSec(selectElement, takimRenk, posId, sahaId, mod) {
    const secilenId = selectElement.value;
    if (!secilenId) {
        delete manuelKadro[takimRenk][posId];
    } else {
        const oyuncu = oyuncular.find(o => o.id == secilenId);
        manuelKadro[takimRenk][posId] = oyuncu;
    }
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);

    // Her manuel seçimde hafızayı güncelle
    localStorage.setItem('sonKurulanKadro', JSON.stringify(manuelKadro));
    localStorage.setItem('sonMatchMode', mod);
}

function manuelOyuncuKaldır(takimRenk, posId, mod) {
    delete manuelKadro[takimRenk][posId];
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);

    // Oyuncu kaldırıldığında hafızayı güncelle
    localStorage.setItem('sonKurulanKadro', JSON.stringify(manuelKadro));
    localStorage.setItem('sonMatchMode', mod);
}

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
 
    const yeniGenelPuanHesapla = (o) => genelPuanHesapla(o);
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

    manuelKadro = { red: {}, white: {} };

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
 
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);

    // 💾 Otomatik kurulduğunda hafızaya kaydet
    localStorage.setItem('sonKurulanKadro', JSON.stringify(manuelKadro));
    localStorage.setItem('sonMatchMode', mod);
}

function manuelKadroButonTetikle() {
    localStorage.removeItem('sonKurulanKadro');
    localStorage.removeItem('sonMatchMode');
    
    manuelKadro = { red: {}, white: {} };
    if (typeof manuelKadroBaslat === "function") {
        manuelKadroBaslat();
    }
}

function macSkorunuKaydet() {
    const sifre = prompt("Güvenlik Doğrulaması: Skor kaydetmek için lütfen yönetici şifresini girin:");
    if (sifre === null) return;
    if (sifre !== YONETICI_SIFRESI) {
        alert("❌ Hatalı Şifre!");
        return;
    }

    const skorR = document.getElementById("skorRed").value;
    const skorW = document.getElementById("skorWhite").value;
    const tarih = document.getElementById("macTarihi").value;

    if (!tarih) {
        alert("Lütfen geçerli bir maç tarihi seçin!");
        return;
    }

    const kirmiziKadro = Object.values(manuelKadro.red).filter(o => o !== null).map(o => o.isim).join(", ");
    const beyazKadro = Object.values(manuelKadro.white).filter(o => o !== null).map(o => o.isim).join(", ");

    if(!kirmiziKadro || !beyazKadro) {
        alert("Geçmişe kaydetmeden önce sahada kurulmuş bir kadro bulunmalıdır!");
        return;
    }

    database.ref("mac_gecmisi").push({
        tarih: tarih,
        skorKirmizi: skorR,
        skorBeyaz: skorW,
        kirmiziKadro: kirmiziKadro,
        beyazKadro: beyazKadro
    }).then(() => {
        alert("✅ Maç sonucu başarıyla geçmişe kaydedildi!");
    });
}

let gecmisAcikMi = false;

function macGecmisiniDinle() {
    database.ref("mac_gecmisi").on("value", (snapshot) => {
        const data = snapshot.val();
        const listeDiv = document.getElementById("macGecmisiListesi");
        if (!listeDiv) return;
        listeDiv.innerHTML = "";

        if (data) {
            const maclar = [];
            Object.keys(data).forEach(key => {
                maclar.push({ id: key, ...data[key] });
            });
            maclar.sort((a, b) => b.tarih.localeCompare(a.tarih));

            const sonMac = maclar[0];
            let htmlIcerik = `
                <div style="background: #252529; border-left: 4px solid #ffcc00; padding: 8px; margin-bottom: 10px; border-radius: 4px;">
                    <span style="color: #ffcc00; font-weight: bold; font-size: 11px;">🔥 EN SON MAÇ SONUCU</span><br>
                    <strong>📅 ${sonMac.tarih}</strong> | <span style="color:#ff5555">Kırmızı ${sonMac.skorKirmizi}</span> - <span style="color:#fff">Beyaz ${sonMac.skorBeyaz}</span>
                    <br><small style="color:#aaa">🔴 Kırmızı: ${sonMac.kirmiziKadro}</small>
                    <br><small style="color:#aaa">⚪ Beyaz: ${sonMac.beyazKadro}</small>
                </div>
            `;

            if (maclar.length > 1) {
                htmlIcerik += `
                    <button id="btnGecmisiTogle" onclick="gecmisPaneliniTogle()" style="width: 100%; background: #333; color: #fff; border: 1px solid #444; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; margin-bottom: 10px; transition: 0.2s;">
                        ${gecmisAcikMi ? "▲ Geçmiş Maçları Gizle" : `▼ Eski Maçları Göster (${maclar.length - 1} Maç)`}
                    </button>
                    <div id="eskiMaclarKutusu" style="display: ${gecmisAcikMi ? "block" : "none"}; max-height: 200px; overflow-y: auto; padding-right: 5px;">
                `;

                for (let i = 1; i < maclar.length; i++) {
                    const m = maclar[i];
                    htmlIcerik += `
                        <div style="border-bottom: 1px solid #2a2a2a; padding: 6px 0; margin-bottom: 5px; font-size: 12px; color: #999;">
                            <strong>📅 ${m.tarih}</strong> | <span style="color:#ef4444">Kırmızı ${m.skorKirmizi}</span> - <span style="color:#ccc">Beyaz ${m.skorBeyaz}</span>
                            <br><small style="color:#666">🔴 Kadro: ${m.kirmiziKadro}</small>
                            <br><small style="color:#666">⚪ Kadro: ${m.beyazKadro}</small>
                        </div>
                    `;
                }

                htmlIcerik += `</div>`;
            }

            listeDiv.innerHTML = htmlIcerik;

        } else {
            listeDiv.innerHTML = "Henüz kaydedilmiş bir maç geçmişi bulunmuyor.";
        }
    });
}

function gecmisPaneliniTogle() {
    gecmisAcikMi = !gecmisAcikMi;
    const kutu = document.getElementById("eskiMaclarKutusu");
    const buton = document.getElementById("btnGecmisiTogle");
    
    if (kutu && buton) {
        if (gecmisAcikMi) {
            kutu.style.display = "block";
            buton.innerText = "▲ Geçmiş Maçları Gizle";
            buton.style.background = "#444";
        } else {
            kutu.style.display = "none";
            const eskiMacSayisi = kutu.children.length;
            buton.innerText = `▼ Eski Maçları Göster (${eskiMacSayisi} Maç)`;
            buton.style.background = "#333";
        }
    }
}

const GIZLI_KIRMIZI_TAKIM = [
    "VOLKAN ÇAKAR", 
    "ATAKAN SARIOĞLU", 
    "CANER UÇAL", 
    "EMİN YILDIRIMTAŞ", 
    "BORA ATALIK",  
    "KAAN GÜLLÜ",    
    "ALİ TONBUL"
];

const GIZLI_BEYAZ_TAKIM = [
    "UTKU GÜNDOĞAN",
    "FURKAN ÖZDEMİR", 
    "YİĞİT ESENDEMİR", 
    "SELAMİ DOĞAN", 
    "ZEKERİYA KOŞAR",
    "BERK AKYÜZ", 
    "ERHAN ERSOY"
];

const ANA_KADRO_LISTESI = [...GIZLI_KIRMIZI_TAKIM, ...GIZLI_BEYAZ_TAKIM];

function gelistiriciModunuAc() {
    const token = prompt("UYARI: API v2.4 Sunucu Senkronizasyon Anahtarı (Token) Giriniz:");
    
    if (token === YONETICI_SIFRESI) { 
        const mod = document.querySelector('input[name="matchMode"]:checked').value;

        const oyuncuNesnesiBul = (isim) => {
            return oyuncular.find(o => o && o.isim && o.isim.toLocaleUpperCase('tr-TR').trim() === isim.toLocaleUpperCase('tr-TR').trim());
        };

        manuelKadro = { red: {}, white: {} };

        // KIRMIZI TAKIM
        manuelKadro.red["pos_0"] = oyuncuNesnesiBul("VOLKAN ÇAKAR");
        manuelKadro.red["pos_1"] = oyuncuNesnesiBul("CANER UÇAL");
        manuelKadro.red["pos_2"] = oyuncuNesnesiBul("EMİN YILDIRIMTAŞ");
        manuelKadro.red["pos_3"] = oyuncuNesnesiBul("ATAKAN SARIOĞLU");
        manuelKadro.red["pos_4"] = oyuncuNesnesiBul("KAAN GÜLLÜ");
        manuelKadro.red["pos_5"] = oyuncuNesnesiBul("BORA ATALIK");
        manuelKadro.red["pos_6"] = oyuncuNesnesiBul("ALİ TONBUL");

        // BEYAZ TAKIM
        manuelKadro.white["pos_0"] = oyuncuNesnesiBul("UTKU GÜNDOĞAN");
        manuelKadro.white["pos_1"] = oyuncuNesnesiBul("FURKAN ÖZDEMİR");
        manuelKadro.white["pos_2"] = oyuncuNesnesiBul("SELAMİ DOĞAN");
        manuelKadro.white["pos_3"] = oyuncuNesnesiBul("YİĞİT ESENDEMİR");
        manuelKadro.white["pos_4"] = oyuncuNesnesiBul("BERK AKYÜZ");
        manuelKadro.white["pos_5"] = oyuncuNesnesiBul("ZEKERİYA KOŞAR");
        manuelKadro.white["pos_6"] = oyuncuNesnesiBul("ERHAN ERSOY");

        sahayaDiz(null, "redTeamPitch", "red", mod, true);
        sahayaDiz(null, "whiteTeamPitch", "white", mod, true);

        // 💾 Geliştirici modu ile kurulan kadroyu kalıcı hafızaya kaydet
        localStorage.setItem('sonKurulanKadro', JSON.stringify(manuelKadro));
        localStorage.setItem('sonMatchMode', mod);

    } else if (token !== null) {
        alert("Hata: Geçersiz kimlik doğrulama jetonu (Invalid Token). Sunucu bağlantısı reddedildi.");
    }
}