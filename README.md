# WolfFlix — thème « Sang et acier » pour Jellyfin

Thème personnel pour l'interface web de Jellyfin 12.4 : dark fantasy, palette sang et acier, blason au loup.

## Modules

| Fichier | Contenu | Type |
|---|---|---|
| `css/00-fondations.css` | Palette, polices, curseurs, barre de défilement, sélection | CSS seul |
| `css/10-identite.css` | Blason dans l'en-tête et sur la connexion, loup de chargement, fond | CSS seul |
| `css/20-navigation.css` | Barre du haut, onglets, menus *(à venir)* | CSS seul |
| `css/30-accueil.css` | Rangées, cartes, carte agrandie *(à venir)* | CSS (+ JS) |
| `css/40-fiches.css` | Fiches film, série, saison, distribution *(à venir)* | CSS (+ JS) |
| `css/50-lecteur.css` | Lecteur, barre au loup, volume *(à venir)* | CSS seul |
| `js/…` | Modules JavaScript Injector *(à venir)* | JavaScript |

## Installation

Dans Jellyfin : **Tableau de bord → Général → Code CSS personnalisé**, coller :

```css
/* WolfFlix — thème Sang et acier */
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.1.0/css/00-fondations.css");
@import url("https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.1.0/css/10-identite.css");
```

Puis **Enregistrer**, et recharger la page (Ctrl + F5).

## Désactiver ou revenir en arrière

- **Un module** : mettre sa ligne en commentaire, par exemple
  `/* @import url(".../10-identite.css"); */`
- **Revenir à une version précédente** : remplacer `@v0.1.0` par l'ancienne version dans les lignes `@import`.
- **Tout le thème** : vider le champ Code CSS personnalisé, ou y recoller l'ancienne sauvegarde.
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
