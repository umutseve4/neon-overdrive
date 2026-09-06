# Neon Overdrive

**Beş şeritli bir neon koridorda, sabit bir tohumdan üretilen engellerin arasından uçarsın.** Tek bir `index.html`. Derleme yok, paket yok, varlık dosyası yok, sunucu yok. Aç ve oyna.

[![qa](https://img.shields.io/github/actions/workflow/status/umutseve4/neon-overdrive/qa.yml?branch=main&style=flat-square&label=qa)](https://github.com/umutseve4/neon-overdrive/actions/workflows/qa.yml)
![dosya](https://img.shields.io/badge/kaynak-1%20dosya-555?style=flat-square)
![bağımlılık](https://img.shields.io/badge/uzak%20bağımlılık-1-555?style=flat-square)

---

## Ne yapar

Ekran boyunca ilerleyen bir koridor üretilir. Her 62 metrede bir engel sırası gelir ve bu sıra beş şeridin **en fazla üçünü** kapatır — yani her sırada en az iki boş şerit kalır. Engeller rastgele değil: `0x5eed1` **tohumundan** deterministik olarak türetilir, bu yüzden koridor her açılışta aynıdır. Değişen tek şey senin sürüşündür.

Hız zamanla artar (34'ten 132'ye), turbo bunu 1.55 katına çıkarır. Fizik 1/120 saniyelik sabit adımlarla çalışır; yani 20 FPS'de de 144 FPS'de de aynı koridoru aynı hızda geçersin.

## Nasıl oynanır

| Tuş | Etki |
|---|---|
| <kbd>A</kbd> / <kbd>←</kbd> | Bir şerit sola |
| <kbd>D</kbd> / <kbd>→</kbd> | Bir şerit sağa |
| <kbd>Space</kbd> | Turbo (basılı tut) |
| <kbd>P</kbd> | Duraklat / devam |
| **R tuşu** | Baştan başlat |

Dokunmatik cihazlarda alttaki dört buton aynı işi görür.

## Nasıl çalıştırılır

```bash
git clone https://github.com/umutseve4/neon-overdrive.git
cd neon-overdrive
python3 -m http.server 8080
# http://127.0.0.1:8080
```

`index.html` dosyasını doğrudan çift tıklayarak da açabilirsin; ES modülü CDN'den geldiği için `file://` üzerinde tarayıcı CORS kuralları engelleyebilir, o durumda yukarıdaki sunucuyu kullan.

## Nasıl doğrulanır

```bash
node tests/qa.mjs      # statik kapı + oynanabilirlik kanıtı
node tests/browser.mjs http://127.0.0.1:8080   # gerçek Chromium'da kabul testi
```

`tests/qa.mjs` yalnızca metin aramaz. `index.html` içindeki üreteç bloğunu **söker ve çalıştırır**, ardından 20 000 satır boyunca (a) her sıranın en az iki boş şerit bıraktığını ve (b) satır başına en fazla iki şerit değiştirebilen bir oyuncunun ulaşılabilir şerit kümesinin **hiç boşalmadığını** kanıtlar. Yani "geçilemez duvar" hatası teoride değil, ölçüyle dışarıda tutulur. Üreteç kodunun kopyası testte tutulmaz; tek kaynak `index.html`'dir.

## Sınırlar

- **WebGL zorunludur.** Yazılımsal bir yedeği yoktur; donanım hızlandırması yoksa oyun yerine açıklama metni gösterilir.
- **Uzak bağımlılık:** tam olarak bir tane — `three@0.169.0` (unpkg, ES modülü). CDN kapalıysa sahne açılmaz. Sürüm bilerek pinlidir; QA bunu dosyadan okuyup bu README ile karşılaştırır.
- **Ağ ve depolama yok.** `fetch`, `XMLHttpRequest`, `localStorage`, çerez, analitik — hiçbiri yoktur ve QA bunların yokluğunu her koşuda denetler. Skorun kaydedilmez.
- **Ses yok.** Bilinçli bir karar: otomatik ses açan bir sayfa istemedim.
- **Hareket azaltma** tercihi açıksa sahne başlamadan önce bir onay ekranı gösterilir, kamera sarsıntısı kapatılır ve yıldız sayısı düşürülür — ama koridor doğası gereği sürekli hareket eder. Bu bir kaçış değil, dürüst bir uyarıdır.
- **`neon-overdrive-game`** deposu bu deponun eski, boş ikizidir. Oyun burada yaşar; oradaki kopya silinmeyi bekliyor.
- Skor tablosu, çok oyunculu mod ve seviye editörü **yoktur** ve planlanmıyor.

## Lisans

MIT — bkz. [LICENSE](LICENSE).
