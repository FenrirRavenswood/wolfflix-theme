/* =====================================================================
   WolfFlix — Module « Séries » (chargé par wolfflix-core.js)
   Sur la fiche d'une série :
   - pastille « En cours de diffusion » / « Terminée » ;
   - encart « Prochain épisode » (ou « Reprendre ») avec vignette et
     progression, qui mène à l'épisode ;
   - grille des notes des épisodes (saisons en colonnes), fermée par
     défaut ; les notes des épisodes non vus restent masquées tant
     qu'on ne les révèle pas (protection anti-spoil).
   Les notes viennent des métadonnées de Jellyfin (TMDB, TheTVDB ou
   IMDb via OMDb selon tes réglages de bibliothèque).
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfSeries) return;
    window.__wfSeries = true;

    var html = document.documentElement;

    function api() {
        var a = window.ApiClient;
        return a && a.getCurrentUserId && a.getCurrentUserId() ? a : null;
    }
    function uid() { return api().getCurrentUserId(); }
    function url(chemin, q) { return api().getUrl(chemin, q); }
    function json(chemin, q) { return api().getJSON(url(chemin, q)); }
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function lien(id) {
        var a = api();
        return '#/details?id=' + id + (a && a.serverId ? '&serverId=' + a.serverId() : '');
    }
    function minutes(ticks) { return Math.round((ticks || 0) / 600000000); }

    var memo = {};
    function une(cle, fn) {
        if (!memo[cle]) {
            memo[cle] = fn();
            memo[cle].catch(function () { delete memo[cle]; });
        }
        return memo[cle];
    }

    function page() {
        var p = document.querySelector('#itemDetailPage:not(.hide)');
        return p && p.offsetParent !== null ? p : null;
    }

    /* ---------- Pastille de statut ---------- */
    function statut(p, item) {
        var info = p.querySelector('.itemMiscInfo-primary') || p.querySelector('.itemMiscInfo');
        if (!info || info.querySelector('.wf-statut')) return;
        var texte = item.Status === 'Continuing' ? 'En cours de diffusion' : item.Status === 'Ended' ? 'Terminée' : '';
        if (!texte) return;
        var s = document.createElement('span');
        s.className = 'mediaInfoItem wf-statut ' + (item.Status === 'Continuing' ? 'wf-statut-encours' : 'wf-statut-finie');
        s.textContent = texte;
        info.appendChild(s);
    }

    /* ---------- Prochain épisode ---------- */
    function prochain(p, item) {
        if (p.querySelector('#wf-prochain[data-id="' + item.Id + '"]')) return;
        var hote = p.querySelector('#childrenCollapsible');
        if (!hote) return;
        une('suivant-' + item.Id, function () {
            return json('Shows/NextUp', {
                SeriesId: item.Id, UserId: uid(), Limit: 1, Fields: 'Overview',
                EnableImageTypes: 'Primary,Thumb', ImageTypeLimit: 1, EnableResumable: true
            });
        }).then(function (r) {
            var ep = r.Items && r.Items[0];
            var pp = page();
            if (!ep || !pp || pp.querySelector('#wf-prochain[data-id="' + item.Id + '"]')) return;
            var h = pp.querySelector('#childrenCollapsible');
            if (!h) return;
            var ud = ep.UserData || {};
            var reprise = ud.PlaybackPositionTicks > 0;
            var pct = reprise && ep.RunTimeTicks ? Math.min(100, ud.PlaybackPositionTicks / ep.RunTimeTicks * 100) : 0;
            var tag = ep.ImageTags && ep.ImageTags.Primary;
            var img = tag ? url('Items/' + ep.Id + '/Images/Primary', { fillWidth: 480, quality: 90, tag: tag }) : '';
            var bloc = document.createElement('a');
            bloc.id = 'wf-prochain';
            bloc.setAttribute('data-id', item.Id);
            bloc.href = lien(ep.Id);
            bloc.className = 'wf-prochain-encart';
            bloc.innerHTML = '<span class="wf-prochain-image"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' +
                '<span class="wf-prochain-lecture material-icons play_arrow" aria-hidden="true"></span>' +
                (reprise ? '<span class="wf-prochain-barre"><span style="width:' + pct.toFixed(1) + '%"></span></span>' : '') + '</span>' +
                '<span class="wf-prochain-texte"><span class="wf-prochain-surtitre">' + (reprise ? 'Reprendre' : 'Prochain épisode') + '</span>' +
                '<span class="wf-prochain-titre">S' + (ep.ParentIndexNumber || '?') + ' · É' + (ep.IndexNumber || '?') + ' — ' + esc(ep.Name) + '</span>' +
                (reprise ? '<span class="wf-prochain-info">Reprendre à ' + minutes(ud.PlaybackPositionTicks) + ' min sur ' + minutes(ep.RunTimeTicks) + '</span>' :
                    (ep.RunTimeTicks ? '<span class="wf-prochain-info">' + minutes(ep.RunTimeTicks) + ' min</span>' : '')) +
                (ep.Overview ? '<span class="wf-prochain-resume">' + esc(ep.Overview) + '</span>' : '') + '</span>';
            h.parentNode.insertBefore(bloc, h);
        }).catch(function () { /* rien */ });
    }

    /* ---------- Grille des notes ---------- */
    function niveau(n) {
        if (n >= 9) return 5;
        if (n >= 8) return 4;
        if (n >= 7) return 3;
        if (n >= 6) return 2;
        return 1;
    }

    function grille(p, item) {
        if (p.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
        une('episodes-' + item.Id, function () {
            return json('Shows/' + item.Id + '/Episodes', { UserId: uid(), EnableImages: false });
        }).then(function (r) {
            var pp = page();
            if (!pp || pp.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
            var hote = pp.querySelector('#childrenCollapsible');
            if (!hote) return;
            var eps = (r.Items || []).filter(function (e) {
                return e.ParentIndexNumber > 0 && e.IndexNumber > 0;
            });
            var notees = eps.filter(function (e) { return e.CommunityRating > 0; });
            if (notees.length < 2) return;

            var saisons = {};
            var maxEp = 0;
            eps.forEach(function (e) {
                (saisons[e.ParentIndexNumber] = saisons[e.ParentIndexNumber] || {})[e.IndexNumber] = e;
                if (e.IndexNumber > maxEp) maxEp = e.IndexNumber;
            });
            var nums = Object.keys(saisons).map(Number).sort(function (a, b) { return a - b; });
            var moyenne = notees.reduce(function (s, e) { return s + e.CommunityRating; }, 0) / notees.length;

            function cellule(e) {
                if (!e) return '<td class="wf-note-vide"></td>';
                var n = e.CommunityRating;
                var vu = !!(e.UserData && e.UserData.Played);
                if (!(n > 0)) return '<td class="wf-note-sans"><a href="' + lien(e.Id) + '" aria-label="Épisode ' + e.IndexNumber + '">–</a></td>';
                return '<td class="wf-note wf-note-' + niveau(n) + (vu ? ' wf-note-vue' : ' wf-note-cachee') + '">' +
                    '<a href="' + lien(e.Id) + '"' + (vu ? ' title="' + esc(e.Name) + '"' : '') + '>' + n.toFixed(1) + '</a></td>';
            }

            var corps = '';
            for (var k = 1; k <= maxEp; k++) {
                corps += '<tr><th scope="row">É' + k + '</th>' + nums.map(function (s) { return cellule(saisons[s][k]); }).join('') + '</tr>';
            }
            var moyennes = '<tr class="wf-note-moyennes"><th scope="row">Moy.</th>' + nums.map(function (s) {
                var l = Object.keys(saisons[s]).map(function (i) { return saisons[s][i]; }).filter(function (e) { return e.CommunityRating > 0; });
                if (!l.length) return '<td></td>';
                var m = l.reduce(function (a, e) { return a + e.CommunityRating; }, 0) / l.length;
                return '<td class="wf-note wf-note-' + niveau(m) + '">' + m.toFixed(1) + '</td>';
            }).join('') + '</tr>';

            var nonVues = notees.filter(function (e) { return !(e.UserData && e.UserData.Played); }).length;
            var bloc = document.createElement('div');
            bloc.id = 'wf-notes';
            bloc.setAttribute('data-id', item.Id);
            bloc.className = 'verticalSection detailVerticalSection wf-notes';
            bloc.innerHTML = '<button type="button" class="wf-notes-ouvrir" aria-expanded="false">' +
                '<span class="sectionTitle sectionTitle-cards">Notes des épisodes</span>' +
                '<span class="wf-notes-resume">moyenne ' + moyenne.toFixed(1) + ' · ' + notees.length + ' épisodes</span>' +
                '<span class="material-icons expand_more wf-notes-chevron" aria-hidden="true"></span></button>' +
                '<div class="wf-notes-contenu" hidden>' +
                '<div class="wf-notes-outils">' +
                (nonVues ? '<label class="wf-interrupteur"><input type="checkbox" class="wf-notes-reveler"><span></span> Révéler les notes des ' + nonVues + ' épisodes non vus</label>' : '') +
                '<span class="wf-notes-legende"><i class="wf-note-5"></i>9+ <i class="wf-note-4"></i>8 <i class="wf-note-3"></i>7 <i class="wf-note-2"></i>6 <i class="wf-note-1"></i>&lt;6</span></div>' +
                '<div class="wf-notes-defile"><table class="wf-notes-table"><thead><tr><th></th>' +
                nums.map(function (s) { return '<th scope="col">S' + s + '</th>'; }).join('') + '</tr></thead><tbody>' +
                corps + moyennes + '</tbody></table></div>' +
                '<p class="wf-notes-source">Notes issues des métadonnées de Jellyfin. Les épisodes non vus sont masqués pour éviter les spoilers ; clique sur une case pour la dévoiler.</p>' +
                '</div>';
            var prochainBloc = pp.querySelector('#wf-prochain');
            hote.parentNode.insertBefore(bloc, hote.nextSibling);
            if (prochainBloc && prochainBloc.parentNode === hote.parentNode && prochainBloc.nextSibling !== hote) {
                hote.parentNode.insertBefore(prochainBloc, hote);
            }

            var bouton = bloc.querySelector('.wf-notes-ouvrir');
            var contenu = bloc.querySelector('.wf-notes-contenu');
            bouton.addEventListener('click', function () {
                var ouvert = bouton.getAttribute('aria-expanded') === 'true';
                bouton.setAttribute('aria-expanded', String(!ouvert));
                contenu.hidden = ouvert;
                bloc.classList.toggle('wf-ouvert', !ouvert);
            });
            var rev = bloc.querySelector('.wf-notes-reveler');
            if (rev) rev.addEventListener('change', function () { bloc.classList.toggle('wf-notes-revelees', rev.checked); });
            bloc.querySelector('table').addEventListener('click', function (e) {
                var td = e.target.closest('.wf-note-cachee');
                if (td && !bloc.classList.contains('wf-notes-revelees') && !td.classList.contains('wf-devoilee')) {
                    e.preventDefault();
                    td.classList.add('wf-devoilee');
                }
            });
        }).catch(function () { /* rien */ });
    }

    /* ---------- Orchestration ---------- */
    function passer() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || !api()) return;
        var p = page();
        if (!p) return;
        var id = m[1];
        une('item-' + id, function () { return api().getItem(uid(), id); }).then(function (item) {
            var pp = page();
            if (!pp) return;
            if (item.Type !== 'Series') {
                ['#wf-prochain', '#wf-notes'].forEach(function (s) {
                    var x = pp.querySelector(s);
                    if (x) x.remove();
                });
                return;
            }
            ['#wf-prochain', '#wf-notes'].forEach(function (s) {
                var x = pp.querySelector(s);
                if (x && x.getAttribute('data-id') !== id) x.remove();
            });
            statut(pp, item);
            prochain(pp, item);
            grille(pp, item);
        }).catch(function () { /* rien */ });
    }

    // Les données de lecture changent : on oublie l'épisode suivant et la grille
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button[is="emby-playstatebutton"]')) {
            Object.keys(memo).forEach(function (k) { if (k.indexOf('item-') !== 0) delete memo[k]; });
        }
    }, true);
    window.addEventListener('wf-route', function () {
        Object.keys(memo).forEach(function (k) { if (k.indexOf('suivant-') === 0) delete memo[k]; });
    });

    var prevu = false;
    function planifier() {
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () { prevu = false; passer(); });
    }
    window.addEventListener('wf-route', planifier);
    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    planifier();
    void html;
})();
