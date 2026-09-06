#!/usr/bin/env node
/**
 * Neon Overdrive — gerçek tarayıcıda kabul testi.
 *
 * Kullanım: node tests/browser.mjs http://127.0.0.1:8080
 *
 * Bu test "sayfa açıldı" demez. Döngünün canlı olduğunu, oyunun deterministik
 * olarak ÇARPTIĞINI ve R ile geri geldiğini ölçer. Zamanlama saniyeye değil
 * oyun durumuna bağlanır; yazılımsal rasterde (SwiftShader) de geçerlidir.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Playwright depo ağacının DIŞINA kurulur (tek dosya sözleşmesi bozulmasın diye),
// bu yüzden ESM çözümleyicisi onu bulamaz; CJS require ile açıkça aranır.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [];
  if (process.env.PW_ROOT) candidates.push(join(process.env.PW_ROOT, 'node_modules', 'playwright'));
  if (process.env.NODE_PATH) candidates.push(join(process.env.NODE_PATH, 'playwright'));
  candidates.push('playwright');
  for (const c of candidates) {
    try { return require(c); } catch { /* sıradakini dene */ }
  }
  throw new Error('playwright bulunamadı; PW_ROOT ya da NODE_PATH ayarlayın');
}
const { chromium } = loadPlaywright();

const base = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const results = [];
let failed = 0;

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push(`ok    ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    failed++;
    results.push(`FAIL  ${name} — ${err.message}`);
    console.log(`::error::${name}: ${err.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars'
  ]
});
const page = await browser.newPage({ viewport: { width: 800, height: 520 } });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));

const probe = () => page.evaluate(() => {
  const p = window.__overdrive;
  return p ? {
    frames: p.frames, distance: p.distance, speed: p.speed, lane: p.lane,
    shipX: p.shipX, score: p.score, gates: p.gates, alive: p.alive,
    state: p.state, motion: p.motion, seed: p.seed, lanes: p.lanes,
    rowGap: p.rowGap, maxBlocked: p.maxBlocked, laneWidth: p.laneWidth
  } : null;
});

/** Bir koşul sağlanana kadar bekler; zaman aşımında son durumu mesaja koyar. */
async function until(label, predicate, timeoutMs = 45000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await probe();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(120);
  }
  throw new Error(`${label} zaman aşımına uğradı (${timeoutMs} ms). Son durum: ${JSON.stringify(last)}`);
}

/**
 * Koridor deterministik olarak ~6.5 saniyelik oyun süresinde çarpar; bu yüzden
 * canlı oyun gerektiren her adım kendi taze turunu açar. Aksi hâlde testin
 * sonucu, koşucunun ne kadar yavaş çizdiğine bağlı olurdu.
 */
async function ensureRunning() {
  await page.keyboard.press('KeyR');
  // Eşik yazılımsal rasterde bile güvenli: koridor 248 m'de çarpar, bu yüzden
  // 150 m altı "tur taze" demektir; kare hızına bağlı bir sayı değildir.
  return until('taze tur başlamadı', (s) => s.state === 'running' && s.distance < 150, 15000);
}

await step('sayfa yükleniyor', async () => {
  const res = await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 });
  must(res && res.ok(), `HTTP ${res && res.status()}`);
  await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 45000 });
  return `HTTP ${res.status()}`;
});

await step('WebGL yedeği tetiklenmedi', async () => {
  const shown = await page.evaluate(() => document.getElementById('fallback').classList.contains('show'));
  must(!shown, '#fallback görünür — bu ortamda WebGL bağlamı kurulamadı');
});

await step('sonda mevcut ve donmuş', async () => {
  const p = await probe();
  must(p, 'window.__overdrive tanımsız');
  must(p.lanes === 5 && p.maxBlocked === 3, `sonda sabitleri beklenmedik: ${JSON.stringify(p)}`);
  const mutated = await page.evaluate(() => {
    try { window.__overdrive = { hacked: true }; } catch { /* strict modda atar */ }
    try { window.__overdrive.frames = -1; } catch { /* okunur */ }
    return window.__overdrive && typeof window.__overdrive.frames === 'number' && !window.__overdrive.hacked;
  });
  must(mutated, 'sonda dışarıdan değiştirilebiliyor');
  return `seed=0x${p.seed.toString(16)} lanes=${p.lanes}`;
});

await step('render döngüsü canlı', async () => {
  const a = (await probe()).frames;
  await page.waitForTimeout(1200);
  const b = (await probe()).frames;
  must(b > a, `kare sayacı ilerlemiyor (${a} → ${b})`);
  return `${a} → ${b} kare`;
});

await step('başlangıçta hazır durumda ve mesafe sıfır', async () => {
  const p = await probe();
  must(p.state === 'ready', `durum "ready" değil: ${p.state}`);
  must(p.distance === 0, `mesafe sıfır değil: ${p.distance}`);
  const attr = await page.getAttribute('html', 'data-game-state');
  must(attr === 'ready', `data-game-state="${attr}"`);
  const sheet = await page.evaluate(() => document.getElementById('sheet').classList.contains('show'));
  must(sheet, 'başlangıç ekranı görünmüyor');
});

await step('hareket tercihi DOM\'a yazılmış', async () => {
  const motion = await page.getAttribute('html', 'data-motion-state');
  must(motion === 'full' || motion === 'reduced', `data-motion-state="${motion}"`);
  return motion;
});

await step('BAŞLAT oyunu çalıştırıyor', async () => {
  await page.click('#btn-start');
  const p = await until('durum "running" olmadı', (s) => s.state === 'running', 15000);
  must(p.alive, 'alive false');
  return `hız ${Math.round(p.speed)}`;
});

