#!/usr/bin/env node
/**
 * Neon Overdrive — statik kapı.
 *
 * Bu betik iki iş yapar:
 *   1) index.html icindeki sozlesmeleri (tek CDN pini, erisilebilirlik
 *      kancalari, ag/depolama cagrisi yoklugu, README sozlesmesi) dogrular.
 *   2) index.html icindeki GEN blogunu SOKUP CALISTIRIR ve seviyenin
 *      gercekten oynanabilir oldugunu kanitlar. Uretec kodunun kopyasi
 *      burada tutulmaz; tek kaynak index.html'dir.
 *
 * Kural: hicbir beklenen deger burada sabitlenmez; olabildigince dosyadan
 * okunur. Basarisizlik mesaji eksik olan seyi ADIYLA soyler.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let failed = 0;
const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push(`ok    ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    failed++;
    checks.push(`FAIL  ${name} — ${err.message}`);
    console.log(`::error::${name}: ${err.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ---------------- dosya varligi ---------------- */
for (const f of ['index.html', 'README.md', 'LICENSE', '.nojekyll', 'robots.txt']) {
  check(`dosya var: ${f}`, () => { must(existsSync(join(root, f)), `${f} bulunamadi`); });
}

const html = read('index.html');
const readme = read('README.md').toLowerCase();
const license = read('LICENSE');

/* ---------------- bagimlilik yuzeyi ---------------- */
const srcs = [...html.matchAll(/(?:src|from)\s*=?\s*['"](https?:\/\/[^'"]+)['"]/g)].map((m) => m[1]);
const imports = [...html.matchAll(/from\s+['"](https?:\/\/[^'"]+)['"]/g)].map((m) => m[1]);
const remote = [...new Set([...srcs, ...imports])];

check('tek uzak bagimlilik', () => {
  must(remote.length === 1, `beklenen 1 uzak URL, bulunan ${remote.length}: ${remote.join(', ')}`);
  return remote[0];
});

check('three surumu pinlenmis', () => {
  const url = remote[0] || '';
  must(url.includes('unpkg.com/three@'), `three unpkg pininden gelmiyor: ${url}`);
  const after = url.split('unpkg.com/three@')[1] || '';
  const version = after.split('/')[0];
  const parts = version.split('.');
  must(parts.length === 3 && parts.every((p) => p.length > 0 && !Number.isNaN(Number(p))),
    `three surumu tam pinli degil: "${version}"`);
  must(readme.includes(version.toLowerCase()),
    `README pinlenen three surumunu ("${version}") anmiyor`);
  return `three@${version}`;
});

check('yerel varlik dosyasi yok', () => {
  const local = [...html.matchAll(/(?:src|href)\s*=\s*['"](?!https?:|#|data:)([^'"]+)['"]/g)].map((m) => m[1]);
  must(local.length === 0, `beklenmeyen yerel varlik: ${local.join(', ')}`);
});

/* ---------------- gizlilik yuzeyi ---------------- */
for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'sendBeacon', 'navigator.geolocation', 'googletagmanager', 'analytics']) {
  check(`yasak API kullanilmamis: ${banned}`, () => {
    must(!html.includes(banned), `index.html "${banned}" iceriyor; bu depo ag/depolama kullanmaz`);
  });
}

/* ---------------- erisilebilirlik ---------------- */
check('canvas klavye ile odaklanabilir ve adlandirilmis', () => {
  const tag = (html.match(/<canvas[^>]*id="scene"[^>]*>/) || [''])[0];
  must(tag, '<canvas id="scene"> bulunamadi');
  must(tag.includes('tabindex'), 'canvas tabindex tasimiyor');
  must(tag.includes('aria-label'), 'canvas aria-label tasimiyor');
});
check('focus-visible stili var', () => { must(html.includes(':focus-visible'), ':focus-visible kurali yok'); });
check('prefers-reduced-motion karsilanmis', () => {
  must(html.includes('prefers-reduced-motion'), 'prefers-reduced-motion sorgusu yok');
  must(html.includes('motionState'), 'hareket durumu DOM\'a yazilmiyor (motionState yok)');
});
check('WebGL yoksa yedek metin var', () => {
  must(html.includes('id="fallback"'), '#fallback yok');
  must(html.includes('webglAvailable'), 'WebGL yoklama fonksiyonu yok');
});
check('dokunmatik hedefler 44px', () => {
  must(/min-height:\s*4[4-9]px|min-height:\s*[5-9]\dpx/.test(html), 'buton min-height 44px altinda');
});
check('sayfa dili turkce', () => { must(/<html[^>]+lang="tr"/.test(html), 'html lang="tr" degil'); });

