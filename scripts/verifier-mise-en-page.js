#!/usr/bin/env node
/*
 * Contrôle la mise en page d'une page d'exercice dans un vrai navigateur, là où
 * scripts/verifier-page.js ne juge que les formules.
 *
 * Quatre contrôles, à plusieurs largeurs, corrigé ouvert :
 *
 *   1. débordement — la page ne doit jamais déborder horizontalement ; une
 *      formule trop large défile dans son propre cadre ;
 *   2. navigation — le lien précédent et le suivant tiennent sur une seule
 *      ligne, le titre du chapitre ayant été supprimé pour cela ;
 *   3. ponctuation orpheline — KaTeX compose ses blocs en inline-block, ce qui
 *      ouvre une possibilité de coupure juste après une formule en ligne, même
 *      sans espace. La virgule qui suit se retrouve alors seule en tête de
 *      ligne. Le remède est <span class="lie">, encore faut-il voir le défaut :
 *      il ne se manifeste qu'à certaines largeurs ;
 *   4. justification — le texte courant doit être en justify.
 *
 * puppeteer-core n'est pas une dépendance du dépôt : le site n'en a pas besoin
 * pour être servi. L'installer dans un répertoire de travail temporaire, puis
 * lancer ce script depuis ce répertoire, ou pointer NODE_PATH vers lui.
 *
 * Usage :
 *   node scripts/verifier-mise-en-page.js exercices/electricite/e1/e1_4.html
 *   node scripts/verifier-mise-en-page.js exercices/electricite/e1/*.html
 */
'use strict';

const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error(
    'puppeteer-core est introuvable.\n' +
    "Installer dans un répertoire de travail hors du dépôt :\n" +
    '  npm install puppeteer-core\n' +
    'puis relancer depuis ce répertoire, ou avec NODE_PATH pointant dessus.');
  process.exit(2);
}

const CHROME = process.env.CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LARGEURS = [360, 390, 480, 600, 768, 900, 1200];

const pages = process.argv.slice(2);
if (!pages.length) {
  console.error(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(1);
}

// Relevé fait dans la page. Renvoie les défauts, pas les mesures : ce qui
// intéresse est ce qui cloche.
function releve() {
  const doc = document.documentElement;
  const defauts = [];

  const deborde = doc.scrollWidth - doc.clientWidth;
  if (deborde > 0) defauts.push('déborde de ' + deborde + ' px');

  const nav = document.querySelector('.suite');
  if (nav) {
    const liens = [...nav.querySelectorAll('a')];
    const dessus = new Set(liens.map(a => Math.round(a.getBoundingClientRect().top)));
    if (dessus.size > 1) defauts.push('navigation sur ' + dessus.size + ' lignes');
    const tronques = liens.filter(a => a.scrollWidth > a.clientWidth + 1);
    if (tronques.length) {
      defauts.push(tronques.length + ' lien(s) de navigation tronqué(s)');
    }
  }

  // une ponctuation qui ouvre une ligne alors que ce qui la précède finit sur
  // la ligne d'avant : elle a été rejetée
  const rg = document.createRange();
  for (const par of document.querySelectorAll('.partie p, .questions li')) {
    for (const n of par.childNodes) {
      if (n.nodeType !== 3) continue;
      const m = n.textContent.match(/^[,.;:!?)\]]/);
      if (!m) continue;
      const prec = n.previousSibling;
      if (!prec || !prec.getBoundingClientRect) continue;
      rg.setStart(n, 0);
      rg.setEnd(n, 1);
      const apres = rg.getBoundingClientRect();
      const avant = prec.getBoundingClientRect();
      if (apres.top > avant.bottom - 2) {
        const quoi = (prec.textContent || '').trim().slice(0, 24);
        defauts.push('« ' + m[0] + ' » rejeté en tête de ligne après ' + quoi);
      }
    }
  }

  const p = [...document.querySelectorAll('.partie p')]
    .find(e => !e.classList.contains('ligne-formule') && e.textContent.length > 80);
  if (p && getComputedStyle(p).textAlign !== 'justify') {
    defauts.push('texte non justifié');
  }

  return defauts;
}

(async () => {
  const navigateur = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 60000,
  });
  let total = 0;

  for (const page of pages) {
    const url = 'file:///' + path.resolve(page).replace(/\\/g, '/');
    const onglet = await navigateur.newPage();
    await onglet.goto(url, { waitUntil: 'networkidle0' });

    for (const largeur of LARGEURS) {
      await onglet.setViewport({ width: largeur, height: 900 });
      await onglet.evaluate(() => {
        const d = document.querySelector('.corrige');
        if (d) d.open = true;
      });
      await new Promise(r => setTimeout(r, 150));
      const defauts = await onglet.evaluate(releve);
      total += defauts.length;
      for (const d of defauts) {
        console.log('%s  %s px  %s', path.basename(page), String(largeur).padStart(4), d);
      }
    }
    await onglet.close();
  }

  await navigateur.close();
  console.log(total
    ? '\n' + total + ' défaut(s) de mise en page'
    : 'Mise en page : rien à signaler sur ' + pages.length + ' page(s), '
      + LARGEURS.length + ' largeurs.');
  process.exit(total ? 1 : 0);
})();