await step('mesafe artıyor', async () => {
  const a = (await probe()).distance;
  const p = await until('mesafe artmadı', (s) => s.distance > a + 20, 20000);
  return `${a.toFixed(1)} → ${p.distance.toFixed(1)} m`;
});

await step('şerit değiştirme klavyeyle çalışıyor', async () => {
  await ensureRunning();
  const before = (await probe()).lane;
  await page.keyboard.press('ArrowLeft');
  const left = await until('sol şeride geçilmedi', (s) => s.lane === before - 1, 8000);
  await page.keyboard.press('ArrowRight');
  await until('sağ şeride dönülmedi', (s) => s.lane === before, 8000);
  return `${before} → ${left.lane} → ${before}`;
});

await step('dokunmatik butonlar şerit değiştiriyor', async () => {
  await ensureRunning();
  const before = (await probe()).lane;
  await page.click('#btn-left');
  const left = await until('dokunmatik sol buton çalışmadı', (s) => s.lane < before, 8000);
  await page.click('#btn-right');
  await until('dokunmatik sağ buton çalışmadı', (s) => s.lane === before, 8000);
  return `${before} → ${left.lane} → ${before}`;
});

await step('gemi görsel olarak şeride yaklaşıyor', async () => {
  await ensureRunning();
  await page.keyboard.press('ArrowLeft');
  const p = await probe();
  const target = (p.lane - (p.lanes - 1) / 2) * p.laneWidth;
  const q = await until('gemi hedef şeride yaklaşmadı', (s) => Math.abs(s.shipX - target) < 0.4, 10000);
  return `shipX=${q.shipX.toFixed(2)} hedef=${target.toFixed(2)}`;
});

await step('HUD durumu yansıtıyor', async () => {
  await ensureRunning();
  await until('HUD için mesafe birikmedi', (s) => s.distance > 30, 15000);
  const p = await probe();
  const shown = await page.evaluate(() => ({
    distance: Number(document.getElementById('hud-distance').textContent),
    gates: Number(document.getElementById('hud-gates').textContent)
  }));
  must(Math.abs(shown.distance - p.distance) < 400, `HUD mesafesi ${shown.distance}, sonda ${p.distance.toFixed(1)}`);
  must(Math.abs(shown.gates - p.gates) <= 1, `HUD geçidi ${shown.gates}, sonda ${p.gates}`);
  return `${shown.distance} m / ${shown.gates} geçit`;
});

await step('duraklatma mesafeyi donduruyor', async () => {
  await ensureRunning();
  await page.keyboard.press('KeyP');
  const paused = await until('duraklatılmadı', (s) => s.state === 'paused', 8000);
  await page.waitForTimeout(900);
  const after = await probe();
  must(after.distance === paused.distance, `duraklamada mesafe değişti: ${paused.distance} → ${after.distance}`);
  await page.keyboard.press('KeyP');
  await until('devam edilmedi', (s) => s.state === 'running', 8000);
  return `${paused.distance.toFixed(1)} m sabit kaldı`;
});

await step('merkez şeritte kalmak deterministik çarpışma üretiyor', async () => {
  // Sabit tohumda 4. sıra merkez şeridi kapatır: oyuncu hiç sapmazsa
  // tam olarak 3 geçit geçtikten sonra çarpar. Bu bir zaman aşımı değil,
  // bir tahmindir.
  await ensureRunning();
  const dead = await until('çarpışma gerçekleşmedi', (s) => s.state === 'crashed', 90000);
  must(dead.gates === 3, `beklenen 3 geçit sonrası çarpışma, gerçekleşen ${dead.gates}. Son durum: ${JSON.stringify(dead)}`);
  must(!dead.alive, 'çarpma sonrası alive hâlâ true');
  const sheet = await page.evaluate(() => document.getElementById('sheet').classList.contains('show'));
  must(sheet, 'çarpma ekranı görünmüyor');
  return `${dead.gates} geçit, ${Math.floor(dead.distance)} m`;
});

await step('R tuşu oyunu geri getiriyor', async () => {
  const before = await probe();
  must(before.state === 'crashed', `bu adım çarpmış bir turdan başlamalı, durum: ${before.state}`);
  await page.keyboard.press('KeyR');
  const p = await until('R sonrası oyun başlamadı', (s) => s.state === 'running', 15000);
  // Mutlak eşik yerine karşılaştırma: çarpma 248 m'de olur, sıfırlanan tur
  // bunun çok gerisinde olmalıdır. Kare hızı ne olursa olsun geçerli.
  must(p.distance < before.distance / 2, `mesafe sıfırlanmadı: ${before.distance.toFixed(1)} → ${p.distance.toFixed(1)}`);
  must(p.gates < before.gates, `geçit sayacı sıfırlanmadı: ${before.gates} → ${p.gates}`);
  must(p.lane === 2, `yeniden başlatmada şerit merkeze dönmedi: ${p.lane}`);
  return `${before.distance.toFixed(1)} m → ${p.distance.toFixed(1)} m`;
});

await step('konsolda hata yok', async () => {
  const noise = [...consoleErrors, ...pageErrors].filter((t) => !/favicon/i.test(t));
  must(noise.length === 0, `${noise.length} hata: ${noise.slice(0, 3).join(' | ')}`);
});

await page.screenshot({ path: 'neon-overdrive.png' });
await browser.close();

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} kabul adımı geçti`);
if (failed) {
  console.log(`::error::${failed} tarayıcı kontrolü başarısız`);
  process.exit(1);
}
