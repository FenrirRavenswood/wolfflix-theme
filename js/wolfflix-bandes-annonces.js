/* =====================================================================
   WolfFlix — Module « Bandes-annonces » (chargé par wolfflix-core.js)
   Bouton « Bande-annonce » sur les fiches :
   - film : bande-annonce du film ;
   - série : bande-annonce de la saison 1 (sinon de la série) ;
   - saison / épisode : bande-annonce de cette saison (sinon de la série).
   Recherche sur TMDB : vidéos françaises d'abord, anglaises ensuite.
   Si YouTube refuse une vidéo (supprimée, privée, intégration interdite),
   le lecteur passe tout seul à la suivante.
   Nécessite une clé API TMDB (v3) dans WolfFlixConfig.tmdb.
   Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfBandesAnnonces) return;
    window.__wfBandesAnnonces = true;

    var config = window.WolfFlixConfig || {};
    var cle = String(config.tmdb || '').trim();
    if (!cle || /COLLE_TA_CLE/.test(cle)) return;

    var html = document.documentElement;
    html.classList.add('wf-ba-actif');

    var TMDB = 'https://api.themoviedb.org/3/';
    var trouvees = {};

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

    /* Toutes les vidéos utilisables, triées : VF d'abord, bande-annonce > teaser, officielle, récente */
    function candidats(resultats) {
        function score(v) {
            var s = 0;
            if (v.type === 'Trailer') s += 100;
            else if (v.type === 'Teaser') s += 50;
            else return -1;
            if (v.iso_639_1 === 'fr') s += 1000;
            if (v.official) s += 20;
            if (v.size >= 1080) s += 5;
            return s;
        }
        return (resultats || [])
            .filter(function (v) { return v.site === 'YouTube' && v.key && score(v) >= 0; })
            .sort(function (a, b) {
                return score(b) - score(a) || String(b.published_at || '').localeCompare(String(a.published_at || ''));
            })
            .map(function (v) { return { cle: v.key, langue: v.iso_639_1 === 'fr' ? 'VF' : 'VO', nom: v.name }; });
    }
    function videos(chemin, portee) {
        return tmdb(chemin, { language: 'fr-FR', include_video_language: 'fr,en,null' })
            .then(function (r) {
                return candidats(r.results).map(function (v) { v.portee = portee; return v; });
            })
            .catch(function () { return []; });
    }
    /* Toujours la VF d'abord (jusqu'à 10 vidéos), la VO seulement ensuite, en secours */
    function vfDabord(listes) {
        var tout = [].concat.apply([], listes);
        var vus = {};
        tout = tout.filter(function (v) { if (vus[v.cle]) return false; vus[v.cle] = true; return true; });
        var vf = tout.filter(function (v) { return v.langue === 'VF'; }).slice(0, 10);
        var vo = tout.filter(function (v) { return v.langue === 'VO'; }).slice(0, 5);
        return vf.concat(vo);
    }

    function parExterne(id, source, champ, type) {
        return tmdb('find/' + id, { external_source: source }).then(function (r) {
            var t = r[champ] && r[champ][0];
            return t ? { type: type, id: t.id } : null;
        }).catch(function () { return null; });
    }
    function idTmdb(item) {
        var ids = item.ProviderIds || {};
        if (item.Type === 'Movie') {
            if (ids.Tmdb) return Promise.resolve({ type: 'movie', id: ids.Tmdb });
            if (ids.Imdb) return parExterne(ids.Imdb, 'imdb_id', 'movie_results', 'movie');
            return Promise.resolve(null);
        }
        if (item.Type === 'Series') {
            if (ids.Tmdb) return Promise.resolve({ type: 'tv', id: ids.Tmdb });
            if (ids.Imdb) return parExterne(ids.Imdb, 'imdb_id', 'tv_results', 'tv');
            if (ids.Tvdb) return parExterne(ids.Tvdb, 'tvdb_id', 'tv_results', 'tv');
        }
        return Promise.resolve(null);
    }

    function chercher(item) {
        if (trouvees[item.Id]) return trouvees[item.Id];
        var a = api();
        var p;
        if (item.Type === 'Movie') {
            p = idTmdb(item).then(function (c) { return c ? videos('movie/' + c.id + '/videos', 'film').then(function (l) { return vfDabord([l]); }) : []; });
        } else if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode') {
            var saison = item.Type === 'Series' ? 1 : item.Type === 'Season' ? item.IndexNumber : item.ParentIndexNumber;
            var serie = item.Type === 'Series' ? Promise.resolve(item) : a.getItem(a.getCurrentUserId(), item.SeriesId);
            p = serie.then(idTmdb).then(function (c) {
                if (!c) return [];
                var parSaison = saison > 0 ? videos('tv/' + c.id + '/season/' + saison + '/videos', 'saison') : Promise.resolve([]);
                return Promise.all([parSaison, videos('tv/' + c.id + '/videos', 'serie')]).then(function (r) {
                    // Ordre : VF de la saison, VF de la série, puis VO de la saison, VO de la série
                    return vfDabord([r[0], r[1]]);
                });
            });
        } else {
            p = Promise.resolve([]);
        }
        trouvees[item.Id] = p.then(function (l) { return l.slice(0, 15); }).catch(function () {
            delete trouvees[item.Id];
            return [];
        });
        return trouvees[item.Id];
    }

    /* ---------- API YouTube (pour détecter les vidéos indisponibles) ---------- */
    var apiYt = null;
    function chargerApiYt() {
        if (apiYt) return apiYt;
        apiYt = new Promise(function (ok) {
            if (window.YT && window.YT.Player) { ok(window.YT); return; }
            var avant = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof avant === 'function') avant();
                ok(window.YT);
            };
            var s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.onerror = function () { ok(null); };
            document.head.appendChild(s);
            setTimeout(function () { ok(window.YT && window.YT.Player ? window.YT : null); }, 6000);
        });
        return apiYt;
    }

    /* ---------- Lecteur WolfFlix ---------- */
    function ouvrir(liste, titre) {
        var index = 0;
        var fond = document.createElement('div');
        fond.className = 'wf-ba-fond';
        fond.innerHTML = '<div class="wf-ba" role="dialog" aria-modal="true" aria-label="Bande-annonce">' +
            '<div class="wf-ba-haut"><div><p class="wf-ba-surtitre"></p>' +
            '<h2 class="wf-ba-titre">' + esc(titre) + '</h2></div>' +
            '<button type="button" class="wf-ba-fermer" aria-label="Fermer"><span class="material-icons close"></span></button></div>' +
            '<div class="wf-ba-video"></div>' +
            '<div class="wf-ba-bas"><p class="wf-ba-mention"><span class="wf-ba-tmdb">TMDB</span> Ce produit utilise l\'API TMDB mais n\'est ni approuvé ni certifié par TMDB.</p>' +
            '<span class="wf-ba-liens"></span></div></div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var cadre = fond.querySelector('.wf-ba-video');
        var surtitre = fond.querySelector('.wf-ba-surtitre');
        var liens = fond.querySelector('.wf-ba-liens');
        var joueur = null;

        function echec() {
            cadre.innerHTML = '<div class="wf-ba-echec"><span class="material-icons videocam_off" aria-hidden="true"></span>' +
                '<p>Aucune bande-annonce lisible ici pour l\'instant.</p>' +
                '<a class="wf-btn wf-btn-sec" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=' +
                encodeURIComponent(titre + ' bande annonce VF') + '">Chercher sur YouTube</a></div>';
            surtitre.textContent = 'Bande-annonce';
            liens.innerHTML = '';
        }
        function charger() {
            if (index >= liste.length) { echec(); return; }
            var v = liste[index];
            surtitre.textContent = 'Bande-annonce · ' + v.langue + (v.portee === 'saison' ? ' · saison' : v.portee === 'serie' ? ' · série' : '') +
                (liste.length > 1 ? ' · ' + (index + 1) + '/' + liste.length : '');
            liens.innerHTML = (index + 1 < liste.length ? '<button type="button" class="wf-ba-autre"><span class="material-icons skip_next" aria-hidden="true"></span> Autre vidéo</button>' : '') +
                '<a class="wf-ba-youtube" href="https://www.youtube.com/watch?v=' + encodeURIComponent(v.cle) + '" target="_blank" rel="noopener">' +
                '<span class="material-icons open_in_new" aria-hidden="true"></span> YouTube</a>';
            if (joueur && joueur.destroy) { try { joueur.destroy(); } catch (e) { /* déjà détruit */ } }
            joueur = null;
            cadre.innerHTML = '<iframe id="wf-ba-iframe" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.cle) +
                '?autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=fr&cc_lang_pref=fr&enablejsapi=1&origin=' + encodeURIComponent(location.origin) +
                '" title="' + esc(v.nom || titre) + '"' +
                // Jellyfin interdit le « referrer » ; YouTube l'exige (erreur 153) : autorisé pour ce lecteur seulement
                ' referrerpolicy="strict-origin-when-cross-origin"' +
                ' allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
            var iframe = cadre.querySelector('iframe');
            chargerApiYt().then(function (YT) {
                if (!YT || !iframe.isConnected) return;
                try {
                    joueur = new YT.Player(iframe, {
                        events: {
                            onError: function () { index++; charger(); }
                        }
                    });
                } catch (e) { /* lecture sans détection */ }
            });
        }
        function fermer() {
            if (joueur && joueur.destroy) { try { joueur.destroy(); } catch (e) { /* rien */ } }
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
            document.removeEventListener('keydown', clavier, true);
            window.removeEventListener('wf-route', fermer);
        }
        function clavier(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }
        document.addEventListener('keydown', clavier, true);
        fond.addEventListener('click', function (e) {
            if (e.target === fond || e.target.closest('.wf-ba-fermer')) fermer();
            else if (e.target.closest('.wf-ba-autre')) { index++; charger(); }
        });
        window.addEventListener('wf-route', fermer);
        charger();
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
            return chercher(item).then(function (liste) {
                if (!liste.length) { sans[id] = true; return; }
                var p = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons');
                if (!p || p.querySelector('.wf-btn-ba[data-id="' + id + '"]')) return;
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'wf-btn-ba';
                b.setAttribute('data-id', id);
                var numSaison = item.Type === 'Series' ? 1 : item.Type === 'Season' ? item.IndexNumber : item.ParentIndexNumber;
                var etiquette = liste[0].portee === 'saison' ? 'Saison ' + numSaison : liste[0].portee === 'serie' ? 'Série' : '';
                b.title = 'Bande-annonce' + (etiquette ? ' — ' + etiquette : '') + ' (' + liste[0].langue + ')';
                b.innerHTML = '<span class="wf-btn-ba-icone"><span class="material-icons play_arrow" aria-hidden="true"></span></span>' +
                    '<span class="wf-btn-ba-texte">Bande-annonce' + (etiquette ? ' <small>' + etiquette + '</small>' : '') + '</span>' +
                    '<span class="wf-btn-ba-langue">' + liste[0].langue + '</span>';
                var nomSerie = item.Type === 'Series' ? item.Name : (item.SeriesName || item.Name);
                var nom = item.Type === 'Movie' ? item.Name : nomSerie + (etiquette ? ' — ' + etiquette : '');
                b.addEventListener('click', function () { ouvrir(liste, nom); });
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
