# WolfFlix — thème « Sang et acier » pour Jellyfin

Thème personnel pour l'interface web de Jellyfin 12.4 : dark fantasy, palette sang et acier, blason au loup.

## Modules

| Fichier | Contenu | Type |
|---|---|---|
| `css/00-fondations.css` | Palette, polices, curseurs, barre de défilement, sélection | CSS seul |
| `css/10-identite.css` | Blason dans l'en-tête et sur la connexion, loup de chargement, fond | CSS seul |
| `css/20-navigation.css` | Barre du haut, menus en éventail, notifications, Playlists masqué | CSS seul |
| `css/30-accueil.css` | Titres, tuiles, cartes (survol, reflet), progression au loup, cascade | CSS (+ JS) |
| `css/40-fiches.css` | Fiches : bandeau, boutons animés, menus, lettrine, médaillons | CSS (+ JS) |
| `css/50-lecteur.css` | Rail gothique, loup sur progression et volume, pattes et braises | CSS seul |
| `css/60-tableau-de-bord.css` | Tableau de bord (chargé par le module JS) | CSS via JS |
| `css/70-sagas.css` | Rangées Sagas / Cycles, pages, ordre de visionnage, éditeur | CSS (+ JS) |
| `js/wolfflix-core.js` | Icônes, tableau de bord, tuiles et liens Sagas / Cycles / Favoris, signet des favoris, « Vu » qui retire de « Continuer », traînée d'empreintes, inclinaison | JavaScript |
| `css/80-bandes-annonces.css` | Bouton et lecteur de bande-annonce | CSS (+ JS) |
| `css/90-series.css` | Statut, prochain épisode, grille des notes des épisodes | CSS (+ JS) |
| `css/95-finitions.css` | Transitions de page, onglets, abécédaire, compteurs, cases à cocher, dialogues | CSS seul |
| `js/wolfflix-sagas.js` | Sagas (collections de films) et Cycles (collections avec séries) : pages, rangées « à suivre » et « ajoutées récemment », ordre perso enregistré dans les métadonnées (identifiant `WolfFlix`, repli sur une étiquette `wfordre:`) | JavaScript |
| `js/wolfflix-series.js` | Fiche série : statut, « Prochain épisode / Reprendre / Film lié », grille des notes + classement parmi tes séries ; saisons : films liés ; listes : séries sans fichier masquées | JavaScript |
| `css/97-lecteur.css` | Lecteur de livres / webtoons, bouton « Infos en ligne » | CSS (+ JS) |
| `js/wolfflix-lecteur.js` | Lecteur WolfFlix : livres (EPUB, MOBI, AZW3, FB2, PDF), webtoons (défilement continu, chapitres enchaînés), manga/BD (pages, double page, droite → gauche) ; position sauvegardée au mot / au pixel près et synchronisée par le serveur | JavaScript |
| `js/wolfflix-livres-infos.js` | Bouton « Infos en ligne » (admin) : Google Books, OpenLibrary, AniList, MangaDex → résumé, genres, auteurs, couverture | JavaScript |
| `js/wolfflix-bandes-annonces.js` | Bouton « Bande-annonce » : VF via TMDB, sinon VO, lue dans un lecteur WolfFlix | JavaScript |

## Installation

### 1. CSS — Tableau de bord → Général → Code CSS personnalisé

Copier tout ce bloc, coller, **Enregistrer** :

```css
/* WolfFlix — thème Sang et acier — v2.0.1
   À coller dans : Tableau de bord → Général → Code CSS personnalisé
   Pour désactiver un module : mettre sa ligne en commentaire (barre oblique + étoile avant, étoile + barre oblique après). */
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/00-fondations.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/10-identite.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/20-navigation.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/30-accueil.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/40-fiches.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/50-lecteur.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/70-sagas.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/80-bandes-annonces.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/90-series.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/95-finitions.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/css/97-lecteur.css");
```

### 2. JavaScript — Tableau de bord → JS Injector

Première fois seulement : Tableau de bord → Extensions → Gérer les dépôts → ajouter
`https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/manifest.json`,
puis installer **JavaScript Injector** depuis le catalogue et redémarrer Jellyfin.

Ensuite : JS Injector → **Add Script** (nom « WolfFlix »), coller ce bloc, cocher **Enabled**, enregistrer.
Remplacer `COLLE_TA_CLE_API_TMDB_ICI` par ta clé API TMDB (compte gratuit sur themoviedb.org → Paramètres → API), **en gardant les apostrophes**.
Chaque module JavaScript peut être coupé en passant sa ligne à `false`.

```js
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
    s.src = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v2.0.1/js/wolfflix-core.js';
    s.defer = true;
    document.head.appendChild(s);
})();
```

### Clé YouTube (facultative)

