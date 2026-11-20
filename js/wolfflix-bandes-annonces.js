/* =====================================================================
   WolfFlix — Module « Bandes-annonces » (chargé par wolfflix-core.js)
   Ajoute un bouton « Bande-annonce » sur les fiches de films, séries,
   saisons et épisodes. La vidéo est cherchée sur TMDB : d'abord en
   français, sinon en anglais. Elle se lit dans un lecteur WolfFlix
   (YouTube intégré, sans cookies publicitaires).
   Nécessite une clé API TMDB (v3) dans WolfFlixConfig.tmdb.
   Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfBandesAnnonces) return;
    window.__wfBandesAnnonces = true;

    var config = window.WolfFlixConfig || {};
    var cle = String(config.tmdb || '').trim();
    if (!cle) return;

    var html = document.documentElement;
    html.classList.add('wf-ba-actif');

    var TMDB = 'https://api.themoviedb.org/3/';
    var trouvees = {};      // id Jellyfin → Promise<{ cle, langue, nom } | null>

    function api() {
        var a = window.ApiClient;
        return a && a.getCurrentUserId && a.getCurrentUserId() ? a : null;
    }
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function tmdb(chemin, params) {
        var q = 'api_key=' + encodeURIComponent(cle);
        Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
        return fetch(TMDB + chemin + '?' + q).then(function (r) {
            if (!r.ok) throw new Error('TMDB ' + r.status);
            return r.json();
        });
    }

    function meilleure(resultats) {
        var yt = (resultats || []).filter(function (v) { return v.site === 'YouTube' && v.key; });
        function score(v) {
            var s = 0;
            if (v.type === 'Trailer') s += 100;
            else if (v.type === 'Teaser') s += 50;
            else return -1;
            if (v.official) s += 20;
            if (v.size >= 1080) s += 5;
            return s;
        }
        yt = yt.filter(function (v) { return score(v) >= 0; });
        yt.sort(function (a, b) {
            return score(b) - score(a) || String(b.published_at || '').localeCompare(String(a.published_at || ''));
        });
        return yt[0] || null;
    }

    // Retrouve l'identifiant TMDB (film ou série) d'un élément Jellyfin
    function cible(item) {
        var a = api();
        var ids = item.ProviderIds || {};
        if (item.Type === 'Movie') {
            if (ids.Tmdb) return Promise.resolve({ type: 'movie', id: ids.Tmdb });
            if (ids.Imdb) return parImdb(ids.Imdb, 'movie_results', 'movie');
            return Promise.resolve(null);
        }
        if (item.Type === 'Series') {
            if (ids.Tmdb) return Promise.resolve({ type: 'tv', id: ids.Tmdb });
            if (ids.Imdb) return parImdb(ids.Imdb, 'tv_results', 'tv');
            if (ids.Tvdb) return parExterne(ids.Tvdb, 'tvdb_id', 'tv_results', 'tv');
            return Promise.resolve(null);
        }
        if ((item.Type === 'Season' || item.Type === 'Episode') && item.SeriesId) {
            return a.getItem(a.getCurrentUserId(), item.SeriesId).then(cible);
        }
        return Promise.resolve(null);
    }
    function parImdb(imdb, champ, type) { return parExterne(imdb, 'imdb_id', champ, type); }
    function parExterne(id, source, champ, type) {
        return tmdb('find/' + id, { external_source: source }).then(function (r) {
            var t = r[champ] && r[champ][0];
            return t ? { type: type, id: t.id } : null;
        }).catch(function () { return null; });
    }

    function chercher(item) {
        if (trouvees[item.Id]) return trouvees[item.Id];
        trouvees[item.Id] = cible(item).then(function (c) {
            if (!c) return null;
            var base = c.type + '/' + c.id + '/videos';
            return tmdb(base, { language: 'fr-FR' }).then(function (r) {
                var v = meilleure(r.results);
                if (v) return { cle: v.key, langue: 'VF', nom: v.name };
                return tmdb(base, { language: 'en-US' }).then(function (r2) {
                    var v2 = meilleure(r2.results);
                    return v2 ? { cle: v2.key, langue: 'VO', nom: v2.name } : null;
                });
            });
        }).catch(function () {
            delete trouvees[item.Id];
            return null;
        });
        return trouvees[item.Id];
    }

    /* ---------- Lecteur WolfFlix ---------- */
    function ouvrir(ba, titre) {
        var fond = document.createElement('div');
        fond.className = 'wf-ba-fond';
        fond.innerHTML = '<div class="wf-ba" role="dialog" aria-modal="true" aria-label="Bande-annonce">' +
            '<div class="wf-ba-haut"><div><p class="wf-ba-surtitre">Bande-annonce · ' + ba.langue + '</p>' +
            '<h2 class="wf-ba-titre">' + esc(titre) + '</h2></div>' +
            '<button type="button" class="wf-ba-fermer" aria-label="Fermer"><span class="material-icons close"></span></button></div>' +
            '<div class="wf-ba-video"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ba.cle) +
            '?autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=fr&cc_lang_pref=fr" title="' + esc(ba.nom || titre) + '"' +
            ' allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
            '<p class="wf-ba-mention"><span class="wf-ba-tmdb">TMDB</span> Ce produit utilise l\'API TMDB mais n\'est ni approuvé ni certifié par TMDB.</p>' +
            '</div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
            document.removeEventListener('keydown', clavier, true);
        }
        function clavier(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }
        document.addEventListener('keydown', clavier, true);
        fond.addEventListener('click', function (e) {
            if (e.target === fond || e.target.closest('.wf-ba-fermer')) fermer();
        });
        window.addEventListener('wf-route', fermer, { once: true });
    }

    /* ---------- Bouton sur la fiche ---------- */
    var enCours = {};
    var elements = {};
    var sans = {};
    function element(id) {
        var a = api();
        if (!elements[id]) {
            elements[id] = a.getItem(a.getCurrentUserId(), id);
            elements[id].catch(function () { delete elements[id]; });
        }
        return elements[id];
    }
    function fiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || !api()) return;
        var id = m[1];
        var page = document.querySelector('#itemDetailPage:not(.hide)');
        var boutons = page && page.querySelector('.mainDetailButtons');
        if (!boutons || boutons.offsetParent === null) return;
        var existant = boutons.querySelector('.wf-btn-ba');
        if (existant && existant.getAttribute('data-id') === id) return;
        if (existant) existant.remove();
        if (enCours[id] || sans[id]) return;
        enCours[id] = true;
        element(id).then(function (item) {
            return chercher(item).then(function (ba) {
                if (!ba) { sans[id] = true; return; }
                var p = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons');
                if (!p || p.querySelector('.wf-btn-ba[data-id="' + id + '"]')) return;
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'button-flat detailButton emby-button wf-btn-ba';
                b.setAttribute('data-id', id);
                b.title = 'Bande-annonce (' + ba.langue + ')';
                b.innerHTML = '<div class="detailButton-content"><span class="material-icons detailButton-icon theaters" aria-hidden="true"></span></div>';
                b.addEventListener('click', function () { ouvrir(ba, item.Name); });
                var lecture = p.querySelector('.btnPlay:not(.hide), .btnResume:not(.hide)');
                if (lecture && lecture.nextSibling) p.insertBefore(b, lecture.nextSibling);
                else p.appendChild(b);
            });
        }).catch(function () { /* rien */ }).then(function () { delete enCours[id]; });
    }

    var prevu = false;
    function passer() {
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () { prevu = false; fiche(); });
    }
    window.addEventListener('wf-route', passer);
    new MutationObserver(passer).observe(document.body, { childList: true, subtree: true });
    passer();
})();
