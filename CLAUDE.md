# CLAUDE.md

Bu dosya, bu projenin çalışma biçimini, kodlama standartlarını ve Firebase yapılandırmasını her oturumda hızlıca tanımak için hazırlanmıştır.

## 1) Proje Özeti

- Proje tipi: Statik web uygulaması (HTML + CSS + JavaScript)
- Amaç: Futbol sahası için kadro oluşturma, takım kurma, oyuncu havuzu yönetimi ve maç geçmişi kaydı
- Çalışma mantığı: Browser içinde çalışır, Firebase Realtime Database üzerinden verileri senkronize eder
- Ana dosyalar:
  - `index.html`: arayüz yapısı
  - `style.css`: stil ve saha tasarımı
  - `app.js`: uygulama mantığı, Firebase yöntemleri, takım kurma ve dinleyiciler
  - `forma-*.png`: forma görselleri

## 2) Kodlama Standartları

### 2.1 Diller ve stil

- JavaScript dosyası tek başına çalışır; framework ya da build süreci yoktur.
- Değişken ve fonksiyon isimleri genellikle Türkçe ve açıklayıcı şekilde yazılır.
- Mevcut kod stilinde aşağıdaki örnekler görülür:
  - `oyuncuEkle()`
  - `veriTabaniniDinle()`
  - `sahayaDiz()`
  - `manuelKadro`
  - `oyuncular`
- `const` sabit değerler için kullanılır; `let` değiştirilebilir state için kullanılır.
- DOM işlemleri doğrudan `document.getElementById()`, `querySelector()` ve `innerHTML` ile yapılır.

### 2.2 Proje yazım kuralları

- Yeni fonksiyon eklenirken mevcut isimlendirme uyumuna dikkat et.
- İlgili işlevler `app.js` içinde mantıksal bölümlere ayrılmış şekilde tutulur.
- Firebase dinleyicileri ve state güncellemeleri aynı fonksiyon akışında tutulur.
- UI elemanları için CSS sınıfları tercih edilir; küçük inline stiller sadece özel durumlar için kullanılmalıdır.
- Renk, takım ve saha düzeni değişiklikleri `style.css` içinde yapılmalıdır.
- Eklenen özellikler mevcut iş akışını bozmayacak şekilde, mevcut DOM id ve class yapısına göre uyumlu yazılmalıdır.

### 2.3 Güvenlik ve kalite notları

- Bu proje statik bir arayüz olduğu için güvenlik için frontend tarafında hard-coded güvenlik kontrolü vardır (`YONETICI_SIFRESI`).
- Firebase API anahtarları ve veritabanı URL'i şu anda `app.js` içinde sabit olarak yazılmış durumdadır. Gelecekte `.env` veya ayrı bir config dosyası kullanılması önerilir.
- Silme, skor kaydı ve yönetici işlemleri için `confirm()` ve `prompt()` ile doğrulama yapılmaktadır.

## 3) Firebase Yapılandırması

Aşağıdaki değerler `app.js` içinde `firebaseConfig` olarak tanımlıdır:

```js
const firebaseConfig = {
    apiKey: "AIzaSyCreidC1Ybdx_s7663HGnuYhqUBNwmAEXU",
    authDomain: "halisaha-taktik.firebaseapp.com",
    databaseURL: "https://halisaha-taktik-default-rtdb.firebaseio.com/",
    projectId: "halisaha-taktik",
    storageBucket: "halisaha-taktik.firebasestorage.app",
    messagingSenderId: "682186454054",
    appId: "1:682186454054:web:27f9299909557daea2e7"
};
```

### 3.1 Firebase değişkenleri / global state

Uygulama içinde kullanılan temel değişkenler şöyledir:

```js
const YONETICI_SIFRESI = "12";

let database;
let oyuncular = [];
let duzenlenenId = null;
let manuelKadro = { red: {}, white: {} };
let ilkKadroYuklendiMi = false;
let topluOyuncuAdaylari = [];
```

