/* ══ Dissuasion de la copie ══════════════════════════════════════════════
   À charger en fin de page, avec css/protection.css qui désactive la
   sélection du texte.

   Aucune de ces mesures n'est infaillible : le contenu est envoyé au
   navigateur et reste accessible par le code source, l'impression ou une
   capture d'écran. Le but est de décourager le copier-coller ordinaire et,
   si une copie passe malgré tout, de lui attacher la source de la page.

   Ctrl+P n'est pas intercepté : l'impression est un usage légitime.      */

(function () {
  'use strict';

  /* Référence déposée dans le presse-papier à la place du contenu.
     Le titre de la page est amputé de son suffixe « · KholaWeb ». */
  function reference() {
    var titre = (document.title || '').split('·')[0].trim();
    var adresse = /^https?:$/.test(location.protocol)
      ? location.href.split('#')[0]
      : 'www.kholaweb.com';
    return (titre ? titre + ' — ' : '') + 'Hubert de Haan, KholaWeb\n' + adresse;
  }

  /* clic droit et glisser-déposer */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dragstart',   function (e) { e.preventDefault(); });

  /* enregistrement de la page et affichage du code source */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var k = (e.key || '').toLowerCase();
    if (k === 's' || k === 'u') e.preventDefault();
  });

  /* Toute copie — Ctrl+C, menu Édition, appui long — ne remet que la
     référence de la page dans le presse-papier, jamais le contenu. */
  document.addEventListener('copy', function (e) {
    var presse = e.clipboardData || window.clipboardData;
    if (!presse) return;
    presse.setData('text/plain', reference());
    e.preventDefault();
  });
  document.addEventListener('cut', function (e) { e.preventDefault(); });
})();
