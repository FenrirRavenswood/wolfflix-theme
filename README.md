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
| `js/wolfflix-core.js` | Icônes, tableau de bord, tuiles Sagas / Cycles / Favoris, signet des favoris, « Vu » qui retire de « Continuer », traînée d'empreintes, inclinaison | JavaScript |
| `js/wolfflix-sagas.js` | Sagas (collections de films) et Cycles (collections avec séries) : pages, rangées « à suivre » et « ajoutées récemment », ordre perso enregistré dans les métadonnées (identifiant `WolfFlix`, repli sur une étiquette `wfordre:`) | JavaScript |

## Installation

Dans Jellyfin : **Tableau de bord → Général → Code CSS personnalisé**, coller :

```css
/* WolfFlix — thème Sang et acier */
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/00-fondations.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/10-identite.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/20-navigation.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/30-accueil.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/40-fiches.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/50-lecteur.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.4.0/css/70-sagas.css");
```

Puis **Enregistrer**, et recharger la page (Ctrl + F5).

## Module JavaScript (JavaScript Injector)

1. Tableau de bord → Extensions → Gérer les dépôts → ajouter :
   `https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/manifest.json`
2. Catalogue → installer **JavaScript Injector**, puis redémarrer Jellyfin.
3. Tableau de bord → JS Injector → Add Script, nom « WolfFlix — cœur », coller `js/a-coller-dans-js-injector.js`, cocher Enabled, enregistrer.

## Désactiver ou revenir en arrière

- **Un module** : mettre sa ligne en commentaire, par exemple
  `/* @import url(".../10-identite.css"); */`
- **Revenir à une version précédente** : remplacer `@v0.4.0` par l'ancienne version dans les lignes `@import`.
- **Tout le thème** : vider le champ Code CSS personnalisé, ou y recoller l'ancienne sauvegarde.
- **Le module JavaScript** : décocher « Enabled » sur le script dans JS Injector.
- **Pour un seul utilisateur** : Paramètres → Affichage → « Désactiver le code CSS personnalisé fourni par le serveur ».

## Publier une nouvelle version

1. Envoyer les fichiers modifiés sur GitHub.
2. Créer une nouvelle *release* avec un nouveau numéro (`v0.1.1`, `v0.2.0`…).
3. Remplacer le numéro dans les lignes `@import` de Jellyfin.

Le numéro de version garantit que tous les appareils chargent exactement les mêmes fichiers, et qu'on peut revenir en arrière en une seconde.

## Licences

- Polices IM Fell English SC et Spectral : SIL Open Font License 1.1 (voir `fonts/`).
- Blason, curseurs et images : créations personnelles pour WolfFlix.
- Bandes-annonces : données fournies par TMDB (module à venir).