### 3.2 Firebase veritabanı yolları

Uygulama şu ana path'leri kullanır:

- `oyuncular`
- `sistem_hafizasi/canli_kadro`
- `mac_gecmisi`

Örnek kullanım:

```js
database.ref("oyuncular").on("value", (snapshot) => { ... });
database.ref("sistem_hafizasi/canli_kadro").on("value", (snapshot) => { ... });
database.ref("mac_gecmisi").push({ ... });
```

### 3.3 Firebase başlatma akışı

```js
document.addEventListener("DOMContentLoaded", () => {
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
```

## 4) Uygulama Mantığına Genel Bakış

### 4.1 Oyuncu yönetimi

- `oyuncular` listesi `oyuncular` node'u üzerinden yüklenir.
- Oyuncu oluşturma, düzenleme ve silme akışları `app.js` içinde çalışır.
- Toplu import işlemi `bulkPlayerText` alanı ile yapılır; her satır bir oyuncu olabilir.
- Mevki formatı örneğin `Ad Soyad - DEF` şeklinde işlenir; yoksa varsayılan mevki kullanılır.

### 4.2 Takım kurma

- Mod seçimi için `6v6` / `7v7` radio butonları kullanılır.
- Takım düzeni `sahayaDiz()` fonksiyonu tarafından oluşturulur.
- `manuelKadro` nesnesi takım ve pozisyon bağlamında saklanır.
- `firebasedenAnlikKadroKaydet()` fonksiyonu canlı kadroyu Firebase'e yazdırır.

### 4.3 Maç geçmişi

- `macSkorunuKaydet()` ile maç sonucu kaydedilir.
- `mac_gecmisi` node'una tarih, skor ve kadrolar eklenir.
- `macGecmisiniDinle()` bu veriyi UI'da gösterir.

## 5) Test ve Doğrulama Komutları

Bu repo’da kurulu bir `package.json` yoktur. Bu nedenle otomatik test suite yoktur. Doğrulama için en güvenilir yöntem yerel server ile tarayıcıda smoke test yapmaktır.

### Yerel tarayıcı doğrulama

```bash
cd "D:\Documents\Desktop\halisaha-kadro"
python -m http.server 8000
```

Sonrasında browser’da açılacak adres:

```text
http://localhost:8000/
```

### JavaScript sözdizimi kontrolü

```bash
cd "D:\Documents\Desktop\halisaha-kadro"
node --check app.js
```

### Statik erişim kontrolü

```bash
curl -I http://localhost:8000/
```

## 6) Çalışma Notları

- Tarayıcı üzerinden Firebase erişimi ve Realtime Database verileri doğrudan çalışır.
- Uygulama ağ bağlantısı olduğu sürece Firebase ile senkronize olur.
- Yeni özellik eklenirken mevcut `database.ref(...)` yolu ve `manuelKadro` yapısını korumaya dikkat et.
- Geliştirme sırasında kodu bozabilecek `innerHTML` ile dinamik DOM oluşturmaları dikkatli yazılmalıdır.

## 7) Gelecek iyileştirmeler için öneriler

- Firebase config değerlerini ayrı bir `config.js` veya `.env` dosyasına taşı
- `YONETICI_SIFRESI` değerini ortam değişkeni / güvenli bir şekilde yönet
- Test ve lint için minimum `package.json` ekle
- Kod düzeni için küçük modüllere bölme (örneğin `firebase.js`, `teamLogic.js`, `ui.js`)

## 8) Hızlı Başlangıç

1. Çalışma klasörüne gir
2. Statik sunucuyu başlat
3. Tarayıcıda uygulamayı aç
4. Firebase veritabanı ve kullanıcı akışını test et
5. Değişiklikleri `app.js` ve `style.css` içinde yap

Bu dosya, sonraki oturumlarda proje bağlamını hızlıca hatırlamak amacıyla referans olarak kullanılmalıdır.
