/* =====================================================================
   WolfFlix — Module JS « cœur » (JavaScript Injector)
   - Icônes du site (favicon, écran d'accueil du téléphone)
   - Thème du tableau de bord (Jellyfin n'y charge pas le CSS personnalisé)
   - Repère de la page d'accueil (masque les doublons de la barre du haut)
   - Tuile « Favoris » parmi les grandes tuiles de l'accueil
   - Traînée d'empreintes derrière le curseur (ordinateur uniquement)
   - Inclinaison des affiches vers la souris (ordinateur uniquement)
   Désactiver : décocher le script dans Tableau de bord → JS Injector.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wolfflixCore) return;
    window.__wolfflixCore = true;

    var VERSION = 'v0.3.0';
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

    function route() {
        var h = location.hash || '';
        var tableau = /^#\/(dashboard|metadata|configurationpage)/.test(h);
        var accueil = (h === '' || h === '#/' || /^#\/home(\?|$)/.test(h)) && !/[?&]tab=1/.test(h);
        html.classList.toggle('wf-tableau', tableau);
        html.classList.toggle('wf-accueil', accueil);
        cssTableau(tableau);
    }

    /* ---------- 3. Tuile « Favoris » sur l'accueil ---------- */
    function tuiles() {
        if (!html.classList.contains('wf-accueil')) return;
        var conteneurs = document.querySelectorAll('.homeLibraryButtonContainer');
        conteneurs.forEach(function (c) {
            if (c.querySelector('.wf-tuile-favoris')) return;
            var a = document.createElement('a');
            a.setAttribute('is', 'emby-linkbutton');
            a.href = '#/home?tab=1';
            a.className = 'raised homeLibraryButton emby-button wf-tuile wf-tuile-favoris';
            a.innerHTML = '<span class="material-icons homeLibraryIcon favorite" aria-hidden="true"></span><span class="homeLibraryText">Favoris</span>';
            c.appendChild(a);
        });
    }

    /* ---------- Surveillance légère des changements de page ---------- */
    var prevu = false;
    function planifier() {
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () {
            prevu = false;
            tuiles();
        });
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
        new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
        traineeEmpreintes();
        inclinaison();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }
})();
