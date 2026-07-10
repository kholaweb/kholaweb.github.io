#!/usr/bin/env node
/*
 * Extrait le catalogue (disciplines → chapitres → exercices) de
 * index.html et le sérialise dans data/exercises.json.
 *
 * Le HTML source est généré/rédigé à la main mais avec une mise en
 * forme très régulière (un exo-card par ligne, un acc-item par
 * chapitre) : on peut donc le parser ligne par ligne plutôt que de
 * risquer une regex fragile sur tout le fichier.
 *
 * Usage : node scripts/extract-exercises.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, '..', 'data', 'exercises.json');

const PAGE_START = /^<div id="page-([a-z]+)" class="page( active)?">/;
const DISC_ICON  = /<div class="disc-header-icon" style="background:var\(--tag-[a-z]+-bg\)">(.*?)<\/div>/;
const DISC_TITLE = /<div class="disc-header-title">(.*?)<\/div>/;
const DISC_SUB   = /<div class="disc-header-sub">(.*?)<\/div>/;
const ACC_START  = /<div class="acc-item" id="([^"]+)">/;
const ACC_HEAD    = /<span class="acc-code">([^<]+)<\/span><span class="acc-title">([\s\S]*?)<\/span><\/div>/;
const ACC_KHOLOR  = /^(.*?)\s*<span class="acc-kholor">Kholor\s*—\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a><\/span>$/;
const ACC_COUNT   = /<span class="acc-count">(\d+) exercices<\/span>/;
const EXO_CARD    = /<div class="exo-card"><a href="([^"]+)" target="_blank" style="display:contents"><div class="exo-num">([^<]+)<\/div><div class="exo-title">([\s\S]*?)<\/div><\/a><\/div>/;

function slugify(code) {
  return code.toLowerCase().replace(/\./g, '-');
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').trim();
}

function parse(html) {
  const lines = html.split(/\r?\n/);
  const disciplines = [];
  let currentDisc = null;
  let currentChapter = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('<footer')) break;

    const pageMatch = line.match(PAGE_START);
    if (pageMatch) {
      const id = pageMatch[1];
      if (id === 'home') {
        currentDisc = null;
      } else {
        currentDisc = { id, name: null, icon: null, summary: null, chapters: [] };
        disciplines.push(currentDisc);
      }
      currentChapter = null;
      continue;
    }

    if (!currentDisc) continue;

    // Icône, titre et sous-titre de la discipline peuvent apparaître sur
    // la même ligne HTML : on les teste indépendamment, sans "continue"
    // prématuré, avant de retomber sur les motifs de chapitre/exercice.
    let m;
    let matchedHeader = false;
    if ((m = line.match(DISC_ICON)))  { currentDisc.icon = stripTags(m[1]); matchedHeader = true; }
    if ((m = line.match(DISC_TITLE))) { currentDisc.name = stripTags(m[1]); matchedHeader = true; }
    if ((m = line.match(DISC_SUB)))   { currentDisc.summary = stripTags(m[1]); matchedHeader = true; }
    if (matchedHeader) continue;

    if ((m = line.match(ACC_START))) {
      currentChapter = { id: m[1], code: null, title: null, kholor: null, exercises: [] };
      currentDisc.chapters.push(currentChapter);
      continue;
    }

    if (!currentChapter) continue;

    if ((m = line.match(ACC_HEAD))) {
      currentChapter.code = m[1];
      const rawTitle = m[2];
      const k = rawTitle.match(ACC_KHOLOR);
      if (k) {
        currentChapter.title = stripTags(k[1]).replace(/\.\s*$/, '.');
        currentChapter.kholor = { price: k[3].trim(), url: k[2] };
      } else {
        currentChapter.title = stripTags(rawTitle);
      }
      continue;
    }

    if ((m = line.match(ACC_COUNT))) {
      currentChapter.declaredCount = parseInt(m[1], 10);
      continue;
    }

    if ((m = line.match(EXO_CARD))) {
      const externalUrl = m[1];
      currentChapter.exercises.push({
        code: m[2],
        title: stripTags(m[3]),
        externalUrl,
        // Convention repérée dans les URLs de l'ancien site : "_tot" désigne
        // une page qui contient déjà énoncé + corrigé, "_enon" un énoncé seul.
        hasCorrige: /_tot\.htm/i.test(externalUrl),
        contentFile: null,
      });
      continue;
    }

    // Fin de la liste d'exercices du chapitre courant (fermeture
    // acc-body-inner + acc-body sur une seule ligne).
    if (line === '</div></div>') {
      currentChapter = null;
      continue;
    }
  }

  return disciplines;
}

function main() {
  const html = fs.readFileSync(SRC, 'utf8');
  const disciplines = parse(html);

  let chapterCount = 0;
  let exerciseCount = 0;
  const warnings = [];

  for (const disc of disciplines) {
    for (const chap of disc.chapters) {
      chapterCount++;
      exerciseCount += chap.exercises.length;
      if (chap.declaredCount !== undefined && chap.declaredCount !== chap.exercises.length) {
        warnings.push(
          `${disc.id}/${chap.code}: annonce ${chap.declaredCount} exercices, ${chap.exercises.length} trouvés`
        );
      }
      delete chap.declaredCount;
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ disciplines }, null, 2) + '\n', 'utf8');

  console.log(`${disciplines.length} disciplines, ${chapterCount} chapitres, ${exerciseCount} exercices -> ${path.relative(process.cwd(), OUT)}`);
  if (warnings.length) {
    console.warn('\nAvertissements :');
    warnings.forEach(w => console.warn('  - ' + w));
  }
}

main();
