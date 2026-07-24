console.log("🚀 DOSYA OKUNDU: Eski Maçlar Butonlu Listeye Çevrildi ve Kadrolar Güncellendi!");

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

const YONETICI_SIFRESI = "12";

let database;
let oyuncular = [];
let duzenlenenId = null;
let manuelKadro = { red: {}, white: {} };
let ilkKadroYuklendiMi = false;

document.addEventListener("DOMContentLoaded", () => {
    console.log("📌 Sayfa yüklendi, arayüz ve Firebase başlatılıyor...");
    
    ArayüzElemanlariniHazirla();

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        database = firebase.database();
        
        veriTabaniniDinle();
        canliKadroDinleyicisiniBaslat(); 
        modDegisti();
        
    } catch (hata) {
        console.error("❌ Firebase başlatma hatası:", hata);
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
            <h3>⚽ Maç ve Saha Yönetim Paneli</h3>
            <div style="margin-bottom: 10px;">
                <button id="btnSahayiTemizle" onclick="sahayiVeKadroSifirla()" style="background: #ff4d4d; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 4px; cursor: pointer; width: 100%;">🗑️ Sahayı ve Kayıtlı Kadroyu Temizle</button>
            </div>
            <div style="display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap;">
                <label>Kırmızı Skor: <input type="number" id="skorRed" value="0" style="width: 50px; background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <label>Beyaz Skor: <input type="number" id="skorWhite" value="0" style="width: 50px; background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <label>Maç Tarihi: <input type="date" id="macTarihi" style="background:#333; color:white; border:1px solid #555; border-radius:4px; padding:3px;"></label>
                <button onclick="macSkorunuKaydet()" style="background: #ffcc00; color: #111; border:none; padding:5px 15px; font-weight:bold; border-radius:4px; cursor:pointer;">Maçı Geçmişe Kaydet</button>
            </div>
            <div style="margin-top: 15px; border-top: 1px solid #333; padding-top: 10px;">
                <h4 style="margin: 0 0 8px 0; color: #ffcc00; font-size: 14px;">📜 Maç Geçmişi</h4>
                <div id="enSonMacAlani" style="margin-bottom: 10px;"></div>
                <div id="eskiMaclarKapsayici"></div>
            </div>
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
        
        if (ilkKadroYuklendiMi) {
            const mod = document.querySelector('input[name="matchMode"]:checked').value;
            sahayaDiz(null, "redTeamPitch", "red", mod, true);
            sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
        }
    });
}

function canliKadroDinleyicisiniBaslat() {
    database.ref("sistem_hafizasi/canli_kadro").on("value", (snapshot) => {
        const kayitliVeri = snapshot.val();
        if (kayitliVeri && kayitliVeri.kadro) {
            manuelKadro = kayitliVeri.kadro;
            const mod = kayitliVeri.mod || "6v6";
            
            const radio = document.querySelector(`input[name="matchMode"][value="${mod}"]`);
            if (radio) radio.checked = true;

            ilkKadroYuklendiMi = true;
            
            if (oyuncular.length > 0) {
                sahayaDiz(null, "redTeamPitch", "red", mod, true);
                sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
            }
        } else {
            manuelKadro = { red: {}, white: {} };
            const mod = document.querySelector('input[name="matchMode"][value="6v6"]').value;
            if (oyuncular.length > 0) {
                sahayaDiz(null, "redTeamPitch", "red", mod, true);
                sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
            }
        }
    });
}

function firebasedenAnlikKadroKaydet() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const veri = {
        kadro: manuelKadro,
        mod: mod
    };
    database.ref("sistem_hafizasi/canli_kadro").set(veri);
}

function sahayiVeKadroSifirla() {
    const onay = confirm("Sahadaki tüm kadroyu ve buluttaki kayıtlı dizilimi sıfırlamak istediğinize emin misiniz?");
    if (!onay) return;

    manuelKadro = { red: {}, white: {} };
    database.ref("sistem_hafizasi/canli_kadro").remove().then(() => {
        const mod = document.querySelector('input[name="matchMode"]:checked').value;
        sahayaDiz(null, "redTeamPitch", "red", mod, true);
        sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
    });
}