/* ---------------- lisans + README sozlesmesi ---------------- */
check('LICENSE MIT', () => {
  must(license.includes('MIT License'), 'LICENSE MIT degil');
  must(license.includes('Umut SEVER'), 'LICENSE telif sahibini anmiyor');
});
for (const phrase of ['sınırlar', 'şerit', 'tohum', 'license', 'webgl', 'r tuşu']) {
  check(`README sozlesmesi: "${phrase}"`, () => {
    must(readme.includes(phrase.toLowerCase()), `README "${phrase}" ifadesini icermiyor`);
  });
}

/* ---------------- uretec: index.html'den sokulur ---------------- */
const genMatch = html.match(/\/\* GEN:BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* GEN:END \*\//);
check('GEN blogu bulunabiliyor', () => {
  must(genMatch, 'index.html icinde GEN:BEGIN/GEN:END blogu yok');
  return `${genMatch[1].split('\n').length} satir`;
});

if (genMatch) {
  const source = genMatch[1] + '\n;export { LANES, ROW_GAP, SEED, MAX_BLOCKED, rowBlocks };';
  const gen = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
  const { LANES, ROW_GAP, SEED, MAX_BLOCKED, rowBlocks } = gen;
  const ROWS = 20000;

  check('uretec sabitleri makul', () => {
    must(LANES === 5, `LANES 5 degil: ${LANES}`);
    must(MAX_BLOCKED < LANES - 1, `MAX_BLOCKED (${MAX_BLOCKED}) en az iki serit bos birakmiyor`);
    must(ROW_GAP > 0, `ROW_GAP pozitif degil: ${ROW_GAP}`);
    return `LANES=${LANES} ROW_GAP=${ROW_GAP} MAX_BLOCKED=${MAX_BLOCKED}`;
  });

  check('uretec deterministik', () => {
    for (let i = 1; i <= 500; i++) {
      const a = rowBlocks(SEED, i).join(',');
      const b = rowBlocks(SEED, i).join(',');
      must(a === b, `satir ${i} iki cagride farkli: ${a} vs ${b}`);
    }
  });

  check(`her satir en az 2 bos serit birakiyor (${ROWS} satir)`, () => {
    for (let i = 1; i <= ROWS; i++) {
      const blocked = rowBlocks(SEED, i);
      must(new Set(blocked).size === blocked.length, `satir ${i} tekrarli serit iceriyor: ${blocked}`);
      must(blocked.every((l) => Number.isInteger(l) && l >= 0 && l < LANES),
        `satir ${i} gecersiz serit iceriyor: ${blocked}`);
      must(blocked.length <= MAX_BLOCKED, `satir ${i} ${blocked.length} serit kapatiyor (sinir ${MAX_BLOCKED})`);
      must(LANES - blocked.length >= 2, `satir ${i} yalnizca ${LANES - blocked.length} bos serit birakiyor`);
    }
  });

  check(`seviye bastan sona gecilebilir (${ROWS} satir, satir basina en fazla 2 serit degisimi)`, () => {
    const REACH = 2;
    let reachable = new Set([Math.floor(LANES / 2)]);
    for (let i = 1; i <= ROWS; i++) {
      const blocked = new Set(rowBlocks(SEED, i));
      const next = new Set();
      for (let l = 0; l < LANES; l++) {
        if (blocked.has(l)) continue;
        for (const r of reachable) { if (Math.abs(l - r) <= REACH) { next.add(l); break; } }
      }
      must(next.size > 0, `satir ${i} ulasilamaz: kapali=${[...blocked]}, onceki ulasilabilir=${[...reachable]}`);
      reachable = next;
    }
    return `son ulasilabilir kume: {${[...reachable].join(',')}}`;
  });

  check('uretec cesitli (tek bir kalibi tekrarlamiyor)', () => {
    const seen = new Set();
    for (let i = 1; i <= 4000; i++) seen.add(rowBlocks(SEED, i).join(','));
    must(seen.size >= 12, `4000 satirda yalnizca ${seen.size} farkli kalip uretildi`);
    return `${seen.size} farkli kalip`;
  });
}

/* ---------------- depo hijyeni ---------------- */
for (const bad of ['node_modules', 'package-lock.json', 'dist', 'build']) {
  check(`depoda ${bad} yok`, () => {
    must(!existsSync(join(root, bad)), `${bad} depoya girmis; bu depo derlemesizdir`);
  });
}

console.log(checks.join('\n'));
console.log(`\n${checks.length - failed}/${checks.length} kontrol gecti`);
if (failed) {
  console.log(`::error::${failed} statik kontrol basarisiz`);
  process.exit(1);
}
