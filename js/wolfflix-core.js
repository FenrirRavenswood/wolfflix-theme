/* =====================================================================
   WolfFlix — Module JS « cœur » (JavaScript Injector)
   - Icônes du site (favicon, écran d'accueil du téléphone)
   - Thème du tableau de bord (Jellyfin n'y charge pas le CSS personnalisé)
   - Repère de la page d'accueil (masque les doublons de la barre du haut)
   - Tuiles « Sagas », « Cycles » et « Favoris » parmi les grandes tuiles de l'accueil
   - Signet de sang sur les affiches en favori
   - « Vu » coché : remet la lecture à zéro et retire la carte de « Continuer »
   - Liens « Sagas » et « Cycles » dans la barre du haut
   - « À suivre » sans limite de temps
   - Charge les modules Sagas & Cycles, Bandes-annonces, Séries, Lecteur et Infos des livres
   - Traînée d'empreintes derrière le curseur (ordinateur uniquement)
   - Inclinaison des affiches vers la souris (ordinateur uniquement)
   Désactiver : décocher le script dans Tableau de bord → JS Injector.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wolfflixCore) return;
    window.__wolfflixCore = true;

    var VERSION = 'v2.5.0';
    var BASE = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@' + VERSION + '/';
    var html = document.documentElement;
    var reduitMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var sourisPrecise = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* ---------- 1. Icônes du site ---------- */
    function poserIcone(rel, href, sizes) {
        var lien = document.querySelector('link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : ''));
        if (!lien) {
            lien = document.createElement('link');
            lien.rel = rel;
            if (sizes) lien.sizes = sizes;
            document.head.appendChild(lien);
        }
        if (lien.href !== href) lien.href = href;
    }

    function icones() {
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(function (l) {
            l.href = BASE + 'assets/icones/favicon.ico';
        });
        poserIcone('icon', BASE + 'assets/icones/favicon.ico');
        poserIcone('apple-touch-icon', BASE + 'assets/icones/apple-touch-icon-180.png');
        var couleur = document.querySelector('meta[name="theme-color"]');
        if (couleur) couleur.content = '#0A0A0C';
    }

    /* ---------- 2. Routes : accueil et tableau de bord ---------- */
    var CSS_TABLEAU = ['css/00-fondations.css', 'css/60-tableau-de-bord.css'];

    function cssTableau(actif) {
        CSS_TABLEAU.forEach(function (chemin, i) {
            var id = 'wf-tableau-css-' + i;
            var lien = document.getElementById(id);
            if (actif && !lien) {
                lien = document.createElement('link');
                lien.id = id;
                lien.rel = 'stylesheet';
                lien.href = BASE + chemin;
                document.head.appendChild(lien);
            } else if (!actif && lien) {
                lien.remove();
            }
        });
    }

    var dernierHash = null;
    function route() {
        var h = location.hash || '';
        if (h !== dernierHash) elements = {};
        dernierHash = h;
        var tableau = /^#\/(dashboard|metadata|configurationpage)/.test(h);
        var accueil = (h === '' || h === '#/' || /^#\/home(\?|$)/.test(h)) && !/[?&](tab=1|wf=)/.test(h);
        html.classList.toggle('wf-tableau', tableau);
        try { window.dispatchEvent(new CustomEvent('wf-route', { detail: h })); } catch (e) { /* ancien navigateur */ }
        html.classList.toggle('wf-accueil', accueil);
        html.classList.toggle('wf-favoris', /^#\/home\?(?:[^#]*&)?tab=1/.test(h));
        cssTableau(tableau);
    }

    /* ---------- 3. Tuiles « Sagas », « Cycles », « Favoris » sur l'accueil ---------- */
    var TUILES = [
        { cle: 'sagas', href: '#/home?wf=sagas', icone: 'theaters', texte: 'Sagas' },
        { cle: 'cycles', href: '#/home?wf=cycles', icone: 'all_inclusive', texte: 'Cycles' },
        { cle: 'favoris', href: '#/home?tab=1', icone: 'favorite', texte: 'Favoris' }
    ];
    function tuiles() {
        if (!html.classList.contains('wf-accueil')) return;
        document.querySelectorAll('.homeLibraryButtonContainer').forEach(function (c) {
            TUILES.forEach(function (t) {
                if (c.querySelector('.wf-tuile-' + t.cle)) return;
                var a = document.createElement('a');
                a.setAttribute('is', 'emby-linkbutton');
                a.href = t.href;
                a.className = 'raised homeLibraryButton emby-button wf-tuile wf-tuile-' + t.cle;
                a.innerHTML = '<span class="material-icons homeLibraryIcon ' + t.icone + '" aria-hidden="true"></span><span class="homeLibraryText">' + t.texte + '</span>';
                c.appendChild(a);
            });
        });
    }

    /* ---------- 3a. Liens « Sagas » et « Cycles » dans la barre du haut ---------- */
    var LIENS_NAV = [
        { cle: 'sagas', href: '#/home?wf=sagas', icone: 'theaters', texte: 'Sagas' },
        { cle: 'cycles', href: '#/home?wf=cycles', icone: 'all_inclusive', texte: 'Cycles' }
    ];
    function liensNav() {
        var modele = document.querySelector('.MuiToolbar-root a.MuiButton-root[href$="/home?tab=1"]');
        if (!modele || !modele.parentNode) return;
        var parent = modele.parentNode;
        var h = location.hash || '';
        LIENS_NAV.forEach(function (l) {
            var a = parent.querySelector(':scope > .wf-nav-' + l.cle);
            if (!a) {
                a = modele.cloneNode(true);
                a.classList.add('wf-nav', 'wf-nav-' + l.cle);
                a.classList.remove('MuiButton-colorPrimary', 'MuiButton-textPrimary', 'Mui-selected');
                a.classList.add('MuiButton-colorInherit', 'MuiButton-textInherit');
                a.setAttribute('href', l.href);
                a.removeAttribute('aria-current');
                var icone = a.querySelector('.MuiButton-startIcon');
                Array.prototype.slice.call(a.childNodes).forEach(function (n) { if (n !== icone) a.removeChild(n); });
                if (icone) icone.innerHTML = '<span class="material-icons" aria-hidden="true">' + l.icone + '</span>';
                a.appendChild(document.createTextNode(l.texte));
                parent.appendChild(a);
            } else if (a !== parent.lastElementChild && a.nextElementSibling && !a.nextElementSibling.classList.contains('wf-nav')) {
                parent.appendChild(a);
            }
            a.classList.toggle('wf-nav-actif', h.indexOf('wf=' + l.cle) !== -1);
        });
        // L'ordre : Sagas puis Cycles, toujours à la fin
        var sagas = parent.querySelector(':scope > .wf-nav-sagas');
        var cycles = parent.querySelector(':scope > .wf-nav-cycles');
        if (sagas && cycles && sagas.nextElementSibling !== cycles) parent.insertBefore(sagas, cycles);
    }

    /* ---------- 3b. API Jellyfin (petits utilitaires) ---------- */
    function api() { return window.ApiClient && window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId() ? window.ApiClient : null; }

    /* ---------- 3c. Signet de sang sur les favoris ---------- */
    var favoris = null;          // ensemble des Id en favori
    var favorisCharge = 0;
    function chargerFavoris(force) {
        var a = api();
        if (!a) return;
        if (!force && Date.now() - favorisCharge < 60000) return;
        favorisCharge = Date.now();
        a.getJSON(a.getUrl('Users/' + a.getCurrentUserId() + '/Items', {
            Recursive: true, Filters: 'IsFavorite', Fields: 'ParentId',
            EnableImages: false, EnableUserData: false,
            IncludeItemTypes: 'Movie,Series,Season,Episode,BoxSet,Video,MusicAlbum,Book'
        })).then(function (r) {
            favoris = {};
            (r.Items || []).forEach(function (i) { favoris[i.Id] = true; });
            marquerFavoris(true);
        }).catch(function () { /* hors ligne : on réessaiera */ });
    }
    var versionFavoris = 0;
    function marquerFavoris(tout) {
        if (!favoris) return;
        if (tout) versionFavoris++;
        var v = String(versionFavoris);
        // Seules les cartes nouvelles (ou toutes si la liste a changé) sont examinées
        document.querySelectorAll('.card[data-id]:not([data-wf-fav="' + v + '"])').forEach(function (carte) {
            carte.setAttribute('data-wf-fav', v);
            var est = !!favoris[carte.getAttribute('data-id')];
            var scal = carte.querySelector('.cardScalable');
            if (!scal) return;
            var signet = scal.querySelector(':scope > .wf-signet');
            if (est && !signet) {
                signet = document.createElement('span');
                signet.className = 'wf-signet';
                signet.setAttribute('aria-hidden', 'true');
                signet.innerHTML = '<span class="material-icons favorite"></span>';
                scal.appendChild(signet);
            } else if (!est && signet) {
                signet.remove();
            }
        });
        var m = /[?&]id=([0-9a-f]{32})/i.exec(location.hash);
        var affiche = document.querySelector('.detailImageContainer .card');
        if (m && affiche && affiche.getAttribute('data-id') !== m[1]) {
            affiche.setAttribute('data-id', m[1]);
            affiche.removeAttribute('data-wf-fav');
        }
    }

    /* Sceau « Vu » : la classe est posée une seule fois par indicateur (bien plus léger que :has) */
    function marquerVus() {
        document.querySelectorAll('.playedIndicator:not([data-wf-vu])').forEach(function (ind) {
            ind.setAttribute('data-wf-vu', '');
            var c = ind.closest('.cardImageContainer');
            if (c) c.classList.add('wf-vu');
        });
    }

    /* ---------- 3d. Clics sur « Vu » et « Favori » ---------- */
    function remettreAZero(id) {
        var a = api();
        if (!a) return;
        var corps = JSON.stringify({ PlaybackPositionTicks: 0 });
        a.ajax({
            type: 'POST', contentType: 'application/json', data: corps,
            url: a.getUrl('UserItems/' + id + '/UserData', { userId: a.getCurrentUserId() })
        }).catch(function () {
            return a.ajax({
                type: 'POST', contentType: 'application/json', data: corps,
                url: a.getUrl('Users/' + a.getCurrentUserId() + '/Items/' + id + '/UserData')
            });
        }).catch(function () { /* sans gravité */ });
    }
    function retirerDeContinuer(id) {
        document.querySelectorAll('.itemsContainer[data-monitor*="videoplayback"] .card[data-id="' + id + '"]').forEach(function (c) {
            var sec = c.closest('.verticalSection');
            if (sec && sec.querySelector('a[href*="nextup"]')) return;
            c.classList.add('wf-retrait');
            setTimeout(function () { c.remove(); }, 450);
        });
    }
    function surClic(e) {
        var bouton = e.target.closest && e.target.closest('button[is="emby-playstatebutton"], button[is="emby-ratingbutton"]');
        if (!bouton) return;
        var id = bouton.getAttribute('data-id');
        if (!id) return;
        var lecture = bouton.getAttribute('is') === 'emby-playstatebutton';
        // Le bouton garde le focus après le clic : on le relâche pour que la carte se repose
        setTimeout(function () { if (document.activeElement === bouton) bouton.blur(); }, 0);
        delete elements[id];
        setTimeout(function () {
            if (lecture) {
                if (bouton.classList.contains('playstatebutton-played')) {
                    remettreAZero(id);
                    retirerDeContinuer(id);
                }
            } else {
                var icone = bouton.querySelector('.material-icons');
                var est = !!(icone && icone.classList.contains('ratingbutton-icon-withrating'));
                if (!favoris) favoris = {};
                if (est) favoris[id] = true; else delete favoris[id];
                marquerFavoris(true);
            }
        }, 500);
    }

    /* ---------- 3d bis. « À suivre » sans limite de temps ----------
       Jellyfin retire une série de « À suivre » après 365 jours sans visionnage
       (réglage local à chaque navigateur). On le pousse à 100 ans. */
    function aSuivreSansLimite() {
        var a = api();
        if (!a) return;
        try {
            var cle = a.getCurrentUserId() + '-maxDaysForNextUp';
            if (localStorage.getItem(cle) !== '36500') localStorage.setItem(cle, '36500');
        } catch (e) { /* stockage indisponible */ }
    }

    /* ---------- 3e. Module Sagas & Cycles ---------- */
    function chargerModules() {
        window.WolfFlix = {
            VERSION: VERSION,
            BASE: BASE,
            abonner: function (fn) { abonnes.push(fn); planifier(); },
            planifier: planifier,
            element: element,
            oublierElement: function (id) { delete elements[id]; },
            utilisateur: utilisateurCourant,
            quandCalme: quandCalme
        };
        var config = window.WolfFlixConfig || {};
        var modules = [];
        if (config.sagas !== false) modules.push('sagas');
        if (config.bandesAnnonces !== false) modules.push('bandes-annonces');
        if (config.series !== false) modules.push('series');
        if (config.lecteur !== false) modules.push('lecteur');
        if (config.livresInfos !== false) modules.push('livres-infos');
        modules.forEach(function (nom) {
            var id = 'wf-js-' + nom;
            if (document.getElementById(id)) return;
            var s = document.createElement('script');
            s.id = id;
            s.src = BASE + 'js/wolfflix-' + nom + '.js';
            s.defer = true;
            document.head.appendChild(s);
        });
    }

    /* ---------- Surveillance légère des changements de page ---------- */
    /* ---------- Planificateur partagé (un seul observateur pour tous les modules) ----------
       Les changements de page déclenchent des passages groupés, au plus ~8 fois par
       seconde, pendant les moments calmes du navigateur. */
    var abonnes = [];
    var prevu = false;
    var dernierPassage = 0;
    function passage() {
        prevu = false;
        dernierPassage = Date.now();
        if ((location.hash || '') !== dernierHash) route();
        tuiles();
        liensNav();
        marquerVus();
        titresComplets();
        if (favoris) marquerFavoris(); else chargerFavoris();
        for (var i = 0; i < abonnes.length; i++) {
            try { abonnes[i](); } catch (e) { /* un module en erreur ne bloque pas les autres */ }
        }
    }
    /* Titre complet au survol, pour les titres encore trop longs même sur deux lignes */
    function titresComplets() {
        document.querySelectorAll('.cardText-first, .listItemBodyText, .nameContainer .itemName').forEach(function (t) {
            var texte = (t.textContent || '').trim();
            if (t.getAttribute('data-wf-titre') === texte) return;
            t.setAttribute('data-wf-titre', texte);
            if (texte) t.setAttribute('title', texte); else t.removeAttribute('title');
        });
    }
    function planifier() {
        if (prevu) return;
        prevu = true;
        var attente = Math.max(0, 120 - (Date.now() - dernierPassage));
        setTimeout(function () { requestAnimationFrame(passage); }, attente);
    }

    /* Cache partagé des éléments Jellyfin (une seule requête par fiche pour tous les modules) */
    var elements = {};
    function element(id) {
        var a = api();
        if (!a) return Promise.reject(new Error('hors connexion'));
        if (!elements[id]) {
            elements[id] = a.getItem(a.getCurrentUserId(), id);
            elements[id].catch(function () { delete elements[id]; });
        }
        return elements[id];
    }
    var utilisateur = null;
    function utilisateurCourant() {
        var a = api();
        if (!a) return Promise.reject(new Error('hors connexion'));
        if (!utilisateur) {
            utilisateur = a.getCurrentUser();
            utilisateur.catch(function () { utilisateur = null; });
        }
        return utilisateur;
    }
    function quandCalme(fn, delai) {
        setTimeout(function () {
            if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 4000 });
            else fn();
        }, delai || 0);
    }

    /* ---------- 4. Traînée d'empreintes derrière le curseur ---------- */
    function traineeEmpreintes() {
        if (!sourisPrecise || reduitMouvement) return;

        var toile = document.createElement('canvas');
        toile.id = 'wf-trainee';
        toile.setAttribute('aria-hidden', 'true');
        toile.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
        document.body.appendChild(toile);
        var ctx = toile.getContext('2d');
        var dpr = 1;

        function taille() {
            dpr = window.devicePixelRatio || 1;
            toile.width = Math.round(window.innerWidth * dpr);
            toile.height = Math.round(window.innerHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        taille();
        window.addEventListener('resize', taille, { passive: true });

        var pattes = [new Image(), new Image()];
        pattes[0].src = BASE + 'assets/img/patte-1.webp';
        pattes[1].src = BASE + 'assets/img/patte-2.webp';

        var empreintes = [];
        var precedent = null;
        var cumul = 0;
        var cote = 1;
        var boucle = 0;
        var DUREE = 1500;
        var ECART = 30;

        function dessiner() {
            boucle = 0;
            var maintenant = performance.now();
            ctx.clearRect(0, 0, toile.width / dpr, toile.height / dpr);
            empreintes = empreintes.filter(function (p) { return maintenant - p.t < DUREE; });
            for (var i = 0; i < empreintes.length; i++) {
                var p = empreintes[i];
                var img = pattes[p.img];
                if (!img.complete) continue;
                var u = (maintenant - p.t) / DUREE;
                ctx.save();
                ctx.globalAlpha = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.a);
                ctx.drawImage(img, -p.s / 2, -p.s / 2, p.s, p.s);
                ctx.restore();
            }
            if (empreintes.length) boucle = requestAnimationFrame(dessiner);
        }

        document.addEventListener('mousemove', function (e) {
            var x = e.clientX, y = e.clientY;
            if (precedent) {
                var dx = x - precedent.x, dy = y - precedent.y;
                cumul += Math.sqrt(dx * dx + dy * dy);
                if (cumul > ECART) {
                    cumul = 0;
                    cote = -cote;
                    var angle = Math.atan2(dy, dx);
                    empreintes.push({
                        x: x + Math.cos(angle + Math.PI / 2) * 7 * cote,
                        y: y + Math.sin(angle + Math.PI / 2) * 7 * cote,
                        a: angle + Math.PI / 2,
                        t: performance.now(),
                        img: cote > 0 ? 0 : 1,
                        s: 15 + Math.random() * 5
                    });
                    if (empreintes.length > 40) empreintes.shift();
                    if (!boucle) boucle = requestAnimationFrame(dessiner);
                }
            }
            precedent = { x: x, y: y };
        }, { passive: true });

        document.addEventListener('mouseleave', function () { precedent = null; }, { passive: true });
    }

    /* ---------- 5. Inclinaison des affiches vers la souris ---------- */
    function inclinaison() {
        if (!sourisPrecise || reduitMouvement) return;
        var carteActive = null;
        var attente = false;
        var dernier = null;

        function appliquer() {
            attente = false;
            if (!dernier) return;
            var e = dernier;
            var scalable = e.target && e.target.closest ? e.target.closest('.card:not(.personCard) .cardScalable') : null;
            var carte = scalable ? scalable.closest('.card') : null;
            if (carteActive && carteActive !== carte) {
                carteActive.style.removeProperty('--wf-rx');
                carteActive.style.removeProperty('--wf-ry');
            }
            carteActive = carte;
            if (!carte) return;
            var r = scalable.getBoundingClientRect();
            var x = (e.clientX - r.left) / r.width - 0.5;
            var y = (e.clientY - r.top) / r.height - 0.5;
            carte.style.setProperty('--wf-ry', (x * 14).toFixed(2) + 'deg');
            carte.style.setProperty('--wf-rx', (-y * 14).toFixed(2) + 'deg');
        }

        document.addEventListener('mousemove', function (e) {
            dernier = e;
            if (!attente) {
                attente = true;
                requestAnimationFrame(appliquer);
            }
        }, { passive: true });
    }

    /* ---------- Démarrage ---------- */
    function demarrer() {
        icones();
        route();
        tuiles();
        window.addEventListener('hashchange', function () { route(); planifier(); });
        window.addEventListener('popstate', function () { route(); planifier(); });
        // Jellyfin navigue avec history.pushState, qui ne déclenche pas hashchange
        ['pushState', 'replaceState'].forEach(function (nom) {
            var orig = history[nom];
            if (typeof orig !== 'function') return;
            history[nom] = function () {
                var r = orig.apply(this, arguments);
                route(); planifier();
                return r;
            };
        });
        setInterval(function () { if ((location.hash || '') !== dernierHash) { route(); planifier(); } }, 700);
        new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
        traineeEmpreintes();
        inclinaison();
        document.addEventListener('click', surClic, true);
        window.addEventListener('wf-route', function () { chargerFavoris(false); aSuivreSansLimite(); });
        aSuivreSansLimite();
        chargerModules();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }
})();