Sans rien configurer, WolfFlix cherche les bandes-annonces **VF** et **saison par saison** sur YouTube via **Invidious** (miroirs publics de YouTube, sans clé). Ces miroirs sont gérés par des bénévoles et tombent parfois en panne ; le script passe alors au suivant. Ta recherche (titre + « bande annonce VF ») est envoyée à ce miroir. Pour couper cette recherche : `rechercheYoutube: false` dans le bloc JS.

Pour une recherche plus fiable, tu peux ajouter une clé API YouTube Data v3 gratuite :
console.cloud.google.com → nouveau projet → « API et services » → activer **YouTube Data API v3** → « Identifiants » → **Créer une clé API**.
Dans les restrictions de la clé : *Restrictions d'API* = YouTube Data API v3, et *Sites Web* = l'adresse de ton Jellyfin (ex. `http://jujuflix.ddns.net:50000/*`).
Le quota gratuit permet environ 100 recherches par jour ; chaque résultat est gardé 30 jours dans le navigateur.

### 3. Réglage

Aucun réglage Jellyfin n'est nécessaire : les **Cycles** s'affichent en tête de la bibliothèque **Séries**
(les séries restent aussi dans la liste), et « Grouper les films dans des collections » peut rester actif pour voir les **Sagas** dans Films.

### 4. Recharger

Ctrl + F5 sur ordinateur ; sur téléphone, fermer et rouvrir l'onglet.

## Livres et webtoons

- Le bouton **Lire** (fiche, cartes, « Continuer la lecture ») ouvre le lecteur WolfFlix par-dessus Jellyfin. Le bouton « retour » du navigateur ou Échap le ferme.
- Le compte doit avoir le droit **« Autoriser le téléchargement des médias »** (Tableau de bord → Utilisateurs) — c'est aussi le cas pour le lecteur de Jellyfin.
- Formats : EPUB, KEPUB, MOBI, AZW, AZW3, FB2, PDF (livres) ; CBZ, ZIP, CBR, RAR, CB7, 7Z, CBT (images). Les CBZ sont lus **par morceaux** : un gros fichier s'ouvre sans être téléchargé en entier.
- Webtoon ou manga : détecté tout seul (images très hautes = webtoon, ou `ComicInfo.xml`), modifiable dans les réglages ; le choix est retenu pour toute la série (le dossier).
- Rangement conseillé : `Livres/Nom du webtoon/Chapitre 001.cbz`, un dossier par série. Un CBZ peut contenir plusieurs chapitres (un sous-dossier par chapitre), le lecteur les repère.
- **Meilleures infos** : installer depuis le catalogue d'extensions **OpenLibrary**, **GoogleBooks** et **ComicVine** (clé gratuite sur comicvine.gamespot.com/api), les cocher dans la bibliothèque Livres (téléchargeurs de métadonnées et d'images, langue : français), puis « Actualiser les métadonnées ». Pour les webtoons/mangas, le bouton **Infos en ligne** de WolfFlix complète avec AniList et MangaDex.
- Bibliothèques tierces incluses dans `lib/` : foliate-js (MIT), zip.js (BSD-3-Clause), libarchive.js (MIT). Polices Literata, Atkinson Hyperlegible, OpenDyslexic (OFL).

## Désactiver ou revenir en arrière

- **Un module** : mettre sa ligne en commentaire, par exemple
  `/* @import url(".../10-identite.css"); */`
- **Revenir à une version précédente** : remplacer le numéro (`@v2.0.1`) par l'ancien, dans le CSS et dans le script JS Injector.
- **Tout le thème** : vider le champ Code CSS personnalisé, ou y recoller l'ancienne sauvegarde.
- **Le module JavaScript** : décocher « Enabled » sur le script dans JS Injector.
- **Pour un seul utilisateur** : Paramètres → Affichage → « Désactiver le code CSS personnalisé fourni par le serveur ».

## Publier une nouvelle version

1. Changer le numéro dans `js/wolfflix-core.js` (`var VERSION = 'v…'`) et envoyer les fichiers modifiés sur GitHub.
2. La *release* est créée toute seule par `.github/workflows/release.yml` (onglet **Actions**) dès que ce numéro change.
3. Remplacer le numéro dans le CSS de Jellyfin **et** dans le script JS Injector (les deux blocs ci-dessus).

Le numéro de version garantit que tous les appareils chargent exactement les mêmes fichiers, et qu'on peut revenir en arrière en une seconde.

## Licences

- Polices IM Fell English SC et Spectral : SIL Open Font License 1.1 (voir `fonts/`).
- Blason, curseurs et images : créations personnelles pour WolfFlix.
- Couleurs de la grille des notes : reprises de [Jellyfin Episodes Ratings Grid](https://github.com/Damocles-fr/jellyfin-imdb-episodes-heatmap-ratings-grid) de Damocles-fr (licence MIT).
- Bandes-annonces : vidéos trouvées via l'API TMDB. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