function modDegisti() {
    const mod = document.querySelector('input[name="matchMode"]:checked').value;
    const header = document.getElementById("listHeader");
    if (header) {
        header.innerText = mod === "6v6" ? "Oyuncu Havuzu (Maç için 12 kişi seçin)" : "Oyuncu Havuzu (Maç için 14 kişi seçin)";
    }
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

    if (!isim) return;

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
    if (sifre !== YONETICI_SIFRESI) return;

    if (confirm("Bu oyuncuyu silmek istediğinize emin misiniz?")) {
        database.ref("oyuncular/" + id).remove();
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
                    <button onclick="oyuncuDuzenleFormDoldur('${o.id}')" style="background: none; border: none; color: #ffcc00; cursor: pointer; font-size: 13px;" title="Düzenle">✏️</button>
                    <button onclick="oyuncuSil('${o.id}')" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 13px;" title="Sil">🗑️</button>
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

    return puanObj.anaMevki === "KL" ? Math.round(kl) : Math.round((def + ort + huc) / 3);
}

function sahayaDiz(kadro, sahaId, takimRenk, mod, isManuel = false) {
    const sahaDiv = document.getElementById(sahaId);
    if (!sahaDiv) return;
    sahaDiv.innerHTML = "";

    let konumlar = [];
    const genelGen = (puanObj) => genelPuanHesapla(puanObj);

    if (takimRenk === "red") {
        konumlar.push({ id: "pos_0", x: 50, y: 0, s: "gk-jersey red-gk", p: manuelKadro.red["pos_0"] || null });
        if (mod === "6v6") { 
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: manuelKadro.red["pos_1"] || null }); 
            konumlar.push({ id: "pos_2", x: 80, y: 32, s: "red-jersey", p: manuelKadro.red["pos_2"] || null }); 
            konumlar.push({ id: "pos_3", x: 32, y: 54, s: "red-jersey", p: manuelKadro.red["pos_3"] || null }); 
            konumlar.push({ id: "pos_4", x: 68, y: 54, s: "red-jersey", p: manuelKadro.red["pos_4"] || null });
        } else { 
            konumlar.push({ id: "pos_1", x: 20, y: 32, s: "red-jersey", p: manuelKadro.red["pos_1"] || null }); 
            konumlar.push({ id: "pos_2", x: 50, y: 22, s: "red-jersey", p: manuelKadro.red["pos_2"] || null }); 
            konumlar.push({ id: "pos_3", x: 80, y: 32, s: "red-jersey", p: manuelKadro.red["pos_3"] || null }); 
            konumlar.push({ id: "pos_4", x: 32, y: 54, s: "red-jersey", p: manuelKadro.red["pos_4"] || null }); 
            konumlar.push({ id: "pos_5", x: 68, y: 54, s: "red-jersey", p: manuelKadro.red["pos_5"] || null });
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 75, s: "red-jersey", p: manuelKadro.red[fvtId] || null });
    
    } else {
        konumlar.push({ id: "pos_0", x: 50, y: 82, s: "gk-jersey", p: manuelKadro.white["pos_0"] || null });
        if (mod === "6v6") { 
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: manuelKadro.white["pos_1"] || null }); 
            konumlar.push({ id: "pos_2", x: 80, y: 50, s: "white-jersey", p: manuelKadro.white["pos_2"] || null }); 
            konumlar.push({ id: "pos_3", x: 32, y: 28, s: "white-jersey", p: manuelKadro.white["pos_3"] || null }); 
            konumlar.push({ id: "pos_4", x: 68, y: 28, s: "white-jersey", p: manuelKadro.white["pos_4"] || null });
        } else { 
            konumlar.push({ id: "pos_1", x: 20, y: 50, s: "white-jersey", p: manuelKadro.white["pos_1"] || null }); 
            konumlar.push({ id: "pos_2", x: 50, y: 58, s: "white-jersey", p: manuelKadro.white["pos_2"] || null }); 
            konumlar.push({ id: "pos_3", x: 80, y: 50, s: "white-jersey", p: manuelKadro.white["pos_3"] || null }); 
            konumlar.push({ id: "pos_4", x: 32, y: 28, s: "white-jersey", p: manuelKadro.white["pos_4"] || null }); 
            konumlar.push({ id: "pos_5", x: 68, y: 28, s: "white-jersey", p: manuelKadro.white["pos_5"] || null });
        }
        let fvtId = mod === "6v6" ? "pos_5" : "pos_6";
        konumlar.push({ id: fvtId, x: 50, y: 7, s: "white-jersey", p: manuelKadro.white[fvtId] || null });
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
                <div class="${cardClass}" style="left: ${k.x}%; top: ${k.y}%; cursor: pointer;" onclick="manuelOyuncuKaldır('${takimRenk}', '${k.id}', '${mod}')" title="Kaldırmak için tıklayın">
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
                    <select onchange="manuelOyuncuSec(this, '${takimRenk}', '${k.id}', '${mod}')" style="width: 140px; font-size: 11px; background: #1e1e1e; color: white; border: 1px solid #555; border-radius: 4px; padding: 2px; cursor: pointer;">
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
        etiket.style.cssText = "padding: 8px 12px; background: #252529; border-radius: 8px; display: block; margin: 6px auto; width: 92%; border: 1px solid #333;";
        hedefKonteynir.parentNode.insertBefore(etiket, hedefKonteynir);
    }
    
    if (etiket) {
        const maksGuc = 500;
        let yuzde = Math.min((guc / maksGuc) * 100, 100);
        let barRengi = renk === "red" ? "#ff4d4d" : "#ffffff";
        let takimAdi = renk === "red" ? "🔴 Kırmızı Takım" : "⚪ Beyaz Takım";

        etiket.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: bold; color: ${barRengi};">
                <span>${takimAdi}</span>
                <span>${guc} / ${maksGuc} Puan</span>
            </div>
            <div style="width: 100%; background: #1a1a1e; height: 16px; border-radius: 4px; overflow: hidden; border: 1px solid #444;">
                <div style="width: ${yuzde}%; background: ${barRengi}; height: 100%; transition: width 0.3s;"></div>
            </div>
        `;
    }
}

function manuelOyuncuSec(selectElement, takimRenk, posId, mod) {
    const secilenId = selectElement.value;
    if (!secilenId) {
        delete manuelKadro[takimRenk][posId];
    } else {
        const oyuncu = oyuncular.find(o => o.id == secilenId);
        manuelKadro[takimRenk][posId] = oyuncu;
    }
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
    
    firebasedenAnlikKadroKaydet();
}

function manuelOyuncuKaldır(takimRenk, posId, mod) {
    delete manuelKadro[takimRenk][posId];
    sahayaDiz(null, "redTeamPitch", "red", mod, true);
    sahayaDiz(null, "whiteTeamPitch", "white", mod, true);
    
    firebasedenAnlikKadroKaydet();
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
 
    if (seciliOyuncular.length !== gerekenOyuncu) return;
 
    seciliOyuncular.sort((a, b) => genelPuanHesapla(b) - genelPuanHesapla(a));
 
    let takimA = [];
    let takimB = [];
    let güçA = 0;
    let güçB = 0;
 
    seciliOyuncular.forEach((o, index) => {
        const p = genelPuanHesapla(o);
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

    firebasedenAnlikKadroKaydet();
}

function takimiPozisyonlandir(takim, mod) {
    let kadro = { KL: null, DEF: [], ORT: [], HUC: [] };
    let kaleciler = takim.filter(o => o.anaMevki === "KL").sort((a, b) => b.kl - a.kl);
    kadro.KL = kaleciler.length > 0 ? kaleciler[0] : [...takim].sort((a, b) => b.kl - a.kl)[0];
    
    let kalanlar = takim.filter(o => o.id !== kadro.KL.id);
    let forvetler = kalanlar.filter(o => o.anaMevki === "HUC").sort((a, b) => b.huc - a.huc);
    kadro.HUC.push(forvetler.length > 0 ? forvetler[0] : [...kalanlar].sort((a, b) => b.huc - a.huc)[0]);
    
    kalanlar = kalanlar.filter(o => o.id !== kadro.HUC[0].id);
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
    
    let gobekOyuncusu = kalanlar.filter(o => o.anaMevki === "ORT")[0] || kalanlar[0];
    kadro.ORT = gobekOyuncusu ? [gobekOyuncusu, ...kalanlar.filter(o => o.id !== gobekOyuncusu.id)] : kalanlar;

    return kadro;
}

function macSkorunuKaydet() {
    const sifre = prompt("Güvenlik Doğrulaması: Skor kaydetmek için yönetici şifresini girin:");
    if (sifre === null) return;
    if (sifre !== YONETICI_SIFRESI) return;

    const skorR = document.getElementById("skorRed").value;
    const skorW = document.getElementById("skorWhite").value;
    const tarih = document.getElementById("macTarihi").value;

    if (!tarih) return;

    const kirmiziKadro = Object.values(manuelKadro.red).filter(o => o !== null).map(o => o.isim).join(", ");
    const beyazKadro = Object.values(manuelKadro.white).filter(o => o !== null).map(o => o.isim).join(", ");

    if(!kirmiziKadro || !beyazKadro) return;

    database.ref("mac_gecmisi").push({
        tarih, skorKirmizi: skorR, skorBeyaz: skorW, kirmiziKadro, beyazKadro
    });
}

function macGecmisiniDinle() {
    database.ref("mac_gecmisi").on("value", (snapshot) => {
        const data = snapshot.val();
        const enSonMacAlani = document.getElementById("enSonMacAlani");
        const eskiMaclarKapsayici = document.getElementById("eskiMaclarKapsayici");
        if (!enSonMacAlani || !eskiMaclarKapsayici) return;

        enSonMacAlani.innerHTML = "";
        eskiMaclarKapsayici.innerHTML = "";

        if (data) {
            const maclar = [];
            Object.keys(data).forEach(key => maclar.push({ id: key, ...data[key] }));
            maclar.sort((a, b) => b.tarih.localeCompare(a.tarih));

            // En son yapılan maç (En üstte sabit görünür)
            const sonMac = maclar[0];
            enSonMacAlani.innerHTML = `
                <div style="background: #252529; border: 1px solid #444; border-left: 4px solid #ffcc00; padding: 8px 10px; border-radius: 6px;">
                    <div style="color: #ffcc00; font-weight: bold; font-size: 12px; margin-bottom: 3px;">🔥 EN SON MAÇ SONUCU</div>
                    <div><strong>📅 ${sonMac.tarih}</strong> | <span style="color:#ff5555">Kırmızı ${sonMac.skorKirmizi}</span> - <span style="color:#fff">Beyaz ${sonMac.skorBeyaz}</span></div>
                    <div style="margin-top: 4px;"><small style="color:#aaa">🔴 Kırmızı: ${sonMac.kirmiziKadro}</small></div>
                    <div><small style="color:#aaa">⚪ Beyaz: ${sonMac.beyazKadro}</small></div>
                </div>
            `;

            // Eğer birden fazla maç varsa, eski maçlar için açılır/kapanır buton yapısı kur
            if (maclar.length > 1) {
                const eskiMaclar = maclar.slice(1);
                eskiMaclarKapsayici.innerHTML = `
                    <button id="btnEskiMaclariGoster" onclick="eskiMaclariTogglela()" style="width: 100%; background: #2a2a2e; color: #ccc; border: 1px solid #444; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; margin-top: 5px;">
                        ▼ Eski Maçları Göster (${eskiMaclar.length} Maç)
                    </button>
                    <div id="eskiMaclarListesi" style="display: none; margin-top: 8px; max-height: 220px; overflow-y: auto;">
                        ${eskiMaclar.map(mac => `
                            <div style="background: #222; border-left: 4px solid #777; padding: 6px 8px; margin-bottom: 6px; border-radius: 4px;">
                                <strong>📅 ${mac.tarih}</strong> | <span style="color:#ff5555">Kırmızı ${mac.skorKirmizi}</span> - <span style="color:#fff">Beyaz ${mac.skorBeyaz}</span>
                                <br><small style="color:#aaa">🔴 ${mac.kirmiziKadro}</small>
                                <br><small style="color:#aaa">⚪ ${mac.beyazKadro}</small>
                            </div>
                        `).join("")}
                    </div>
                `;
            }
        } else {
            enSonMacAlani.innerHTML = "Henüz maç geçmişi yok.";
        }
    });
}

function eskiMaclariTogglela() {
    const liste = document.getElementById("eskiMaclarListesi");
    const btn = document.getElementById("btnEskiMaclariGoster");
    if (!liste || !btn) return;

    if (liste.style.display === "none") {
        liste.style.display = "block";
        const eskiMacSayisi = liste.children.length;
        btn.innerText = `▲ Eski Maçları Gizle`;
    } else {
        liste.style.display = "none";
        const eskiMacSayisi = liste.children.length;
        btn.innerText = `▼ Eski Maçları Göster (${eskiMacSayisi} Maç)`;
    }
}

// 7v7 için güncellenmiş ve doğru sıraya dizilmiş geliştirici modu kadroları
const GIZLI_KIRMIZI_TAKIM = [
    "VOLKAN ÇAKAR",     // pos_0 (KL)
    "ATAKAN SARIOĞLU",  // pos_1
    "EMİN YILDIRIMTAŞ", // pos_2
    "CANER UÇAL",       // pos_3
    "BORA ATALIK",      // pos_4
    "KAAN GÜLLÜ",       // pos_5
    "ALİ TONBUL"        // pos_6 (FVT)
];

const GIZLI_BEYAZ_TAKIM = [
    "UTKU GÜNDOĞAN",    // pos_0 (KL)
    "FURKAN ÖZDEMİR",   // pos_1
    "SELAMİ DOĞAN",     // pos_2
    "YİĞİT ESENDEMİR",  // pos_3
    "ZEKERİYA KOŞAR",   // pos_4
    "BERK AKYÜZ",       // pos_5
    "ERHAN ERSOY"       // pos_6 (FVT)
];

function gelistiriciModunuAc() {
    const token = prompt("API v2.4 Sunucu Senkronizasyon Anahtarı (Token) Giriniz:");
    
    if (token === YONETICI_SIFRESI) { 
        if (oyuncular.length === 0) return;

        const mod = document.querySelector('input[name="matchMode"]:checked').value;
        const oyuncuNesnesiBul = (isim) => oyuncular.find(o => o && o.isim && o.isim.toLocaleUpperCase('tr-TR').trim() === isim.toLocaleUpperCase('tr-TR').trim());

        manuelKadro = { red: {}, white: {} };

        GIZLI_KIRMIZI_TAKIM.forEach((isim, index) => {
            manuelKadro.red[`pos_${index}`] = oyuncuNesnesiBul(isim) || null;
        });

        GIZLI_BEYAZ_TAKIM.forEach((isim, index) => {
            manuelKadro.white[`pos_${index}`] = oyuncuNesnesiBul(isim) || null;
        });

        sahayaDiz(null, "redTeamPitch", "red", mod, true);
        sahayaDiz(null, "whiteTeamPitch", "white", mod, true);

        firebasedenAnlikKadroKaydet();

    } else if (token !== null) {
        // Hatalı şifrede sessiz kalındı
    }
}