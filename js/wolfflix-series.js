/* =====================================================================
   WolfFlix — Module « Séries » (chargé par wolfflix-core.js)
   Fiche d'une série :
   - pastille « En cours de diffusion » / « Terminée » ;
   - encart « Prochain épisode / Reprendre / Film lié » à la place du
     bloc « À suivre » de Jellyfin ;
   - grille des notes des épisodes juste sous les infos (résumé, genres,
     studio…), fermée par défaut, avec classement parmi tes séries.
   Fiche d'une saison :
   - films liés (ex. El Camino après le dernier épisode de Breaking Bad),
     glissés dans la liste des épisodes ; bouton « Lier un film » (admin).
   Accueil : un film lié devient « À suivre » quand son tour arrive.
   Listes : les séries sans aucun fichier vidéo sont masquées.
   Couleurs de la grille : reprises de « Jellyfin Episodes Ratings Grid »
   de Damocles-fr (licence MIT). Notes : métadonnées de ton Jellyfin.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfSeries) return;
    window.__wfSeries = true;

    var html = document.documentElement;

    /* ---------- Utilitaires ---------- */
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
    function image(id, tag, type, q) {
        return url('Items/' + id + '/Images/' + (type || 'Primary'), Object.assign({ quality: 90, tag: tag }, q || { fillWidth: 480 }));
    }
    function minutes(ticks) { return Math.round((ticks || 0) / 600000000); }
    function toast(texte, erreur) {
        var t = document.createElement('div');
        t.className = 'wf-toast' + (erreur ? ' wf-toast-erreur' : '');
        t.textContent = texte;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('wf-toast-sortie'); }, 2800);
        setTimeout(function () { t.remove(); }, 3300);
    }

    var memo = {};
    function une(cle, fn) {
        if (!memo[cle]) {
            memo[cle] = fn();
            memo[cle].catch(function () { delete memo[cle]; });
        }
        return memo[cle];
    }
    function oublier(prefixes) {
        Object.keys(memo).forEach(function (k) {
            if (prefixes.some(function (p) { return k.indexOf(p) === 0; })) {
                delete memo[k];
                if (k.indexOf('item-') === 0 && window.WolfFlix && window.WolfFlix.oublierElement) window.WolfFlix.oublierElement(k.slice(5));
            }
        });
        prefixes.forEach(function (p) {
            if (p.indexOf('item-') === 0 && p.length > 5 && window.WolfFlix && window.WolfFlix.oublierElement) window.WolfFlix.oublierElement(p.slice(5));
        });
    }
    function page() {
        var p = document.querySelector('#itemDetailPage:not(.hide)');
        return p && p.offsetParent !== null ? p : null;
    }
    function element(id) {
        return une('item-' + id, function () {
            return window.WolfFlix && window.WolfFlix.element ? window.WolfFlix.element(id) : api().getItem(uid(), id);
        });
    }
    /* Lecture garantie fraîche (contourne tout cache du navigateur) */
    function frais(id) {
        return json('Items/' + id, { userId: uid(), _: Date.now() }).catch(function () { return api().getItem(uid(), id); });
    }
    function estAdmin() {
        return une('admin', function () {
            var u = window.WolfFlix && window.WolfFlix.utilisateur ? window.WolfFlix.utilisateur() : api().getCurrentUser();
            return u.then(function (x) { return !!(x && x.Policy && x.Policy.IsAdministrator); });
        });
    }
    function episodes(serieId) {
        return une('episodes-' + serieId, function () {
            return json('Shows/' + serieId + '/Episodes', { UserId: uid(), EnableImages: false, IsMissing: false })
                .then(function (r) { return r.Items || []; });
        });
    }

    /* ---------- Couleurs (Damocles-fr, MIT) ---------- */
    function styleNote(v) {
        if (!(v >= 0)) return '';
        var h = 0, s = 78, l = 16;
        if (v >= 9.5) { h = 92; s = 100; l = 51.5; }
        else if (v >= 9.0) { h = 120; s = 100; l = 45; }
        else if (v >= 8.0) { h = 84; s = 98; l = 30.6; }
        else if (v >= 7.0) { h = 32; s = 88; l = 20; }
        else if (v >= 6.0) { h = 18; s = 90; l = 19; }
        else if (v >= 5.0) { h = 10; s = 84; l = 17; }
        else if (v >= 4.0) { h = 6; s = 82; l = 15; }
        else if (v >= 3.0) { h = 3; s = 80; l = 14; }
        else if (v >= 2.0) { h = 1; s = 78; l = 13; }
        else { h = 0; s = 76; l = 12; }
        var frac = v % 1;
        var lb = frac * (v >= 7 ? 7 : 3.8);
        var light = Math.min(l + lb, v >= 7 ? 72 : 26);
        var a = v >= 7 ? (0.82 + frac * 0.12) : (0.92 + frac * 0.04);
        var glow = 'inset 0 1px 0 rgba(255,255,255,.06)';
        if (v >= 9.8) glow = '0 0 8px rgba(255,240,28,.24),0 0 16px rgba(255,240,28,.12),inset 0 1px 0 rgba(255,255,255,.12)';
        else if (v >= 9.7) glow = '0 0 8px rgba(146,255,74,.28),0 0 16px rgba(146,255,74,.13),inset 0 1px 0 rgba(255,255,255,.11)';
        else if (v >= 9.6) glow = '0 0 6px rgba(86,255,72,.22),0 0 12px rgba(86,255,72,.10),inset 0 1px 0 rgba(255,255,255,.10)';
        else if (v >= 9.0) glow = '0 0 5px hsla(' + h + ',' + s + '%,' + (light + 8) + '%,.28),inset 0 1px 0 rgba(255,255,255,.08)';
        return 'background:hsla(' + h + ',' + s + '%,' + light.toFixed(1) + '%,' + a.toFixed(3) + ');' +
            'border-color:hsla(' + h + ',' + s + '%,' + Math.min(light + (v >= 7 ? 18 : 10), v >= 7 ? 85 : 34).toFixed(1) + '%,.30);' +
            'color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.70),0 0 1px rgba(0,0,0,.55);box-shadow:' + glow + ';';
    }

    /* ---------- Statistiques de toutes tes séries (classement, séries vides) ---------- */
    var CLE_STATS = 'wf-stats-series-v2-';
    function stats() {
        return une('stats', function () {
            var c = null;
            try {
                c = JSON.parse(localStorage.getItem(CLE_STATS + uid()));
                localStorage.removeItem('wf-stats-series-v1-' + uid());
            } catch (e) { c = null; }
            if (c && Date.now() - c.t < 86400000) return Promise.resolve(c);
            var parSerie = {};
            // Une seule requête, triée : pas de pagination instable qui « perdrait » des séries
            return Promise.all([
                json('Users/' + uid() + '/Items', {
                    IncludeItemTypes: 'Episode', Recursive: true, IsMissing: false,
                    SortBy: 'SeriesSortName,ParentIndexNumber,IndexNumber,SortName',
                    EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false
                }),
                json('Users/' + uid() + '/Items', { IncludeItemTypes: 'Series', Recursive: true, EnableImages: false, EnableUserData: false })
            ]).then(function (r) {
                (r[0].Items || []).forEach(function (e) {
                    if (!e.SeriesId) return;
                    var x = parSerie[e.SeriesId] = parSerie[e.SeriesId] || [0, 0, 0];
                    x[2]++;
                    if (e.CommunityRating > 0 && e.ParentIndexNumber > 0) { x[0] += e.CommunityRating; x[1]++; }
                });
                var toutes = r[1].Items || [];
                var candidates = toutes.filter(function (s) { return !parSerie[s.Id]; }).map(function (s) { return s.Id; });
                // Garde-fou : trop de séries « vides » = résultat douteux, on ne cache rien
                if (candidates.length > Math.max(5, toutes.length * 0.2)) candidates = [];
                // Vérification une par une avant de cacher quoi que ce soit
                return Promise.all(candidates.map(function (id) {
                    return json('Shows/' + id + '/Episodes', { UserId: uid(), IsMissing: false, Limit: 1, EnableImages: false, EnableUserData: false })
                        .then(function (x) { return (x.Items || []).length ? null : id; })
                        .catch(function () { return null; });
                })).then(function (v) {
                    var vides = v.filter(Boolean);
                    var moy = {};
                    Object.keys(parSerie).forEach(function (id) {
                        var x = parSerie[id];
                        if (x[1] >= 3) moy[id] = [+(x[0] / x[1]).toFixed(3), x[1]];
                    });
                    var res = { t: Date.now(), moy: moy, vides: vides };
                    try { localStorage.setItem(CLE_STATS + uid(), JSON.stringify(res)); } catch (e) { /* plein */ }
                    return res;
                });
            });
        });
    }

    /* ---------- Films liés (rangés dans les étiquettes de la série) ---------- */
    function liensDe(serie) {
        var t = ((serie && serie.Tags) || []).filter(function (x) { return x.indexOf('wffilms:') === 0; })[0];
        if (!t) return [];
        return t.slice(8).split('|').map(function (p) {
            var m = /^([0-9a-f]{32})@(\d+)\.(\d+)$/i.exec(p);
            return m ? { film: m[1], saison: +m[2], apres: +m[3] } : null;
        }).filter(Boolean).sort(function (a, b) { return a.saison - b.saison || a.apres - b.apres; });
    }
    function enregistrerLiens(serieId, liens) {
        var a = api();
        return frais(serieId).then(function (it) {
            it.Tags = (it.Tags || []).filter(function (x) { return x.indexOf('wffilms:') !== 0 && x !== 'wf-films'; });
            if (liens.length) {
                it.Tags.push('wf-films');
                it.Tags.push('wffilms:' + liens.map(function (l) { return l.film + '@' + l.saison + '.' + l.apres; }).join('|'));
            }
            var attendu = it.Tags.slice();
            return a.updateItem(it).then(function () { return frais(serieId); }).then(function (v) {
                var garde = (v.Tags || []).filter(function (x) { return x.indexOf('wffilms:') === 0; })[0] || '';
                var voulu = attendu.filter(function (x) { return x.indexOf('wffilms:') === 0; })[0] || '';
                if (garde !== voulu) throw new Error('étiquette non enregistrée');
            });
        }).then(function () {
            oublier(['item-' + serieId, 'films-', 'suivant-', 'accueil-films']);
        });
    }
    function films(ids) {
        if (!ids.length) return Promise.resolve({});
        return une('films-' + ids.join(','), function () {
            return json('Users/' + uid() + '/Items', {
                Ids: ids.join(','), Fields: 'ProductionYear,Overview',
                EnableImageTypes: 'Primary,Backdrop,Thumb', ImageTypeLimit: 1
            }).then(function (r) {
                var m = {};
                (r.Items || []).forEach(function (f) { m[f.Id] = f; });
                return m;
            });
        });
    }
    /* Le film lié dont c'est le tour (épisode d'avant vu, film pas encore vu) */
    function filmSuivant(serie) {
        var liens = liensDe(serie);
        if (!liens.length) return Promise.resolve(null);
        return Promise.all([episodes(serie.Id), films(liens.map(function (l) { return l.film; }))]).then(function (r) {
            var eps = {};
            r[0].forEach(function (e) { eps[e.ParentIndexNumber + '.' + e.IndexNumber] = e; });
            for (var i = 0; i < liens.length; i++) {
                var l = liens[i];
                var f = r[1][l.film];
                if (!f || (f.UserData && f.UserData.Played)) continue;
                var avant = eps[l.saison + '.' + l.apres];
                if (l.apres === 0 || (avant && avant.UserData && avant.UserData.Played)) return { film: f, lien: l };
            }
            return null;
        });
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

    /* ---------- Encart « À suivre » ---------- */
    function prochain(p, item) {
        if (p.querySelector('#wf-prochain[data-id="' + item.Id + '"]')) return;
        une('suivant-' + item.Id, function () {
            return Promise.all([
                json('Shows/NextUp', {
                    SeriesId: item.Id, UserId: uid(), Limit: 1, Fields: 'Overview',
                    EnableImageTypes: 'Primary,Thumb', ImageTypeLimit: 1, EnableResumable: true
                }).then(function (r) { return r.Items && r.Items[0]; }),
                filmSuivant(item)
            ]);
        }).then(function (r) {
            var ep = r[0];
            var fl = r[1];
            var pp = page();
            if (!pp || pp.querySelector('#wf-prochain[data-id="' + item.Id + '"]')) return;
            var natif = pp.querySelector('.nextUpSection');
            if (!natif) return;
            var bloc = document.createElement('a');
            bloc.id = 'wf-prochain';
            bloc.setAttribute('data-id', item.Id);
            bloc.className = 'wf-prochain-encart';
            var filmDabord = fl && (!ep || ep.ParentIndexNumber > fl.lien.saison ||
                (ep.ParentIndexNumber === fl.lien.saison && ep.IndexNumber > fl.lien.apres));
            if (filmDabord) {
                var f = fl.film;
                var t = f.BackdropImageTags && f.BackdropImageTags[0];
                var img = t ? image(f.Id, t, 'Backdrop') : (f.ImageTags && f.ImageTags.Primary ? image(f.Id, f.ImageTags.Primary) : '');
                bloc.href = lien(f.Id);
                bloc.innerHTML = vignette(img, 0) +
                    '<span class="wf-prochain-texte"><span class="wf-prochain-surtitre">À suivre · film lié</span>' +
                    '<span class="wf-prochain-titre">' + esc(f.Name) + (f.ProductionYear ? ' <small>(' + f.ProductionYear + ')</small>' : '') + '</span>' +
                    '<span class="wf-prochain-info">Après S' + fl.lien.saison + ' · É' + fl.lien.apres + '</span>' +
                    (f.Overview ? '<span class="wf-prochain-resume">' + esc(f.Overview) + '</span>' : '') + '</span>';
            } else if (ep) {
                var ud = ep.UserData || {};
                var reprise = ud.PlaybackPositionTicks > 0;
                var pct = reprise && ep.RunTimeTicks ? Math.min(100, ud.PlaybackPositionTicks / ep.RunTimeTicks * 100) : 0;
                var tag = ep.ImageTags && ep.ImageTags.Primary;
                bloc.href = lien(ep.Id);
                bloc.innerHTML = vignette(tag ? image(ep.Id, tag) : '', pct) +
                    '<span class="wf-prochain-texte"><span class="wf-prochain-surtitre">' + (reprise ? 'Reprendre' : 'Prochain épisode') + '</span>' +
                    '<span class="wf-prochain-titre">S' + (ep.ParentIndexNumber || '?') + ' · É' + (ep.IndexNumber || '?') + ' — ' + esc(ep.Name) + '</span>' +
                    (reprise ? '<span class="wf-prochain-info">Reprendre à ' + minutes(ud.PlaybackPositionTicks) + ' min sur ' + minutes(ep.RunTimeTicks) + '</span>' :
                        (ep.RunTimeTicks ? '<span class="wf-prochain-info">' + minutes(ep.RunTimeTicks) + ' min</span>' : '')) +
                    (ep.Overview ? '<span class="wf-prochain-resume">' + esc(ep.Overview) + '</span>' : '') + '</span>';
            } else {
                return;
            }
            natif.parentNode.insertBefore(bloc, natif);
            pp.classList.add('wf-avec-prochain');
        }).catch(function () { /* rien */ });
    }
    function vignette(img, pct) {
        return '<span class="wf-prochain-image"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' +
            '<span class="wf-prochain-lecture material-icons play_arrow" aria-hidden="true"></span>' +
            (pct ? '<span class="wf-prochain-barre"><span style="width:' + pct.toFixed(1) + '%"></span></span>' : '') + '</span>';
    }

    /* ---------- Notes IMDb de l'extension WolfFlix (si elle est installée) ---------- */
    function notesImdb(id) {
        return une('imdb-' + id, function () {
            return json('WolfFlix/Notes/' + id).then(function (r) { return r && r.trouve ? r : null; }, function () { return null; });
        });
    }
    function nombre(n) { return Number(n || 0).toLocaleString('fr-FR'); }
    function dateMaj(d) {
        var x = new Date(d);
        return isNaN(x) || x.getFullYear() < 2000 ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    }
    function lienOuTexte(e, contenu, attrs) {
        return e.Id ? '<a ' + (attrs || '') + ' href="' + lien(e.Id) + '">' + contenu + '</a>' : '<span ' + (attrs || '') + '>' + contenu + '</span>';
    }
    function statsImdb(imdb) {
        var global = imdb.rangGlobal > 0
            ? '<div class="wf-stat"><span class="wf-stat-valeur">' + nombre(imdb.rangGlobal) + '<small>/' + nombre(imdb.totalGlobal) + '</small></span><span class="wf-stat-libelle">classement IMDb · top ' +
              Math.max(1, Math.round(imdb.rangGlobal / imdb.totalGlobal * 100)) + ' %</span></div>'
            : '<div class="wf-stat"><span class="wf-stat-valeur">—</span><span class="wf-stat-libelle">classement IMDb (moins de ' + nombre(imdb.votesMin) + ' votes)</span></div>';
        return '<div class="wf-stat"><span class="wf-stat-valeur">' + imdb.note.toFixed(1) + ' <small>(' + nombre(imdb.votes) + ' votes)</small></span><span class="wf-stat-libelle">note IMDb</span></div>' +
            global +
            '<div class="wf-stat"><span class="wf-stat-valeur">' + imdb.rangWolfFlix + '<small>/' + imdb.totalWolfFlix + '</small></span><span class="wf-stat-libelle">classement WolfFlix · top ' +
            Math.max(1, Math.round(imdb.rangWolfFlix / imdb.totalWolfFlix * 100)) + ' %</span></div>';
    }
    function badgeRang(r, rang, total) {
        r.hidden = false;
        r.innerHTML = (rang <= 3 ? '<span class="material-icons workspace_premium" aria-hidden="true"></span>' : '') + rang + '<small>/' + total + '</small>';
        r.className = 'wf-notes-rang' + (rang <= 3 ? ' wf-podium wf-podium-' + rang : '');
    }
    function ouvrable(bloc) {
        var bouton = bloc.querySelector('.wf-notes-ouvrir');
        var contenu = bloc.querySelector('.wf-notes-contenu');
        bouton.addEventListener('click', function () {
            var ouvert = bouton.getAttribute('aria-expanded') === 'true';
            bouton.setAttribute('aria-expanded', String(!ouvert));
            contenu.hidden = ouvert;
            bloc.classList.toggle('wf-ouvert', !ouvert);
        });
    }

    /* ---------- Film : note IMDb et classements ---------- */
    function noteFilm(p, item) {
        if (p.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
        notesImdb(item.Id).then(function (imdb) {
            var pp = page();
            if (!imdb || !pp || pp.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
            var hote = pp.querySelector('.itemDetailsGroup');
            if (!hote) return;
            var bloc = document.createElement('div');
            bloc.id = 'wf-notes';
            bloc.setAttribute('data-id', item.Id);
            bloc.className = 'wf-notes wf-notes-film';
            bloc.innerHTML = '<button type="button" class="wf-notes-ouvrir" aria-expanded="false">' +
                '<span class="material-icons star wf-notes-icone" aria-hidden="true"></span>' +
                '<span class="wf-notes-titre">Note IMDb</span>' +
                '<span class="wf-notes-moyenne" style="' + styleNote(imdb.note) + '">' + imdb.note.toFixed(1) + '</span>' +
                '<span class="wf-notes-rang" hidden></span>' +
                '<span class="material-icons expand_more wf-notes-chevron" aria-hidden="true"></span></button>' +
                '<div class="wf-notes-contenu" hidden><div class="wf-notes-comparaison">' + statsImdb(imdb) + '</div>' +
                '<p class="wf-notes-source">Notes IMDb' + (dateMaj(imdb.maj) ? ', mises à jour le ' + dateMaj(imdb.maj) : '') + ' · classement WolfFlix parmi les films de ton serveur.</p></div>';
            hote.parentNode.insertBefore(bloc, hote.nextSibling);
            badgeRang(bloc.querySelector('.wf-notes-rang'), imdb.rangWolfFlix, imdb.totalWolfFlix);
            ouvrable(bloc);
        });
    }

    var analysePing = {};

    /* ---------- Avis du WolfFlix (extension WolfFlix) ---------- */
    var CRITERES = [
        { nom: 'Scénario', aide: 'histoire, cohérence, rythme, enjeux, fin',
          echelle: ['raté', 'très mauvais', 'faible', 'correct', 'très bon', 'excellent et marquant'] },
        { nom: 'Personnages / jeu d’acteur', aide: 'interprétations, crédibilité, émotions, attachement aux personnages',
          echelle: ['raté', 'mauvais', 'moyen', 'correct', 'très convaincant', 'performances exceptionnelles'] },
        { nom: 'Image / réalisation', aide: 'plans, lumière, couleurs, mise en scène, esthétique, rythme visuel',
          echelle: ['raté', 'maladroit', 'banal', 'correct', 'très soigné', 'visuellement remarquable'] },
        { nom: 'Ambiance / musique', aide: 'bande originale, sound design, atmosphère, tension, immersion',
          echelle: ['ratée', 'mauvaise', 'discrète ou inégale', 'correcte', 'très immersive', 'ambiance parfaite'] },
        { nom: 'Impact personnel', aide: 'émotion ressentie, mémorabilité, envie de le revoir ou de le recommander',
          echelle: ['aucun impact', 'désagréable', 'peu d’effet', 'sympa mais oubliable', 'très marquant', 'coup de cœur'] }
    ];
    function sur5(n) { return (n === null || n === undefined) ? '–' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
    function etoiles(n) {
        var r = Math.round(n * 2) / 2, t = '';
        for (var i = 1; i <= 5; i++) t += r >= i ? '★' : (r >= i - 0.5 ? '½' : '');
        return t || '0';
    }
    function couleurAvis(n) { return styleNote(Math.max(0, Math.min(10, n * 2))); }

    function avisWolfFlix(p, item) {
        if (p.querySelector('#wf-avis[data-id="' + item.Id + '"]')) return;
        var cle = 'avis-' + item.Id;
        une(cle, function () { return json('WolfFlix/Avis/' + item.Id).catch(function () { return null; }); }).then(function (d) {
            var pp = page();
            if (!d || !pp || pp.querySelector('#wf-avis[data-id="' + item.Id + '"]')) return;
            var ancre = pp.querySelector('#wf-notes') || pp.querySelector('.itemDetailsGroup');
            if (!ancre) return;
            var bloc = document.createElement('div');
            bloc.id = 'wf-avis';
            bloc.setAttribute('data-id', item.Id);
            bloc.className = 'wf-notes wf-avis';
            ancre.parentNode.insertBefore(bloc, ancre.nextSibling);
            dessinerAvis(bloc, item, d, false);
        });
    }

    function dessinerAvis(bloc, item, d, ouvert) {
        var mien = (d.avis || []).filter(function (a) { return a.moi; })[0];
        var autres = (d.avis || []).filter(function (a) { return !a.moi; });
        var valeurs = mien ? mien.criteres.slice() : [3, 3, 3, 3, 3];

        var resume = d.nb ? '<div class="wf-avis-criteres">' + CRITERES.map(function (c, i) {
            var v = d.criteres[i] || 0;
            return '<div class="wf-avis-critere"><span class="wf-avis-critere-nom">' + esc(c.nom) + '</span>' +
                '<span class="wf-avis-barre"><span style="width:' + (v / 5 * 100).toFixed(1) + '%;' + couleurAvis(v) + '"></span></span>' +
                '<span class="wf-avis-critere-val">' + sur5(v) + '</span></div>';
        }).join('') + '</div>' : '<p class="wf-avis-vide">Pas encore d’avis. Sois le premier !</p>';

        var formulaire = '<form class="wf-avis-form">' +
            '<h4>' + (mien ? 'Ton avis' : 'Donner ton avis') + '</h4>' +
            CRITERES.map(function (c, i) {
                return '<label class="wf-avis-champ"><span class="wf-avis-champ-tete"><b>' + esc(c.nom) + '</b> <small>' + esc(c.aide) + '</small></span>' +
                    '<span class="wf-avis-curseur"><input type="range" min="0" max="5" step="0.5" value="' + valeurs[i] + '" data-i="' + i + '">' +
                    '<output>' + sur5(valeurs[i]) + '</output><em>' + esc(c.echelle[Math.floor(valeurs[i])]) + '</em></span></label>';
            }).join('') +
            '<label class="wf-avis-champ"><span class="wf-avis-champ-tete"><b>Commentaire</b> <small>facultatif, visible par tous</small></span>' +
            '<textarea rows="3" maxlength="4000" placeholder="Ce que tu en as pensé…">' + esc(mien ? mien.commentaire : '') + '</textarea></label>' +
            '<div class="wf-avis-final">Note finale : <strong class="wf-avis-total"></strong> <span class="wf-avis-lb" title="Équivalent Letterboxd (arrondi au demi-point)"></span></div>' +
            '<div class="wf-avis-actions"><button type="submit" class="wf-avis-btn wf-avis-ok">Enregistrer</button>' +
            (mien ? '<button type="button" class="wf-avis-btn wf-avis-suppr">Retirer mon avis</button>' : '') + '</div></form>';

        var liste = autres.length ? '<div class="wf-avis-liste"><h4>Les avis</h4>' + autres.map(function (a) {
            return '<div class="wf-avis-item"><div class="wf-avis-item-tete"><b>' + esc(a.utilisateur) + '</b>' +
                '<span class="wf-avis-item-note" style="' + couleurAvis(a.note) + '">' + sur5(a.note) + '</span>' +
                '<small>' + new Date(a.date).toLocaleDateString('fr-FR') + '</small>' +
                (d.admin ? '<button type="button" class="wf-avis-retirer" data-u="' + esc(a.utilisateurId) + '" title="Retirer cet avis">✕</button>' : '') + '</div>' +
                '<div class="wf-avis-item-criteres">' + CRITERES.map(function (c, i) { return '<span title="' + esc(c.nom) + '">' + esc(c.nom.split(' ')[0]) + ' ' + sur5(a.criteres[i]) + '</span>'; }).join('') + '</div>' +
                (a.commentaire ? '<p class="wf-avis-item-texte">' + esc(a.commentaire).replace(/\n/g, '<br>') + '</p>' : '') + '</div>';
        }).join('') + '</div>' : '';

        bloc.innerHTML = '<button type="button" class="wf-notes-ouvrir" aria-expanded="' + (ouvert ? 'true' : 'false') + '">' +
            '<span class="material-icons rate_review wf-notes-icone" aria-hidden="true"></span>' +
            '<span class="wf-notes-titre">Avis du WolfFlix</span>' +
            (d.nb ? '<span class="wf-notes-moyenne" style="' + couleurAvis(d.moyenne) + '">' + sur5(d.moyenne) + '<small>/5</small></span>' +
                '<span class="wf-avis-nb">' + d.nb + ' avis</span>' : '<span class="wf-avis-nb">aucun avis</span>') +
            (d.rang ? '<span class="wf-notes-rang"></span>' : '') +
            '<span class="material-icons expand_more wf-notes-chevron" aria-hidden="true"></span></button>' +
            '<div class="wf-notes-contenu"' + (ouvert ? '' : ' hidden') + '>' + resume + formulaire + liste + '</div>';
        if (ouvert) bloc.classList.add('wf-ouvert');
        if (d.rang) badgeRang(bloc.querySelector('.wf-notes-rang'), d.rang, d.total);
        ouvrable(bloc);

        var form = bloc.querySelector('.wf-avis-form');
        function total() {
            var v = Array.prototype.map.call(form.querySelectorAll('input[type=range]'), function (x) { return Number(x.value); });
            var n = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
            form.querySelector('.wf-avis-total').textContent = sur5(n) + ' / 5';
            form.querySelector('.wf-avis-total').setAttribute('style', couleurAvis(n));
            form.querySelector('.wf-avis-lb').textContent = 'Letterboxd ' + etoiles(n);
            return v;
        }
        form.addEventListener('input', function (e) {
            var x = e.target;
            if (x.type !== 'range') return;
            var c = CRITERES[Number(x.getAttribute('data-i'))];
            x.parentNode.querySelector('output').textContent = sur5(x.value);
            x.parentNode.querySelector('em').textContent = c.echelle[Math.floor(Number(x.value))];
            total();
        });
        total();
        function recharger() {
            oublier(['avis-' + item.Id]);
            une('avis-' + item.Id, function () { return json('WolfFlix/Avis/' + item.Id); }).then(function (n) { dessinerAvis(bloc, item, n, true); });
        }
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var b = form.querySelector('.wf-avis-ok');
            b.disabled = true;
            api().ajax({
                type: 'POST', url: url('WolfFlix/Avis/' + item.Id), contentType: 'application/json',
                data: JSON.stringify({ criteres: total(), commentaire: form.querySelector('textarea').value })
            }).then(recharger, function () { b.disabled = false; alert('Impossible d’enregistrer l’avis.'); });
        });
        var suppr = form.querySelector('.wf-avis-suppr');
        if (suppr) suppr.addEventListener('click', function () {
            if (!confirm('Retirer ton avis ?')) return;
            api().ajax({ type: 'DELETE', url: url('WolfFlix/Avis/' + item.Id) }).then(recharger);
        });
        bloc.querySelectorAll('.wf-avis-retirer').forEach(function (b) {
            b.addEventListener('click', function () {
                if (!confirm('Retirer cet avis ?')) return;
                api().ajax({ type: 'DELETE', url: url('WolfFlix/Avis/' + item.Id, { utilisateur: b.getAttribute('data-u') }) }).then(recharger);
            });
        });
    }

    /* ---------- Grille des notes + classement ---------- */
    function grille(p, item) {
        if (p.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
        Promise.all([episodes(item.Id), notesImdb(item.Id)]).then(function (r) {
            var tous = r[0], imdb = r[1];
            var pp = page();
            if (!pp || pp.querySelector('#wf-notes[data-id="' + item.Id + '"]')) return;
            var hote = pp.querySelector('.itemDetailsGroup');
            if (!hote) return;
            // Notes IMDb de l'extension si elle les a, sinon notes des métadonnées de Jellyfin
            var modeImdb = !!(imdb && imdb.episodes && imdb.episodes.some(function (e) { return e.note > 0; }));
            if (modeImdb) {
                tous = imdb.episodes.map(function (e) {
                    return { ParentIndexNumber: e.s, IndexNumber: e.e, CommunityRating: e.note || 0, Id: e.id || null, Name: e.nom || ('Épisode ' + e.e) };
                });
            }
            var eps = tous.filter(function (e) { return e.ParentIndexNumber > 0 && e.IndexNumber > 0; });
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
            var moySaison = {};
            nums.forEach(function (s) {
                var l = Object.keys(saisons[s]).map(function (i) { return saisons[s][i]; }).filter(function (e) { return e.CommunityRating > 0; });
                if (l.length) moySaison[s] = l.reduce(function (a, e) { return a + e.CommunityRating; }, 0) / l.length;
            });
            var meilleur = notees.slice().sort(function (a, b) { return b.CommunityRating - a.CommunityRating; })[0];
            var pire = notees.slice().sort(function (a, b) { return a.CommunityRating - b.CommunityRating; })[0];
            var topSaison = Object.keys(moySaison).sort(function (a, b) { return moySaison[b] - moySaison[a]; })[0];

            function cellule(e) {
                if (!e) return '<td class="wf-note-vide"></td>';
                var n = e.CommunityRating;
                var absent = e.Id ? '' : ' (absent de ton serveur)';
                if (!(n > 0)) return '<td class="wf-note-sans">' + lienOuTexte(e, '–', 'aria-label="Épisode ' + e.IndexNumber + '"') + '</td>';
                return '<td class="wf-note' + (e.Id ? '' : ' wf-note-absent') + '" style="' + styleNote(n) + '">' +
                    lienOuTexte(e, n.toFixed(1), 'title="S' + e.ParentIndexNumber + ' · É' + e.IndexNumber + ' — ' + esc(e.Name) + absent + '"') + '</td>';
            }
            var corps = '';
            for (var k = 1; k <= maxEp; k++) {
                corps += '<tr><th scope="row">É' + k + '</th>' + nums.map(function (s) { return cellule(saisons[s][k]); }).join('') + '</tr>';
            }
            var ligneMoy = '<tr class="wf-note-moyennes"><th scope="row">Moy.</th>' + nums.map(function (s) {
                return moySaison[s] ? '<td class="wf-note" style="' + styleNote(moySaison[s]) + '">' + moySaison[s].toFixed(1) + '</td>' : '<td></td>';
            }).join('') + '</tr>';

            var bloc = document.createElement('div');
            bloc.id = 'wf-notes';
            bloc.setAttribute('data-id', item.Id);
            bloc.className = 'wf-notes';
            bloc.innerHTML = '<button type="button" class="wf-notes-ouvrir" aria-expanded="false">' +
                '<span class="material-icons grid_on wf-notes-icone" aria-hidden="true"></span>' +
                '<span class="wf-notes-titre">Notes des épisodes</span>' +
                '<span class="wf-notes-moyenne" style="' + styleNote(moyenne) + '">' + moyenne.toFixed(1) + '</span>' +
                '<span class="wf-notes-rang" hidden></span>' +
                '<span class="material-icons expand_more wf-notes-chevron" aria-hidden="true"></span></button>' +
                '<div class="wf-notes-contenu" hidden>' +
                '<div class="wf-notes-comparaison">' +
                (modeImdb ? statsImdb(imdb) :
                '<div class="wf-stat wf-stat-rang"><span class="wf-stat-valeur">…</span><span class="wf-stat-libelle">Classement parmi tes séries</span></div>' +
                '<div class="wf-stat wf-stat-ecart"><span class="wf-stat-valeur">…</span><span class="wf-stat-libelle">par rapport à la moyenne de tes séries</span></div>') +
                (topSaison ? '<div class="wf-stat"><span class="wf-stat-valeur">S' + topSaison + ' · ' + moySaison[topSaison].toFixed(1) + '</span><span class="wf-stat-libelle">meilleure saison</span></div>' : '') +
                lienOuTexte(meilleur, '<span class="wf-stat-valeur">S' + meilleur.ParentIndexNumber + 'É' + meilleur.IndexNumber + ' · ' + meilleur.CommunityRating.toFixed(1) + '</span><span class="wf-stat-libelle">meilleur épisode</span>', 'class="wf-stat"') +
                lienOuTexte(pire, '<span class="wf-stat-valeur">S' + pire.ParentIndexNumber + 'É' + pire.IndexNumber + ' · ' + pire.CommunityRating.toFixed(1) + '</span><span class="wf-stat-libelle">épisode le plus faible</span>', 'class="wf-stat"') +
                '</div>' +
                '<div class="wf-notes-defile"><table class="wf-notes-table"><thead><tr><th></th>' +
                nums.map(function (s) { return '<th scope="col">S' + s + '</th>'; }).join('') + '</tr></thead><tbody>' +
                corps + ligneMoy + '</tbody></table></div>' +
                '<div class="wf-notes-legende">' + [[9.5, '9.5+'], [9, '9'], [8, '8'], [7, '7'], [6, '6'], [5, '5'], [3, '&lt;5']].map(function (x) {
                    return '<span><i style="' + styleNote(x[0] + 0.3) + '"></i>' + x[1] + '</span>';
                }).join('') + '</div>' +
                '<p class="wf-notes-source">' + notees.length + ' épisodes notés · ' +
                (modeImdb ? 'notes IMDb' + (dateMaj(imdb.maj) ? ', mises à jour le ' + dateMaj(imdb.maj) : '') + ' (cases pâles : épisodes absents de ton serveur)'
                    : 'notes issues des métadonnées de ton Jellyfin') + ' · couleurs : Jellyfin Episodes Ratings Grid (Damocles-fr).</p>' +
                '</div>';
            hote.parentNode.insertBefore(bloc, hote.nextSibling);

            ouvrable(bloc);
            if (modeImdb) {
                badgeRang(bloc.querySelector('.wf-notes-rang'), imdb.rangWolfFlix, imdb.totalWolfFlix);
                return;
            }

            // Classement : moyenne des épisodes, parmi tes séries ayant au moins 3 épisodes notés
            stats().then(function (st) {
                var moy = Object.assign({}, st.moy);
                moy[item.Id] = [moyenne, notees.length];
                var ids = Object.keys(moy);
                var total = ids.length;
                var rang = 1 + ids.filter(function (id) {
                    return id !== item.Id && (moy[id][0] > moyenne || (moy[id][0] === moyenne && moy[id][1] > notees.length));
                }).length;
                var moyGen = ids.reduce(function (a, id) { return a + moy[id][0]; }, 0) / total;
                var ecart = moyenne - moyGen;
                var r = bloc.querySelector('.wf-notes-rang');
                r.hidden = false;
                r.innerHTML = (rang <= 3 ? '<span class="material-icons workspace_premium" aria-hidden="true"></span>' : '') + rang + '<small>/' + total + '</small>';
                r.className = 'wf-notes-rang' + (rang <= 3 ? ' wf-podium wf-podium-' + rang : '');
                bloc.querySelector('.wf-stat-rang .wf-stat-valeur').innerHTML = rang + '<small>/' + total + '</small>';
                bloc.querySelector('.wf-stat-ecart .wf-stat-valeur').innerHTML = (ecart >= 0 ? '+' : '−') + Math.abs(ecart).toFixed(2) +
                    ' <small>(moy. ' + moyGen.toFixed(2) + ')</small>';
                bloc.querySelector('.wf-stat-ecart').classList.add(ecart >= 0 ? 'wf-plus' : 'wf-moins');
                var top = Math.max(1, Math.round(rang / total * 100));
                bloc.querySelector('.wf-stat-rang .wf-stat-libelle').textContent = 'classement parmi tes séries · top ' + top + ' %';
            }).catch(function () {
                bloc.querySelector('.wf-stat-rang').remove();
                bloc.querySelector('.wf-stat-ecart').remove();
            });
        }).catch(function () { /* rien */ });
    }

    /* ---------- Saison : films liés dans la liste + bouton « Lier un film » ---------- */
    function saison(p, item) {
        if (!item.SeriesId) return;
        Promise.all([element(item.SeriesId), episodes(item.SeriesId), estAdmin()]).then(function (r) {
            var serie = r[0];
            var eps = r[1].filter(function (e) { return e.ParentIndexNumber === item.IndexNumber; });
            var admin = r[2];
            var liens = liensDe(serie).filter(function (l) { return l.saison === item.IndexNumber; });
            var pp = page();
            if (!pp) return;
            var boutons = pp.querySelector('.mainDetailButtons');
            if (admin && boutons && !boutons.querySelector('.wf-btn-lier[data-id="' + item.Id + '"]')) {
                var ancien = boutons.querySelector('.wf-btn-lier');
                if (ancien) ancien.remove();
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'wf-btn-lier';
                b.setAttribute('data-id', item.Id);
                b.title = 'Lier un film à cette saison';
                b.innerHTML = '<span class="material-icons movie" aria-hidden="true"></span><span class="wf-btn-lier-texte">Lier un film</span>';
                b.addEventListener('click', function () { dialogueLier(serie, item, eps); });
                boutons.appendChild(b);
            }
            if (!liens.length) return;
            var liste = pp.querySelector('#listChildrenCollapsible .itemsContainer');
            if (!liste || !liste.querySelector('.listItem')) return;
            films(liens.map(function (l) { return l.film; })).then(function (fm) {
                liens.forEach(function (l) {
                    var f = fm[l.film];
                    if (!f || liste.querySelector('.wf-film-lie[data-film="' + f.Id + '"]')) return;
                    var avant = eps.filter(function (e) { return e.IndexNumber === l.apres; })[0];
                    var repere = avant ? liste.querySelector('.listItem[data-id="' + avant.Id + '"]') : null;
                    var tag = f.ImageTags && f.ImageTags.Primary;
                    var vu = !!(f.UserData && f.UserData.Played);
                    var a = document.createElement('a');
                    a.className = 'wf-film-lie';
                    a.setAttribute('data-film', f.Id);
                    a.href = lien(f.Id);
                    a.innerHTML = '<span class="wf-film-lie-affiche"' + (tag ? ' style="background-image:url(\'' + esc(image(f.Id, tag, 'Primary', { fillHeight: 180 })) + '\')"' : '') + '></span>' +
                        '<span class="wf-film-lie-texte"><span class="wf-film-lie-etiquette"><span class="material-icons movie" aria-hidden="true"></span> Film lié</span>' +
                        '<span class="wf-film-lie-titre">' + esc(f.Name) + (f.ProductionYear ? ' <small>(' + f.ProductionYear + ')</small>' : '') + '</span>' +
                        (f.Overview ? '<span class="wf-film-lie-resume">' + esc(f.Overview) + '</span>' : '') + '</span>' +
                        (vu ? '<span class="wf-film-lie-vu" title="Vu"></span>' : '') +
                        (admin ? '<button type="button" class="wf-film-lie-retirer" data-film="' + f.Id + '" title="Délier ce film" aria-label="Délier ce film"><span class="material-icons link_off" aria-hidden="true"></span></button>' : '');
                    var bRet = a.querySelector('.wf-film-lie-retirer');
                    if (bRet) bRet.addEventListener('click', function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        bRet.disabled = true;
                        oublier(['item-' + serie.Id]);
                        frais(serie.Id).then(function (sf) {
                            var reste = liensDe(sf).filter(function (x) { return !(x.film === f.Id && x.saison === item.IndexNumber); });
                            return enregistrerLiens(serie.Id, reste);
                        }).then(function () {
                            a.remove();
                            toast('Film délié');
                        }).catch(function () {
                            bRet.disabled = false;
                            toast('Impossible de délier (droits administrateur requis ?)', true);
                        });
                    });
                    if (repere) repere.parentNode.insertBefore(a, repere.nextSibling);
                    else if (l.apres === 0) liste.insertBefore(a, liste.firstChild);
                    else liste.appendChild(a);
                });
            });
        }).catch(function () { /* rien */ });
    }

    function dialogueLier(serie, sais, eps) {
        var liens = liensDe(serie);
        var choix = null;
        var fond = document.createElement('div');
        fond.className = 'wf-editeur-fond';
        var options = '<option value="0">Avant le premier épisode</option>' + eps.slice().sort(function (a, b) { return a.IndexNumber - b.IndexNumber; }).map(function (e) {
            return '<option value="' + e.IndexNumber + '">Après É' + e.IndexNumber + ' — ' + esc(e.Name) + '</option>';
        }).join('');
        fond.innerHTML = '<div class="wf-editeur wf-lier" role="dialog" aria-modal="true">' +
            '<header><p class="wf-page-surtitre">' + esc(serie.Name) + ' · Saison ' + sais.IndexNumber + '</p><h2>Lier un film</h2>' +
            '<p class="wf-aide">Le film apparaît dans la liste des épisodes et devient « à suivre » au bon moment, sans créer de cycle.</p></header>' +
            '<ol class="wf-editeur-liste wf-lier-existants"></ol>' +
            '<div class="wf-editeur-ajout wf-ouvert"><label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span>' +
            '<input type="search" placeholder="Chercher un film…" aria-label="Chercher un film"></label>' +
            '<div class="wf-editeur-resultats"></div>' +
            '<label class="wf-lier-position">Position <select class="wf-tri">' + options + '</select></label></div>' +
            '<footer><span class="wf-editeur-etat"></span><button type="button" class="wf-btn wf-btn-sec" data-act="annuler">Fermer</button>' +
            '<button type="button" class="wf-btn wf-btn-pri" data-act="lier" disabled>Lier</button></footer></div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var select = fond.querySelector('select');
        select.value = String(eps.length ? Math.max.apply(null, eps.map(function (e) { return e.IndexNumber; })) : 0);
        var btnLier = fond.querySelector('[data-act="lier"]');
        var etat = fond.querySelector('.wf-editeur-etat');

        function dessinerExistants() {
            var ici = liens.filter(function (l) { return l.saison === sais.IndexNumber; });
            var ol = fond.querySelector('.wf-lier-existants');
            if (!ici.length) { ol.innerHTML = '<li class="wf-vide">Aucun film lié à cette saison.</li>'; return; }
            films(ici.map(function (l) { return l.film; })).then(function (fm) {
                ol.innerHTML = ici.map(function (l) {
                    var f = fm[l.film] || { Name: 'Film introuvable' };
                    return '<li><span class="wf-num">' + (l.apres ? 'É' + l.apres + ' →' : 'début') + '</span><span class="wf-nom">' + esc(f.Name) +
                        (f.ProductionYear ? ' <small>' + f.ProductionYear + '</small>' : '') + '</span>' +
                        '<button type="button" class="wf-icone wf-icone-retirer" data-retirer="' + l.film + '" aria-label="Délier"><span class="material-icons close"></span></button></li>';
                }).join('');
            });
        }
        dessinerExistants();

        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
        }
        function sauver(nouveaux, message) {
            etat.textContent = 'Enregistrement…';
            fond.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
            enregistrerLiens(serie.Id, nouveaux).then(function () {
                liens = nouveaux;
                serie.Tags = (serie.Tags || []).filter(function (x) { return x.indexOf('wffilms:') !== 0; });
                toast(message);
                fermer();
                var p = page();
                if (p) p.querySelectorAll('.wf-film-lie').forEach(function (x) { x.remove(); });
                oublier(['item-' + serie.Id]);
                planifier();
            }).catch(function () {
                etat.textContent = '';
                fond.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
                toast('Échec de l\'enregistrement (droits administrateur requis ?)', true);
            });
        }
        fond.addEventListener('click', function (e) {
            if (e.target === fond || e.target.closest('[data-act="annuler"]')) { fermer(); return; }
            var r = e.target.closest('[data-retirer]');
            if (r) {
                var id = r.getAttribute('data-retirer');
                oublier(['item-' + serie.Id]);
                frais(serie.Id).then(function (sf) {
                    liens = liensDe(sf);
                    sauver(liens.filter(function (l) { return !(l.film === id && l.saison === sais.IndexNumber); }), 'Film délié');
                });
                return;
            }
            var res = e.target.closest('.wf-resultat');
            if (res) {
                fond.querySelectorAll('.wf-resultat').forEach(function (x) { x.classList.toggle('wf-choisi', x === res); });
                choix = res.getAttribute('data-id');
                btnLier.disabled = false;
                return;
            }
            if (e.target.closest('[data-act="lier"]') && choix) {
                var n = liens.filter(function (l) { return l.film !== choix; });
                n.push({ film: choix, saison: sais.IndexNumber, apres: +select.value });
                sauver(n, 'Film lié à la saison ' + sais.IndexNumber);
            }
        });
        fond.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });

        var champ = fond.querySelector('input');
        var res = fond.querySelector('.wf-editeur-resultats');
        var minuterie;
        setTimeout(function () { champ.focus(); }, 50);
        champ.addEventListener('input', function () {
            clearTimeout(minuterie);
            var terme = champ.value.trim();
            if (terme.length < 2) { res.innerHTML = ''; return; }
            minuterie = setTimeout(function () {
                json('Users/' + uid() + '/Items', {
                    searchTerm: terme, IncludeItemTypes: 'Movie', Recursive: true, Limit: 10,
                    Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: false
                }).then(function (r) {
                    if (champ.value.trim() !== terme) return;
                    res.innerHTML = (r.Items || []).map(function (i) {
                        var tag = i.ImageTags && i.ImageTags.Primary;
                        return '<button type="button" class="wf-resultat" data-id="' + i.Id + '">' +
                            '<span class="wf-vignette"' + (tag ? ' style="background-image:url(\'' + esc(image(i.Id, tag, 'Primary', { fillHeight: 120 })) + '\')"' : '') + '></span>' +
                            '<span class="wf-nom">' + esc(i.Name) + (i.ProductionYear ? ' <small>' + i.ProductionYear + '</small>' : '') + '</span>' +
                            '<span class="material-icons check_circle" aria-hidden="true"></span></button>';
                    }).join('') || '<p class="wf-vide">Aucun film trouvé.</p>';
                }).catch(function () { res.innerHTML = '<p class="wf-vide">Recherche impossible.</p>'; });
            }, 300);
        });
    }

    /* ---------- Accueil : film lié dans « À suivre » ---------- */
    function rangeeASuivre() {
        var conteneurs = document.querySelectorAll('.homeSectionsContainer .itemsContainer[data-monitor*="videoplayback"]');
        for (var i = 0; i < conteneurs.length; i++) {
            var sec = conteneurs[i].closest('.verticalSection');
            if (sec && sec.querySelector('a[href*="nextup"]') && conteneurs[i].offsetParent !== null) return conteneurs[i];
        }
        return null;
    }
    function accueil() {
        if (!html.classList.contains('wf-accueil')) return;
        var row = rangeeASuivre();
        if (!row || row.getAttribute('data-wf-films') === 'en-cours') return;
        if (!row.querySelector('.card') || row.querySelector('.wf-carte-film-lie')) return;
        if (row.getAttribute('data-wf-films') === 'aucun' && memo['accueil-films']) return;
        row.setAttribute('data-wf-films', 'en-cours');
        une('accueil-films', function () {
            return json('Users/' + uid() + '/Items', {
                IncludeItemTypes: 'Series', Recursive: true, Tags: 'wf-films', Fields: 'Tags', EnableImages: false
            }).then(function (r) {
                return Promise.all((r.Items || []).map(function (s) {
                    return filmSuivant(s).then(function (x) { return x ? { serie: s, film: x.film } : null; });
                }));
            }).then(function (l) { return l.filter(Boolean); });
        }).then(function (l) {
            row.setAttribute('data-wf-films', l.length ? 'fait' : 'aucun');
            if (!row.isConnected) return;
            l.forEach(function (x) {
                if (row.querySelector('[data-wf-film="' + x.film.Id + '"]')) return;
                var f = x.film;
                var t = f.BackdropImageTags && f.BackdropImageTags[0];
                var img = t ? image(f.Id, t, 'Backdrop') : '';
                var d = document.createElement('div');
                d.className = 'card overflowBackdropCard backdropCard wf-carte wf-carte-film-lie';
                d.setAttribute('data-id', f.Id);
                d.setAttribute('data-wf-film', f.Id);
                d.innerHTML = '<div class="cardBox cardBox-bottompadded"><a class="cardScalable" href="' + lien(f.Id) + '">' +
                    '<div class="cardPadder cardPadder-backdrop"></div>' +
                    '<div class="cardImageContainer coveredImage cardContent"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' +
                    '<span class="wf-ruban">Film lié</span></div></a>' +
                    '<div class="cardText cardTextCentered cardText-first"><bdi>' + esc(x.serie.Name) + '</bdi></div>' +
                    '<div class="cardText cardTextCentered cardText-secondary"><bdi>Film · ' + esc(f.Name) + '</bdi></div></div>';
                row.insertBefore(d, row.firstChild);
            });
        }).catch(function () { row.removeAttribute('data-wf-films'); });
    }

    /* ---------- Masquer les séries sans fichier ---------- */
    var vides = null;
    var videsPrevu = false;
    function masquerVides() {
        if (!vides) {
            if (videsPrevu) return;
            videsPrevu = true;
            // Calcul lourd (tous les épisodes) : seulement quand le navigateur est au repos
            var lancer = function () {
                stats().then(function (st) {
                    vides = {};
                    st.vides.forEach(function (id) { vides[id] = true; });
                    masquerVides();
                }).catch(function () { videsPrevu = false; });
            };
            if (window.WolfFlix && window.WolfFlix.quandCalme) window.WolfFlix.quandCalme(lancer, 3000); else setTimeout(lancer, 3000);
            return;
        }
        document.querySelectorAll('.card[data-type="Series"][data-id]:not([data-wf-v])').forEach(function (c) {
            c.setAttribute('data-wf-v', '');
            if (vides[c.getAttribute('data-id')]) c.classList.add('wf-serie-vide');
        });
    }

    /* ---------- Lecture : enchaîner épisode → film lié → épisode suivant ----------
       Le script suit ce que joue CET appareil (API « Sessions ») ; quand l'épisode
       qui précède un film lié se termine, il demande au lecteur de jouer le film ;
       quand le film lié se termine, il relance la série à l'épisode d'après. */
    var lect = { dernier: null, pos: 0, duree: 0, session: null, minuterie: null, deja: {}, filmLie: null };

    function surveillerLecture() {
        var enLecture = /^#\/video/.test(location.hash || '') || !!document.querySelector('video.htmlvideoplayer');
        if (enLecture && !lect.minuterie) {
            lect.minuterie = setInterval(sonder, 4000);
            sonder();
        } else if (!enLecture && lect.minuterie) {
            clearInterval(lect.minuterie);
            lect.minuterie = null;
            setTimeout(sonder, 1500);
        }
    }
    function sonder() {
        var a = api();
        if (!a || !a.deviceId) return;
        json('Sessions', { DeviceId: a.deviceId() }).then(function (l) {
            var s = (l || [])[0];
            if (!s) return;
            lect.session = s.Id;
            var npi = s.NowPlayingItem || null;
            if (lect.dernier && (!npi || npi.Id !== lect.dernier.Id)) {
                transition(lect.dernier, npi, lect.pos, lect.duree, false);
            }
            if (npi) {
                lect.dernier = npi;
                lect.pos = (s.PlayState && s.PlayState.PositionTicks) || 0;
                lect.duree = npi.RunTimeTicks || 0;
            } else {
                lect.dernier = null;
            }
        }).catch(function () { /* rien */ });
    }
    document.addEventListener('ended', function (e) {
        if (!e.target || e.target.tagName !== 'VIDEO' || !lect.dernier) return;
        var d = lect.dernier;
        lect.dernier = null;
        transition(d, null, lect.duree, lect.duree, true);
    }, true);

    function jouer(ids, message) {
        var a = api();
        var session = lect.session ? Promise.resolve(lect.session) :
            json('Sessions', { DeviceId: a.deviceId() }).then(function (l) { return l && l[0] && l[0].Id; });
        return session.then(function (sid) {
            if (!sid) return;
            toast(message);
            return a.ajax({ type: 'POST', url: url('Sessions/' + sid + '/Playing', { playCommand: 'PlayNow', itemIds: ids.join(',') }) });
        }).catch(function () { toast('Lancement automatique impossible', true); });
    }
    function lienDuFilm(filmId) {
        return json('Users/' + uid() + '/Items', {
            IncludeItemTypes: 'Series', Recursive: true, Tags: 'wf-films', Fields: 'Tags', EnableImages: false
        }).then(function (r) {
            var t = null;
            (r.Items || []).forEach(function (s) {
                liensDe(s).forEach(function (l) { if (!t && l.film === filmId) t = { film: filmId, serie: s.Id, lien: l }; });
            });
            return t;
        });
    }
    function transition(prec, suiv, pos, duree, fini) {
        var finiVraiment = fini || (duree > 0 && pos / duree > 0.85);
        if (prec.Type === 'Episode' && prec.SeriesId) {
            var enchaine = finiVraiment || (suiv && suiv.SeriesId === prec.SeriesId);
            if (!enchaine) return;
            oublier(['item-' + prec.SeriesId]);
            element(prec.SeriesId).then(function (serie) {
                var l = liensDe(serie).filter(function (x) { return x.saison === prec.ParentIndexNumber && x.apres === prec.IndexNumber; })[0];
                if (!l) return;
                if (lect.deja[l.film] && Date.now() - lect.deja[l.film] < 600000) return;
                return json('Users/' + uid() + '/Items', { Ids: l.film, EnableImages: false }).then(function (r) {
                    var f = r.Items && r.Items[0];
                    if (!f || (f.UserData && f.UserData.Played)) return;
                    lect.deja[l.film] = Date.now();
                    lect.filmLie = { film: l.film, serie: serie.Id, lien: l };
                    return jouer([l.film], 'Film lié : ' + f.Name);
                });
            }).catch(function () { /* rien */ });
        } else if (prec.Type === 'Movie' && finiVraiment) {
            var ctx = lect.filmLie && lect.filmLie.film === prec.Id ? Promise.resolve(lect.filmLie) : lienDuFilm(prec.Id);
            ctx.then(function (c) {
                if (!c) return;
                lect.filmLie = null;
                if (lect.deja['apres-' + c.film] && Date.now() - lect.deja['apres-' + c.film] < 600000) return;
                oublier(['episodes-' + c.serie]);
                return episodes(c.serie).then(function (eps) {
                    var suite = eps.filter(function (e) {
                        return e.ParentIndexNumber > c.lien.saison || (e.ParentIndexNumber === c.lien.saison && e.IndexNumber > c.lien.apres);
                    }).filter(function (e) { return e.ParentIndexNumber > 0; })
                        .sort(function (a, b) { return a.ParentIndexNumber - b.ParentIndexNumber || a.IndexNumber - b.IndexNumber; })
                        .slice(0, 50);
                    if (!suite.length) return;
                    lect.deja['apres-' + c.film] = Date.now();
                    return jouer(suite.map(function (e) { return e.Id; }), 'Reprise de la série : S' + suite[0].ParentIndexNumber + ' · É' + suite[0].IndexNumber);
                });
            }).catch(function () { /* rien */ });
        }
    }

    /* ---------- Orchestration ---------- */
    function passer() {
        if (!api()) return;
        surveillerLecture();
        masquerVides();
        accueil();
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m) return;
        var p = page();
        if (!p) return;
        var id = m[1];
        // Étiquettes techniques cachées
        p.querySelectorAll('.itemTags a').forEach(function (a) {
            if (/^(wffilms:|wf-films$)/.test(a.textContent.trim())) a.style.display = 'none';
        });
        element(id).then(function (item) {
            var pp = page();
            if (!pp) return;
            ['#wf-prochain', '#wf-notes', '#wf-avis'].forEach(function (s) {
                var x = pp.querySelector(s);
                var garde = item.Type === 'Series' || (s !== '#wf-prochain' && item.Type === 'Movie');
                if (x && (!garde || x.getAttribute('data-id') !== id)) x.remove();
            });
            if (item.Type !== 'Series' || !pp.querySelector('#wf-prochain')) pp.classList.remove('wf-avec-prochain');
            if (item.Type !== 'Season') {
                var bl = pp.querySelector('.wf-btn-lier');
                if (bl) bl.remove();
            }
            if (item.Type === 'Series') {
                statut(pp, item);
                prochain(pp, item);
                grille(pp, item);
                avisWolfFlix(pp, item);
            } else if (item.Type === 'Season') {
                saison(pp, item);
            } else if (item.Type === 'Movie') {
                noteFilm(pp, item);
                avisWolfFlix(pp, item);
            }
            // Fiche d'une vidéo : l'extension analyse ses sous-titres en avance (forcés / complets)
            if ((item.Type === 'Movie' || item.Type === 'Episode') && !analysePing[item.Id]) {
                analysePing[item.Id] = true;
                json('WolfFlix/Pistes/' + item.Id).catch(function () { /* extension absente */ });
            }
        }).catch(function () { /* rien */ });
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button[is="emby-playstatebutton"]')) {
            setTimeout(function () { oublier(['episodes-', 'suivant-', 'films-', 'accueil-films']); }, 600);
        }
    }, true);
    window.addEventListener('wf-route', function () { oublier(['suivant-', 'episodes-', 'films-', 'accueil-films', 'item-']); });

    var prevu = false;
    function planifier() {
        if (window.WolfFlix && window.WolfFlix.planifier) { window.WolfFlix.planifier(); return; }
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () { prevu = false; passer(); });
    }
    window.addEventListener('wf-route', planifier);
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(passer);
    else new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    planifier();
})();
