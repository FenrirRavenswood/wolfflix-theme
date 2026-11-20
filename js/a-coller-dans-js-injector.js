/* WolfFlix — à coller dans : Tableau de bord → JS Injector → Add Script
   Nom conseillé : WolfFlix. Cocher « Enabled ».
   Pour changer de version : ne modifier que le numéro de version (@v…). */
window.WolfFlixConfig = {
    tmdb: 'COLLE_TA_CLE_API_TMDB_ICI', // clé API TMDB (v3) pour les bandes-annonces VF
    sagas: true,                       // false = désactive Sagas & Cycles
    bandesAnnonces: true               // false = désactive le bouton bande-annonce
};
(function () {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.5.0/js/wolfflix-core.js';
    s.defer = true;
    document.head.appendChild(s);
})();
