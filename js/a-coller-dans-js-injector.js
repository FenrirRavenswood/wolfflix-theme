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
    livresInfos: true,                 // false = retire le bouton « Infos en ligne » des livres
    ordreLecture: true,                // false = garde le tri par titre de Jellyfin dans les dossiers de livres
    regrouperChapitres: true,          // false = « Ajouts récents » montre chaque chapitre au lieu du webtoon
    compterWebtoons: true,             // false = garde le nombre de livres de Jellyfin (1 chapitre = 1 livre)
    pistes: true,                      // false = laisse Jellyfin choisir l'audio et les sous-titres (sinon VFF > VFQ > VO, forcés FR ou rien)
    aVenir: true,                      // false = retire la page « À venir » (extension WolfFlix nécessaire)
    suivi: true                        // false = retire la page « Mon suivi » (extension WolfFlix 0.5+ nécessaire)
};
(function () {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.12.0/js/wolfflix-core.js';
    s.defer = true;
    document.head.appendChild(s);
})();
