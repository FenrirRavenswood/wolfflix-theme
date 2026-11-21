/* WolfFlix — à coller dans : Tableau de bord → JS Injector → Add Script
   Nom conseillé : WolfFlix. Cocher « Enabled ».
   Pour changer de version : ne modifier que le numéro de version (@v…). */
window.WolfFlixConfig = {
    tmdb: 'COLLE_TA_CLE_API_TMDB_ICI',       // clé API TMDB (v3) pour les bandes-annonces VF
    youtube: '',                             // facultatif : clé YouTube Data v3 (sinon recherche sans clé via Invidious)
    sagas: true,                       // false = désactive Sagas & Cycles
    bandesAnnonces: true,              // false = désactive le bouton bande-annonce
    series: true,                      // false = désactive prochain épisode + grille des notes
    lecteur: true,                     // false = garde le lecteur de livres de Jellyfin
    livresInfos: true                  // false = retire le bouton « Infos en ligne » des livres
};
(function () {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.4/js/wolfflix-core.js';
    s.defer = true;
    document.head.appendChild(s);
})();
