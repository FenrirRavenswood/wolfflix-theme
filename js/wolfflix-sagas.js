/* =====================================================================
   WolfFlix — Module « Sagas & Cycles » (chargé par wolfflix-core.js)
   - Sagas = collections de films ; Cycles = collections contenant une série
   - Pages « Sagas » et « Cycles » (#/home?wf=sagas / #/home?wf=cycles)
   - Accueil : « Sagas : à suivre », « Cycles : à suivre »,
               « Sagas ajoutées récemment », « Cycles ajoutés récemment »
   - Fiche d'une collection : rangée « Ordre de visionnage » numérotée,
     bouton « Modifier l'ordre » (administrateurs) avec glisser-déposer,
     ajout par recherche, retrait. L'ordre est enregistré dans les
     métadonnées de la collection (identifiant « WolfFlix »).
   - Fiches de films/séries : la section « Collections » devient
     « Sagas » ou « Cycles ».
   Désactiver : supprimer le chargement dans wolfflix-core.js, ou ajouter
   `html.wf-sans-sagas` (voir README).
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfSagas) return;
    window.__wfSagas = true;

    var html = document.documentElement;
    var CLE = 'wf-sagas-v2-';
    var NOMS = {
        s: { un: 'Saga', plusieurs: 'Sagas', aSuivre: 'Sagas : à suivre', recents: 'Sagas ajoutées récemment' },
        c: { un: 'Cycle', plusieurs: 'Cycles', aSuivre: 'Cycles : à suivre', recents: 'Cycles ajoutés récemment' }
    };

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
    function image(id, tag, h) {
        return tag ? url('Items/' + id + '/Images/Primary', { fillHeight: h || 360, quality: 90, tag: tag }) : '';
    }
    function lienFiche(id) {
        var a = api();
        return '#/details?id=' + id + (a && a.serverId ? '&serverId=' + a.serverId() : '');
    }
    function visible(el) { return !!(el && el.offsetParent !== null); }
    function parallele(liste, n, fn) {
        var i = 0;
        function suivant() {
            if (i >= liste.length) return Promise.resolve();
            var el = liste[i++];
            return Promise.resolve(fn(el)).then(suivant, suivant);
        }
        var fils = [];
        for (var k = 0; k < Math.min(n, liste.length); k++) fils.push(suivant());
        return Promise.all(fils);
    }
    function toast(texte, erreur) {
        var t = document.createElement('div');
        t.className = 'wf-toast' + (erreur ? ' wf-toast-erreur' : '');
        t.textContent = texte;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('wf-toast-sortie'); }, 2800);
        setTimeout(function () { t.remove(); }, 3300);
    }
    function loupAttente(texte) {
        return '<div class="wf-attente"><span class="wf-attente-loup"></span><span>' + esc(texte || 'Chargement') + '</span></div>';
    }

    /* ---------- Ordre stocké dans les métadonnées ---------- */
    /* Format : identifiants séparés par des virgules ; « ~Nom » ouvre une saison custom,
       « ~ » seul la referme (le nom est encodé pour supporter virgules et accents). */
    function jetons(bs) {
        var p = bs && bs.ProviderIds && (bs.ProviderIds.WolfFlix || bs.ProviderIds.wolfflix);
        if (p) return p.split(',').filter(Boolean);
        var tag = ((bs && bs.Tags) || []).filter(function (t) { return t.indexOf('wfordre:') === 0; })[0];
        return tag ? tag.slice(8).split(',').filter(Boolean) : null;
    }
    function ordreStocke(bs) {
        var j = jetons(bs);
        return j ? j.filter(function (x) { return /^[0-9a-f]{32}$/i.test(x); }) : null;
    }
    function groupesStockes(bs) {
        var g = {};
        var courant = '';
        (jetons(bs) || []).forEach(function (x) {
            if (x.charAt(0) === '~') {
                try { courant = decodeURIComponent(x.slice(1)); } catch (e) { courant = x.slice(1); }
            } else if (courant) {
                g[x] = courant;
            }
        });
        return g;
    }
    function ordonner(ids, ordre) {
        if (!ordre) return ids.slice();
        var present = {};
        ids.forEach(function (i) { present[i] = true; });
        var vus = {};
        var res = [];
        ordre.forEach(function (i) { if (present[i] && !vus[i]) { vus[i] = true; res.push(i); } });
        ids.forEach(function (i) { if (!vus[i]) res.push(i); });
        return res;
    }

    /* ---------- Cache local : type et contenu de chaque collection ---------- */
    function lireCache() {
        try { return JSON.parse(localStorage.getItem(CLE + uid())) || {}; } catch (e) { return {}; }
    }
    function ecrireCache(c) {
        try { localStorage.setItem(CLE + uid(), JSON.stringify(c)); } catch (e) { /* stockage plein */ }
    }
    function oublier(id) {
        var c = lireCache();
        delete c[id];
        ecrireCache(c);
        etat.promesse = null;
    }

    var etat = { promesse: null, quand: 0 };

    function charger(force) {
        if (!api()) return Promise.reject(new Error('hors connexion'));
        if (etat.promesse && !force && Date.now() - etat.quand < 120000) return etat.promesse;
        etat.quand = Date.now();
        etat.promesse = json('Users/' + uid() + '/Items', {
            IncludeItemTypes: 'BoxSet', Recursive: true,
            Fields: 'ProviderIds,Tags,DateCreated,ChildCount',
            SortBy: 'DateCreated', SortOrder: 'Descending',
            EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: false
        }).then(function (r) {
            var cache = lireCache();
            var perime = Date.now() - (cache._t || 0) > 86400000;
            var liste = r.Items || [];
            var aFaire = liste.filter(function (b) {
                var c = cache[b.Id];
                return perime || !c || c.n !== b.ChildCount;
            });
            return parallele(aFaire, 4, function (b) {
                return json('Users/' + uid() + '/Items', {
                    ParentId: b.Id, SortBy: 'PremiereDate,ProductionYear,SortName',
                    EnableImages: false, EnableUserData: false
                }).then(function (e) {
                    var ids = [];
                    var series = {};
                    var eps = [];
                    var type = 's';
                    (e.Items || []).forEach(function (i) {
                        ids.push(i.Id);
                        if (/^(Series|Season|Episode)$/.test(i.Type)) type = 'c';
                        if (i.Type === 'Episode') eps.push(i.Id);
                        if (i.Type === 'Series') series[i.Id] = 1;
                        else if (i.SeriesId) series[i.SeriesId] = 1;
                    });
                    cache[b.Id] = { n: b.ChildCount, t: type, ids: ids, s: Object.keys(series), e: eps };
                });
            }).then(function () {
                liste.forEach(function (b) {
                    var f = b.ProviderIds && b.ProviderIds.WolfFlixType;
                    if ((f === 's' || f === 'c') && cache[b.Id]) cache[b.Id].t = f;
                });
                if (perime) cache._t = Date.now();
                var existe = {};
                liste.forEach(function (b) { existe[b.Id] = true; });
                Object.keys(cache).forEach(function (k) { if (k !== '_t' && !existe[k]) delete cache[k]; });
                ecrireCache(cache);
                return liste.map(function (b) {
                    var c = cache[b.Id] || { t: 's', ids: [] };
                    var o = ordreStocke(b);
                    var force = b.ProviderIds && b.ProviderIds.WolfFlixType;
                    if (force === 's' || force === 'c') {
                        c.t = force;
                        if (cache[b.Id]) cache[b.Id].t = force;
                    }
                    return {
                        id: b.Id, nom: b.Name, tag: b.ImageTags && b.ImageTags.Primary,
                        cree: b.DateCreated, type: c.t, ids: ordonner(c.ids, o), perso: !!o, series: c.s || [], episodes: c.e || [],
                        vide: !!(force && !c.ids.length)
                    };
                });
            });
        });
        etat.promesse.catch(function () { etat.promesse = null; });
        return etat.promesse;
    }

    /* ---------- Cartes ---------- */
    function carte(o) {
        var img = o.tag ? image(o.imgId || o.id, o.tag, 360) : '';
        return '<div class="card overflowPortraitCard portraitCard wf-carte' + (o.classe ? ' ' + o.classe : '') + '" data-id="' + esc(o.id) + '">' +
            '<div class="cardBox cardBox-bottompadded">' +
            '<a class="cardScalable" href="' + esc(o.href || lienFiche(o.id)) + '">' +
            '<div class="cardPadder cardPadder-portrait"></div>' +
            '<div class="cardImageContainer coveredImage cardContent' + (img ? '' : ' wf-sans-image') + '"' + (img ? ' data-wf-src="' + esc(img) + '"' : '') + '>' +
            (img ? '' : '<span class="wf-sans-image-nom">' + esc(o.nom) + '</span>') +
            (o.vu ? '<div class="cardIndicators"><div class="playedIndicator indicator"></div></div>' : '') +
            (o.rang ? '<span class="wf-rang">' + o.rang + '</span>' : '') +
            (o.ruban ? '<span class="wf-ruban">' + esc(o.ruban) + '</span>' : '') +
            '</div></a>' +
            '<div class="cardText cardTextCentered cardText-first"><bdi>' + esc(o.nom) + '</bdi></div>' +
            (o.sous ? '<div class="cardText cardTextCentered cardText-secondary"><bdi>' + esc(o.sous) + '</bdi></div>' : '') +
            '</div></div>';
    }

    /* Présentation d'un élément quelconque (film, série, saison, épisode) en carte portrait */
    function presentation(e) {
        var r = { nom: e.Name, sous: e.ProductionYear || '', tag: e.ImageTags && e.ImageTags.Primary, imgId: e.Id };
        if (e.Type === 'Episode') {
            r.nom = 'S' + (e.ParentIndexNumber || '?') + ' · É' + (e.IndexNumber || '?') + ' — ' + e.Name;
            r.sous = e.SeriesName || '';
            if (e.SeriesPrimaryImageTag) { r.tag = e.SeriesPrimaryImageTag; r.imgId = e.SeriesId; }
        } else if (e.Type === 'Season') {
            r.nom = e.Name;
            r.sous = e.SeriesName || '';
            if (!r.tag && e.SeriesPrimaryImageTag) { r.tag = e.SeriesPrimaryImageTag; r.imgId = e.SeriesId; }
        } else if (e.Type === 'Series') {
            r.sous = 'Série' + (e.ProductionYear ? ' · ' + e.ProductionYear : '');
        }
        return r;
    }

    var observateurImages = 'IntersectionObserver' in window ? new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) {
            if (!e.isIntersecting) return;
            var el = e.target;
            el.style.backgroundImage = 'url("' + el.getAttribute('data-wf-src') + '")';
            el.removeAttribute('data-wf-src');
            observateurImages.unobserve(el);
        });
    }, { rootMargin: '300px' }) : null;

    function images(racine) {
        racine.querySelectorAll('[data-wf-src]').forEach(function (el) {
            if (observateurImages) observateurImages.observe(el);
            else {
                el.style.backgroundImage = 'url("' + el.getAttribute('data-wf-src') + '")';
                el.removeAttribute('data-wf-src');
            }
        });
    }

    function rangee(titre, cartes, cle, lien) {
        return '<div class="verticalSection wf-section wf-section-' + cle + '">' +
            '<div class="wf-section-entete padded-left padded-right">' +
            '<h2 class="sectionTitle sectionTitle-cards">' +
            (lien ? '<a class="wf-titre-lien" href="' + lien + '">' + esc(titre) + ' <span class="material-icons chevron_right" aria-hidden="true"></span></a>' : esc(titre)) +
            '</h2>' + fleches() + '</div>' +
            '<div class="wf-rangee padded-left padded-right">' + cartes.join('') + '</div></div>';
    }
    function fleches() {
        return '<div class="wf-fleches">' +
            '<button type="button" class="wf-fleche" data-wf-fleche="-1" aria-label="Précédent"><span class="material-icons chevron_left"></span></button>' +
            '<button type="button" class="wf-fleche" data-wf-fleche="1" aria-label="Suivant"><span class="material-icons chevron_right"></span></button></div>';
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-wf-fleche]');
        if (!b) return;
        var sec = b.closest('.wf-section, #wf-ordre');
        var r = sec && sec.querySelector('.wf-rangee');
        if (!r) return;
        r.scrollBy({ left: +b.getAttribute('data-wf-fleche') * r.clientWidth * 0.8, behavior: 'smooth' });
    });

    function compte(c) {
        var n = c.ids.length;
        if (c.type === 's') return n + (n > 1 ? ' films' : ' film');
        return n + (n > 1 ? ' titres' : ' titre');
    }

    /* ---------- « À suivre » : prochain titre non vu de chaque collection ---------- */
    function aSuivre(collections) {
        var q = { Recursive: true, EnableImages: false, EnableUserData: false };
        var episodesSuivis = [];
        collections.forEach(function (c) { episodesSuivis = episodesSuivis.concat(c.episodes || []); });
        var lots = [];
        for (var i = 0; i < episodesSuivis.length; i += 80) lots.push(episodesSuivis.slice(i, i + 80));
        return Promise.all([
            json('Users/' + uid() + '/Items', Object.assign({ IncludeItemTypes: 'Movie,Series,Season,Video', Filters: 'IsPlayed', SortBy: 'DatePlayed', SortOrder: 'Descending' }, q)),
            json('Users/' + uid() + '/Items', Object.assign({ IncludeItemTypes: 'Movie,Video,Episode', Filters: 'IsResumable', SortBy: 'DatePlayed', SortOrder: 'Descending', Fields: 'SeriesId' }, q)),
            json('Shows/NextUp', { UserId: uid(), Limit: 200, Fields: 'SeriesId', EnableImages: false, EnableUserData: false }).catch(function () { return { Items: [] }; }),
            Promise.all(lots.map(function (l) {
                return json('Users/' + uid() + '/Items', { Ids: l.join(','), EnableImages: false, SortBy: 'DatePlayed', SortOrder: 'Descending' })
                    .then(function (r) { return r.Items || []; }).catch(function () { return []; });
            }))
        ]).then(function (r) {
            var vu = {};
            var rang = {};
            var enCours = {};
            (r[0].Items || []).forEach(function (i, k) { vu[i.Id] = true; if (!(i.Id in rang)) rang[i.Id] = k + 1000; });
            [].concat.apply([], r[3]).forEach(function (i, k) {
                if (i.UserData && i.UserData.Played) { vu[i.Id] = true; if (!(i.Id in rang)) rang[i.Id] = k + 1100; }
            });
            (r[1].Items || []).forEach(function (i, k) {
                var id = i.SeriesId || i.Id;
                enCours[id] = true;
                if (!(id in rang) || rang[id] > k) rang[id] = k;
            });
            (r[2].Items || []).forEach(function (i, k) {
                if (!i.SeriesId) return;
                enCours[i.SeriesId] = true;
                if (!(i.SeriesId in rang) || rang[i.SeriesId] > k + 500) rang[i.SeriesId] = k + 500;
            });

            var choix = [];
            collections.forEach(function (c) {
                var ids = c.ids;
                if (ids.length < 2) return;
                var dernierVu = -1;
                var recent = Infinity;
                var prochain = null;
                ids.forEach(function (id, k) {
                    if (vu[id] || enCours[id]) {
                        if (vu[id]) dernierVu = k;
                        if (id in rang && rang[id] < recent) recent = rang[id];
                    }
                });
                if (recent === Infinity) return;
                for (var k = 0; k < ids.length && !prochain; k++) if (enCours[ids[k]] && !vu[ids[k]]) prochain = ids[k];
                for (var j = dernierVu + 1; j < ids.length && !prochain; j++) if (!vu[ids[j]]) prochain = ids[j];
                for (var m = 0; m < ids.length && !prochain; m++) if (!vu[ids[m]]) prochain = ids[m];
                if (!prochain) return;
                choix.push({ col: c, id: prochain, recent: recent, position: ids.indexOf(prochain) + 1 });
            });
            choix.sort(function (a, b) { return a.recent - b.recent; });
            choix = choix.slice(0, 30);
            if (!choix.length) return [];
            return json('Users/' + uid() + '/Items', {
                Ids: choix.map(function (c) { return c.id; }).join(','),
                Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1
            }).then(function (d) {
                var parId = {};
                (d.Items || []).forEach(function (i) { parId[i.Id] = i; });
                return choix.filter(function (c) { return parId[c.id]; }).map(function (c) {
                    c.item = parId[c.id];
                    return c;
                });
            });
        });
    }

    /* ---------- Accueil : quatre rangées ---------- */
    var enConstruction = typeof WeakSet === 'function' ? new WeakSet() : null;

    function accueil() {
        if (!html.classList.contains('wf-accueil') || html.classList.contains('wf-sans-sagas')) return;
        var conteneur = Array.prototype.filter.call(document.querySelectorAll('.homeSectionsContainer'), visible)[0];
        if (!conteneur || conteneur.querySelector('.wf-section') || !enConstruction || enConstruction.has(conteneur)) return;
        // Attendre que Jellyfin ait rempli ses propres rangées
        if (!conteneur.querySelector('.card')) return;
        enConstruction.add(conteneur);

        charger().then(function (cols) {
            return aSuivre(cols).then(function (suite) {
                var morceaux = { avant: '', apres: '' };
                ['s', 'c'].forEach(function (t) {
                    var s = suite.filter(function (c) { return c.col.type === t; });
                    if (s.length) {
                        morceaux.avant += rangee(NOMS[t].aSuivre, s.map(function (c) {
                            var pr = presentation(c.item);
                            return carte({
                                id: c.item.Id, nom: pr.nom, tag: pr.tag, imgId: pr.imgId,
                                sous: c.col.nom + ' · ' + c.position + '/' + c.col.ids.length
                            });
                        }), 'suivre-' + t);
                    }
                    var r = cols.filter(function (c) { return c.type === t && c.ids.length; }).slice(0, 20);
                    if (r.length) {
                        morceaux.apres += rangee(NOMS[t].recents, r.map(function (c) {
                            return carte({ id: c.id, nom: c.nom, tag: c.tag, sous: compte(c) });
                        }), 'recents-' + t, '#/home?wf=' + (t === 's' ? 'sagas' : 'cycles'));
                    }
                });
                if (conteneur.querySelector('.wf-section')) return;
                // « Continuer de regarder » (et pas « À suivre », qui a le même marqueur)
                var section = null;
                conteneur.querySelectorAll('.itemsContainer[data-monitor*="videoplayback"]').forEach(function (r) {
                    var sec = r.closest('.verticalSection');
                    if (!section && sec && !sec.querySelector('a[href*="nextup"]')) section = sec;
                });
                var repere = section || conteneur.querySelector('.section0');
                if (morceaux.avant) {
                    if (repere) repere.insertAdjacentHTML('afterend', morceaux.avant);
                    else conteneur.insertAdjacentHTML('afterbegin', morceaux.avant);
                }
                if (morceaux.apres) conteneur.insertAdjacentHTML('beforeend', morceaux.apres);
                images(conteneur);
            });
        }).catch(function () { /* on réessaiera au prochain passage */ }).then(function () {
            setTimeout(function () { enConstruction.delete(conteneur); }, 4000);
        });
    }

    /* ---------- Pages « Sagas » et « Cycles » (pages de 100, création) ---------- */
    var PAR_PAGE = 100;

    function hautEntete() {
        var barre = document.querySelector('.MuiAppBar-root');
        return (barre ? Math.round(barre.getBoundingClientRect().bottom) : 64) + 'px';
    }
    window.addEventListener('resize', function () {
        var el = document.getElementById('wf-page');
        if (el) el.style.setProperty('--wf-haut', hautEntete());
    }, { passive: true });

    function page() {
        var m = /^#\/home\?(?:[^#]*&)?wf=(sagas|cycles)/.exec(location.hash || '');
        var el = document.getElementById('wf-page');
        if (!m) {
            if (el) el.remove();
            html.classList.remove('wf-page-ouverte');
            return;
        }
        var type = m[1] === 'sagas' ? 's' : 'c';
        if (el) el.style.setProperty('--wf-haut', hautEntete());
        if (el && el.getAttribute('data-type') === type) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'wf-page';
            document.body.appendChild(el);
        }
        el.style.setProperty('--wf-haut', hautEntete());
        el.setAttribute('data-type', type);
        html.classList.add('wf-page-ouverte');
        var tri = sessionStorage.getItem('wf-tri-' + type) || 'recent';
        el.innerHTML = '<div class="wf-page-entete padded-left padded-right">' +
            '<div><p class="wf-page-surtitre">WolfFlix</p><h1 class="wf-page-titre">' + NOMS[type].plusieurs + '</h1><p class="wf-page-compte"></p></div>' +
            '<div class="wf-page-outils">' +
            '<button type="button" class="wf-btn wf-btn-pri wf-creer"><span class="material-icons add" aria-hidden="true"></span> ' +
            (type === 's' ? 'Ajouter une saga' : 'Ajouter un cycle') + '</button>' +
            '<label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span><input type="search" placeholder="Rechercher" aria-label="Rechercher"></label>' +
            '<select class="wf-tri" aria-label="Trier">' +
            '<option value="recent">Ajout récent</option><option value="nom">Nom</option><option value="taille">Nombre de titres</option>' +
            '</select>' +
            '<div class="wf-pagination"><button type="button" class="wf-fleche" data-page="-1" aria-label="Page précédente"><span class="material-icons chevron_left"></span></button>' +
            '<span class="wf-pagination-texte"></span>' +
            '<button type="button" class="wf-fleche" data-page="1" aria-label="Page suivante"><span class="material-icons chevron_right"></span></button></div>' +
            '</div></div>' +
            '<div class="wf-page-grille padded-left padded-right">' + loupAttente() + '</div>' +
            '<div class="wf-pagination wf-pagination-bas padded-left padded-right"></div>';
        el.querySelector('.wf-tri').value = tri;
        var creerBtn = el.querySelector('.wf-creer');
        creerBtn.hidden = true;
        creerBtn.addEventListener('click', function () { creer(type); });
        // Bouton réservé aux administrateurs
        api().getCurrentUser().then(function (u) {
            if (u && u.Policy && u.Policy.IsAdministrator) creerBtn.hidden = false;
            else creerBtn.remove();
        }).catch(function () { creerBtn.remove(); });

        charger().then(function (cols) {
            if (el.getAttribute('data-type') !== type || !el.isConnected) return;
            var liste = cols.filter(function (c) { return c.type === type && (c.ids.length || c.vide); });
            var grille = el.querySelector('.wf-page-grille');
            var champ = el.querySelector('input');
            var select = el.querySelector('.wf-tri');
            var numPage = +sessionStorage.getItem('wf-numpage-' + type) || 0;
            var filtree = [];
            function afficher(garderPage) {
                var f = champ.value.trim().toLowerCase();
                var t = select.value;
                sessionStorage.setItem('wf-tri-' + type, t);
                filtree = liste.filter(function (c) { return !f || c.nom.toLowerCase().indexOf(f) !== -1; });
                filtree.sort(function (a, b) {
                    if (t === 'nom') return a.nom.localeCompare(b.nom, 'fr');
                    if (t === 'taille') return b.ids.length - a.ids.length;
                    return (b.cree || '').localeCompare(a.cree || '');
                });
                var pages = Math.max(1, Math.ceil(filtree.length / PAR_PAGE));
                if (!garderPage) numPage = 0;
                numPage = Math.min(Math.max(numPage, 0), pages - 1);
                sessionStorage.setItem('wf-numpage-' + type, numPage);
                var debut = numPage * PAR_PAGE;
                var tranche = filtree.slice(debut, debut + PAR_PAGE);
                el.querySelector('.wf-page-compte').textContent = filtree.length + ' ' + (filtree.length > 1 ? NOMS[type].plusieurs : NOMS[type].un).toLowerCase();
                var texte = filtree.length ? (debut + 1) + '-' + (debut + tranche.length) + ' de ' + filtree.length : '0';
                el.querySelectorAll('.wf-pagination-texte').forEach(function (x) { x.textContent = texte; });
                el.querySelectorAll('[data-page="-1"]').forEach(function (x) { x.disabled = numPage === 0; });
                el.querySelectorAll('[data-page="1"]').forEach(function (x) { x.disabled = numPage >= pages - 1; });
                el.querySelector('.wf-pagination-bas').style.display = pages > 1 ? '' : 'none';
                grille.innerHTML = tranche.length ? tranche.map(function (c) {
                    return carte({ id: c.id, nom: c.nom, tag: c.tag, sous: compte(c) + (c.perso ? ' · ordre perso' : '') });
                }).join('') : '<p class="wf-vide">Rien ici pour l\'instant.</p>';
                images(grille);
            }
            el.querySelector('.wf-pagination-bas').innerHTML = el.querySelector('.wf-pagination').innerHTML;
            el.addEventListener('click', function (e) {
                var b = e.target.closest('[data-page]');
                if (!b || b.disabled) return;
                numPage += +b.getAttribute('data-page');
                afficher(true);
                el.scrollTo({ top: 0, behavior: 'smooth' });
            });
            var minuterie;
            champ.addEventListener('input', function () { clearTimeout(minuterie); minuterie = setTimeout(function () { afficher(false); }, 150); });
            select.addEventListener('change', function () { afficher(false); });
            afficher(true);
            var defile = +sessionStorage.getItem('wf-defile-' + type) || 0;
            if (defile) el.scrollTop = defile;
            el.addEventListener('scroll', function () { sessionStorage.setItem('wf-defile-' + type, el.scrollTop); }, { passive: true });
        }).catch(function () {
            var g = el.querySelector('.wf-page-grille');
            if (g) g.innerHTML = '<p class="wf-vide">Impossible de charger les collections. Réessaie dans un instant.</p>';
        });
    }

    /* ---------- Créer une saga ou un cycle ---------- */
    function creer(type) {
        var fond = document.createElement('div');
        fond.className = 'wf-editeur-fond';
        fond.innerHTML = '<form class="wf-editeur wf-creation" role="dialog" aria-modal="true">' +
            '<header><p class="wf-page-surtitre">Nouveau</p><h2>' + (type === 's' ? 'Nouvelle saga' : 'Nouveau cycle') + '</h2>' +
            '<p class="wf-aide">Donne-lui un nom ; tu ajouteras ensuite les titres dans l\'ordre voulu.</p></header>' +
            '<div class="wf-editeur-ajout wf-ouvert"><label class="wf-champ"><span class="material-icons edit" aria-hidden="true"></span>' +
            '<input type="text" required maxlength="120" placeholder="' + (type === 's' ? 'Ex. : Marvel - Saga' : 'Ex. : Arrowverse - Cycle') + '" aria-label="Nom"></label></div>' +
            '<footer><span class="wf-editeur-etat"></span><button type="button" class="wf-btn wf-btn-sec" data-act="annuler">Annuler</button>' +
            '<button type="submit" class="wf-btn wf-btn-pri">Créer</button></footer></form>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var champ = fond.querySelector('input');
        setTimeout(function () { champ.focus(); }, 50);
        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
        }
        fond.addEventListener('click', function (e) {
            if (e.target === fond || e.target.closest('[data-act="annuler"]')) fermer();
        });
        fond.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });
        fond.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var nom = champ.value.trim();
            if (!nom) return;
            fond.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
            fond.querySelector('.wf-editeur-etat').textContent = 'Création…';
            var a = api();
            a.ajax({ type: 'POST', url: url('Collections', { Name: nom, IsLocked: false }), dataType: 'json' }).then(function (r) {
                var id = r && (r.Id || r.id);
                if (!id) throw new Error('pas d\'identifiant');
                return a.getItem(uid(), id).then(function (item) {
                    item.ProviderIds = item.ProviderIds || {};
                    item.ProviderIds.WolfFlixType = type;
                    return a.updateItem(item);
                }).catch(function () { /* le type sera déduit du contenu */ }).then(function () {
                    var cache = lireCache();
                    cache[id] = { n: 0, t: type, ids: [] };
                    ecrireCache(cache);
                    etat.promesse = null;
                    sessionStorage.setItem('wf-ouvrir-editeur', id);
                    fermer();
                    toast(type === 's' ? 'Saga créée' : 'Cycle créé');
                    location.hash = lienFiche(id).slice(1);
                });
            }).catch(function () {
                fond.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
                fond.querySelector('.wf-editeur-etat').textContent = '';
                toast('Création impossible (droits administrateur requis ?)', true);
            });
        });
    }

    /* ---------- Favoris : « Collections » devient « Sagas » et « Cycles » ---------- */
    function favoris() {
        if (!html.classList.contains('wf-favoris')) return;
        var carteBs = Array.prototype.filter.call(document.querySelectorAll('.card[data-type="BoxSet"]'), visible)[0];
        var section = carteBs && carteBs.closest('.verticalSection');
        if (!section || section.classList.contains('wf-favoris-collections')) return;
        section.classList.add('wf-favoris-collections');
        var ids = Array.prototype.map.call(section.querySelectorAll('.card[data-id]'), function (c) { return c.getAttribute('data-id'); });
        charger().then(function (cols) {
            var parId = {};
            cols.forEach(function (c) { parId[c.id] = c; });
            var morceaux = '';
            ['s', 'c'].forEach(function (t) {
                var l = ids.map(function (i) { return parId[i]; }).filter(function (c) { return c && c.type === t; });
                if (l.length) {
                    morceaux += rangee(NOMS[t].plusieurs, l.map(function (c) {
                        return carte({ id: c.id, nom: c.nom, tag: c.tag, sous: compte(c) });
                    }), 'favoris-' + t, '#/home?wf=' + (t === 's' ? 'sagas' : 'cycles'));
                }
            });
            if (!morceaux) { section.classList.remove('wf-favoris-collections'); return; }
            section.insertAdjacentHTML('afterend', morceaux);
            section.classList.add('wf-remplacee');
            images(section.parentNode);
        }).catch(function () { section.classList.remove('wf-favoris-collections'); });
    }

    /* ---------- Bibliothèques : Films = sagas seulement, Séries = cycles seulement ---------- */
    function bibliotheques() {
        var h = location.hash || '';
        var garder = /^#\/movies/.test(h) ? 's' : null;
        if (!garder) return;
        var cache = lireCache();
        var inconnus = false;
        document.querySelectorAll('.card[data-type="BoxSet"][data-id]:not(.wf-trie)').forEach(function (c) {
            var e = cache[c.getAttribute('data-id')];
            if (!e) { inconnus = true; return; }
            c.classList.add('wf-trie');
            if (e.t !== garder) c.classList.add('wf-hors-bibliotheque');
        });
        if (inconnus && !etat.promesse) charger().then(passer).catch(function () { /* rien */ });
    }

    /* ---------- Fiches ---------- */
    var typesItems = {};
    function typeItem(id) {
        if (typesItems[id]) return typesItems[id];
        typesItems[id] = api().getItem(uid(), id);
        typesItems[id].catch(function () { delete typesItems[id]; });
        return typesItems[id];
    }

    function pageFiche() {
        var p = document.querySelector('#itemDetailPage:not(.hide)');
        return visible(p) ? p : null;
    }

    function fiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || html.classList.contains('wf-sans-sagas')) return;
        var id = m[1];
        var page = pageFiche();
        if (!page) return;
        var cache = lireCache();

        // Section « Collections » d'un film ou d'une série
        var sec = page.querySelector('#collectionsCollapsible:not(.hide)');
        if (sec) {
            var types = {};
            sec.querySelectorAll('.card[data-id]').forEach(function (c) {
                var e = cache[c.getAttribute('data-id')];
                types[e ? e.t : 's'] = true;
            });
            var titre = types.s && types.c ? 'Sagas et cycles' : types.c ? 'Cycles' : 'Sagas';
            var h = sec.querySelector('.sectionTitle');
            if (h && h.textContent !== titre) h.textContent = titre;
        }

        // Étiquettes techniques à ne pas montrer
        page.querySelectorAll('.itemTags a').forEach(function (a) {
            if (/^wfordre:/.test(a.textContent.trim())) a.style.display = 'none';
        });

        typeItem(id).then(function (item) {
            var p = pageFiche();
            if (!p) return;
            if (item.Type !== 'BoxSet') {
                p.classList.remove('wf-collection-ordonnee');
                var reste = p.querySelector('#wf-ordre');
                if (reste) reste.remove();
                return;
            }
            var entree = cache[id];
            var t = entree ? entree.t : 's';
            var nom = p.querySelector('.nameContainer');
            if (nom && !nom.querySelector('.wf-surtitre')) {
                nom.insertAdjacentHTML('afterbegin', '<div class="wf-surtitre">' + NOMS[t].un + '</div>');
            }
            var hote = p.querySelector('.collectionItems');
            if (!hote || p.querySelector('#wf-ordre[data-id="' + id + '"]')) return;
            var ancien = p.querySelector('#wf-ordre');
            if (ancien) ancien.remove();
            var bloc = document.createElement('div');
            bloc.id = 'wf-ordre';
            bloc.setAttribute('data-id', id);
            bloc.className = 'verticalSection detailVerticalSection';
            bloc.innerHTML = loupAttente();
            hote.parentNode.insertBefore(bloc, hote);
            remplirOrdre(bloc, item, t);
        }).catch(function () { /* fiche inaccessible */ });
    }

    function enfantsOrdonnes(item) {
        return json('Users/' + uid() + '/Items', {
            ParentId: item.Id, SortBy: 'PremiereDate,ProductionYear,SortName',
            Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1
        }).then(function (r) {
            var parId = {};
            var ids = (r.Items || []).map(function (i) { parId[i.Id] = i; return i.Id; });
            return ordonner(ids, ordreStocke(item)).map(function (i) { return parId[i]; });
        });
    }

    function remplirOrdre(bloc, item, t) {
        Promise.all([enfantsOrdonnes(item), api().getCurrentUser()]).then(function (r) {
            var enfants = r[0];
            var user = r[1] || {};
            var admin = !!(user.Policy && user.Policy.IsAdministrator);
            var perso = !!ordreStocke(item);
            var groupes = groupesStockes(item);
            var dernierVu = -1;
            enfants.forEach(function (e, k) { if (e.UserData && e.UserData.Played) dernierVu = k; });
            var prochain = -1;
            for (var k = dernierVu + 1; k < enfants.length; k++) {
                if (!(enfants[k].UserData && enfants[k].UserData.Played)) { prochain = k; break; }
            }
            if (dernierVu === -1) prochain = -1;
            var groupeCourant = '';
            var cartes = enfants.map(function (e, k) {
                var g = groupes[e.Id] || '';
                var sep = '';
                if (g !== groupeCourant) {
                    sep = g ? '<div class="wf-groupe-separateur" title="Saison custom"><span class="wf-groupe-libelle">Saison custom</span><span class="wf-groupe-nom">' + esc(g) + '</span></div>'
                        : '<div class="wf-groupe-separateur wf-groupe-fin" aria-hidden="true"></div>';
                    groupeCourant = g;
                }
                var pr = presentation(e);
                return sep + carte({
                    id: e.Id, nom: pr.nom, tag: pr.tag, imgId: pr.imgId,
                    sous: pr.sous, rang: k + 1,
                    vu: !!(e.UserData && e.UserData.Played),
                    ruban: k === prochain ? 'À suivre' : '',
                    classe: (k === prochain ? 'wf-prochain ' : '') + (g ? 'wf-dans-groupe' : '')
                });
            });
            bloc.innerHTML = '<div class="wf-ordre-entete padded-right">' +
                '<h2 class="sectionTitle sectionTitle-cards">Ordre de visionnage' + (perso ? ' <span class="wf-pastille">personnalisé</span>' : '') + '</h2>' +
                '<div class="wf-ordre-actions">' +
                (admin ? '<button type="button" class="wf-btn wf-btn-sec wf-ordre-ajouter"><span class="material-icons add" aria-hidden="true"></span> Ajouter</button>' +
                    '<button type="button" class="wf-btn wf-btn-sec wf-ordre-modifier"><span class="material-icons reorder" aria-hidden="true"></span> Modifier l\'ordre</button>' : '') +
                fleches() + '</div></div><div class="wf-rangee">' + cartes.join('') +
                (admin ? '<button type="button" class="card overflowPortraitCard portraitCard wf-carte-ajout" aria-label="Ajouter un titre">' +
                    '<div class="cardBox cardBox-bottompadded"><div class="cardScalable"><div class="cardPadder cardPadder-portrait"></div>' +
                    '<div class="cardContent wf-ajout-contenu"><span class="material-icons add"></span><span>Ajouter</span></div></div></div></button>' : '') +
                '</div>';
            images(bloc);
            var p = pageFiche();
            if (p) p.classList.add('wf-collection-ordonnee');
            var b = bloc.querySelector('.wf-ordre-modifier');
            if (b) b.addEventListener('click', function () { editeur(item, enfants, t, bloc, false); });
            if (admin && sessionStorage.getItem('wf-ouvrir-editeur') === item.Id) {
                sessionStorage.removeItem('wf-ouvrir-editeur');
                editeur(item, enfants, t, bloc, true);
            }
            bloc.querySelectorAll('.wf-ordre-ajouter, .wf-carte-ajout').forEach(function (x) {
                x.addEventListener('click', function () { editeur(item, enfants, t, bloc, true); });
            });
        }).catch(function () {
            bloc.remove();
        });
    }

    /* ---------- Éditeur d'ordre (films, séries, saisons entières, épisodes, saisons custom) ---------- */
    var TYPES_LIBELLES = { Movie: 'Film', Series: 'Série', Season: 'Saison', Episode: 'Épisode', Video: 'Vidéo' };

    function elementListe(e) {
        var pr = presentation(e);
        return { k: 'i' + e.Id, sorte: 'item', id: e.Id, nom: pr.nom, sous: e.Type === 'Movie' ? (e.ProductionYear || '') : pr.sous, type: e.Type, tag: pr.tag, imgId: pr.imgId };
    }

    function editeur(item, enfants, t, bloc, ajout) {
        var cycle = t === 'c';
        var groupes = groupesStockes(item);
        var liste = [];
        var courant = '';
        var compteurGroupes = 0;
        enfants.forEach(function (e) {
            var g = groupes[e.Id] || '';
            if (g !== courant) {
                liste.push({ k: 'g' + (compteurGroupes++), sorte: 'groupe', nom: g });
                courant = g;
            }
            liste.push(elementListe(e));
        });
        var initiaux = enfants.map(function (e) { return e.Id; });
        var fond = document.createElement('div');
        fond.className = 'wf-editeur-fond';
        fond.innerHTML = '<div class="wf-editeur" role="dialog" aria-modal="true" aria-label="Ordre de visionnage">' +
            '<header><p class="wf-page-surtitre">' + NOMS[t].un + '</p><h2>' + esc(item.Name) + '</h2>' +
            '<p class="wf-aide">Glisse par la poignée ou utilise les flèches.' + (cycle ? ' Une « saison custom » regroupe les titres placés en dessous, jusqu\'à la suivante ou à une fin de saison custom.' : '') + '</p></header>' +
            '<ol class="wf-editeur-liste"></ol>' +
            '<div class="wf-editeur-ajout">' +
            '<div class="wf-editeur-boutons"><button type="button" class="wf-btn wf-btn-sec wf-editeur-plus" data-act="plus"><span class="material-icons add" aria-hidden="true"></span> Ajouter un titre</button>' +
            (cycle ? '<button type="button" class="wf-btn wf-btn-sec" data-act="groupe"><span class="material-icons playlist_add" aria-hidden="true"></span> Saison custom</button>' +
                '<button type="button" class="wf-btn wf-btn-sec" data-act="fin-groupe"><span class="material-icons playlist_remove" aria-hidden="true"></span> Fin de saison custom</button>' : '') +
            '</div>' +
            '<label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span>' +
            '<input type="search" placeholder="' + (cycle ? 'Film, série ou épisode…' : 'Film ou série…') + '" aria-label="Rechercher"></label>' +
            '<div class="wf-editeur-resultats"></div></div>' +
            '<footer><span class="wf-editeur-etat"></span><button type="button" class="wf-btn wf-btn-sec" data-act="annuler">Annuler</button>' +
            '<button type="button" class="wf-btn wf-btn-pri" data-act="enregistrer">Enregistrer</button></footer></div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var ol = fond.querySelector('.wf-editeur-liste');
        var etatTexte = fond.querySelector('.wf-editeur-etat');

        function ligne(e) {
            if (e.sorte === 'groupe') {
                return '<li class="wf-ligne-groupe' + (e.nom ? '' : ' wf-ligne-groupe-fin') + '" data-k="' + e.k + '">' +
                    '<span class="wf-poignee material-icons drag_indicator" aria-label="Déplacer"></span>' +
                    '<span class="material-icons ' + (e.nom ? 'folder_special' : 'playlist_remove') + ' wf-groupe-icone" aria-hidden="true"></span>' +
                    (e.nom || e.nom === undefined ? '' : '') +
                    '<input class="wf-groupe-champ" type="text" maxlength="80" value="' + esc(e.nom) + '" placeholder="Nom de la saison custom (vide = fin de saison custom)" aria-label="Nom de la saison custom">' +
                    '<button type="button" class="wf-icone" data-act="haut" aria-label="Monter"><span class="material-icons expand_less"></span></button>' +
                    '<button type="button" class="wf-icone" data-act="bas" aria-label="Descendre"><span class="material-icons expand_more"></span></button>' +
                    '<button type="button" class="wf-icone wf-icone-retirer" data-act="retirer" aria-label="Retirer"><span class="material-icons close"></span></button></li>';
            }
            var img = e.tag ? image(e.imgId || e.id, e.tag, 120) : '';
            return '<li data-k="' + e.k + '"' + (groupeDe(e) ? ' class="wf-ligne-dans-groupe"' : '') + '>' +
                '<span class="wf-poignee material-icons drag_indicator" aria-label="Déplacer"></span>' +
                '<span class="wf-num"></span>' +
                '<span class="wf-vignette"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></span>' +
                '<span class="wf-nom">' + esc(e.nom) + (e.sous ? ' <small>' + esc(e.sous) + '</small>' : '') +
                '<small class="wf-type">' + (TYPES_LIBELLES[e.type] || 'Titre') + '</small></span>' +
                '<button type="button" class="wf-icone" data-act="haut" aria-label="Monter"><span class="material-icons expand_less"></span></button>' +
                '<button type="button" class="wf-icone" data-act="bas" aria-label="Descendre"><span class="material-icons expand_more"></span></button>' +
                '<button type="button" class="wf-icone wf-icone-retirer" data-act="retirer" aria-label="Retirer"><span class="material-icons close"></span></button>' +
                '</li>';
        }
        function groupeDe(e) {
            var g = '';
            for (var i = 0; i < liste.length && liste[i] !== e; i++) if (liste[i].sorte === 'groupe') g = liste[i].nom;
            return g;
        }
        function numeroter() {
            var n = 0;
            var dansGroupe = false;
            Array.prototype.forEach.call(ol.children, function (li) {
                if (li.classList.contains('wf-ligne-groupe')) {
                    dansGroupe = !!li.querySelector('.wf-groupe-champ').value.trim();
                    li.classList.toggle('wf-ligne-groupe-fin', !dansGroupe);
                    return;
                }
                li.querySelector('.wf-num').textContent = ++n;
                li.classList.toggle('wf-ligne-dans-groupe', dansGroupe);
            });
        }
        function dessiner() {
            ol.innerHTML = liste.map(ligne).join('');
            numeroter();
        }
        function relireDom() {
            var parK = {};
            liste.forEach(function (e) { parK[e.k] = e; });
            liste = Array.prototype.map.call(ol.children, function (li) {
                var e = parK[li.getAttribute('data-k')];
                if (e.sorte === 'groupe') e.nom = li.querySelector('.wf-groupe-champ').value.trim();
                return e;
            });
            numeroter();
        }
        dessiner();
        ol.addEventListener('input', function (e) {
            if (e.target.classList.contains('wf-groupe-champ')) relireDom();
        });

        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
            document.removeEventListener('keydown', clavier, true);
        }
        function clavier(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }
        document.addEventListener('keydown', clavier, true);

        function ajouter(e) {
            relireDom();
            var nouveaux = [].concat(e).filter(function (x) {
                return !liste.some(function (y) { return y.sorte === 'item' && y.id === x.id; });
            });
            if (!nouveaux.length) { toast('Déjà dans la liste'); return; }
            liste = liste.concat(nouveaux);
            dessiner();
            var dernier = ol.lastElementChild;
            if (dernier) {
                dernier.classList.add('wf-nouveau');
                dernier.scrollIntoView({ block: 'nearest' });
            }
        }

        fond.addEventListener('click', function (e) {
            if (e.target === fond) { fermer(); return; }
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (['haut', 'bas', 'retirer'].indexOf(act) !== -1) relireDom();
            var li = b.closest('li');
            var k = li ? Array.prototype.indexOf.call(ol.children, li) : -1;
            if (act === 'haut' && k > 0) { liste.splice(k - 1, 0, liste.splice(k, 1)[0]); dessiner(); }
            else if (act === 'bas' && k > -1 && k < liste.length - 1) { liste.splice(k + 1, 0, liste.splice(k, 1)[0]); dessiner(); }
            else if (act === 'retirer' && k > -1) { liste.splice(k, 1); dessiner(); }
            else if (act === 'groupe' || act === 'fin-groupe') {
                relireDom();
                liste.push({ k: 'g' + (compteurGroupes++), sorte: 'groupe', nom: act === 'groupe' ? 'Saison custom ' + (liste.filter(function (x) { return x.sorte === 'groupe' && x.nom; }).length + 1) : '' });
                dessiner();
                var l = ol.lastElementChild;
                l.scrollIntoView({ block: 'nearest' });
                if (act === 'groupe') { var c = l.querySelector('input'); c.focus(); c.select(); }
            }
            else if (act === 'ajouter') {
                ajouter({ k: 'i' + b.getAttribute('data-id'), sorte: 'item', id: b.getAttribute('data-id'), nom: b.getAttribute('data-nom'), sous: b.getAttribute('data-sous'), type: b.getAttribute('data-type'), tag: b.getAttribute('data-tag'), imgId: b.getAttribute('data-img') || b.getAttribute('data-id') });
                b.classList.add('wf-ajoute');
            }
            else if (act === 'saisons') ouvrirSaisons(b);
            else if (act === 'episodes') ouvrirEpisodes(b);
            else if (act === 'tous-episodes') {
                var boutons = b.closest('.wf-sous-resultats').querySelectorAll('[data-act="ajouter"]');
                boutons.forEach(function (x) { x.click(); });
            }
            else if (act === 'plus') ouvrirAjout();
            else if (act === 'annuler') fermer();
            else if (act === 'enregistrer') enregistrer();
        });

        // Glisser-déposer (souris et tactile)
        var tire = null;
        ol.addEventListener('pointerdown', function (e) {
            var poignee = e.target.closest('.wf-poignee');
            if (!poignee) return;
            e.preventDefault();
            relireDom();
            tire = poignee.closest('li');
            tire.classList.add('wf-tire');
            poignee.setPointerCapture(e.pointerId);
        });
        ol.addEventListener('pointermove', function (e) {
            if (!tire) return;
            var y = e.clientY;
            var autres = Array.prototype.filter.call(ol.children, function (li) { return li !== tire; });
            var avant = null;
            for (var i = 0; i < autres.length; i++) {
                var r = autres[i].getBoundingClientRect();
                if (y < r.top + r.height / 2) { avant = autres[i]; break; }
            }
            if (avant !== tire.nextElementSibling) ol.insertBefore(tire, avant);
            var zone = ol.getBoundingClientRect();
            if (y < zone.top + 30) ol.scrollTop -= 8;
            else if (y > zone.bottom - 30) ol.scrollTop += 8;
        });
        function lacher() {
            if (!tire) return;
            tire.classList.remove('wf-tire');
            tire = null;
            relireDom();
        }
        ol.addEventListener('pointerup', lacher);
        ol.addEventListener('pointercancel', lacher);

        // Recherche
        var champ = fond.querySelector('.wf-editeur-ajout input');
        var res = fond.querySelector('.wf-editeur-resultats');
        function ouvrirAjout() {
            fond.querySelector('.wf-editeur-ajout').classList.add('wf-ouvert');
            champ.focus();
        }
        if (ajout) setTimeout(ouvrirAjout, 50);

        function boutonAjout(i, libelle) {
            var pr = presentation(i);
            var tag = pr.tag || '';
            var img = tag ? image(pr.imgId, tag, 120) : '';
            return '<button type="button" class="wf-resultat" data-act="ajouter"' +
                ' data-id="' + esc(i.Id) + '" data-nom="' + esc(pr.nom) + '" data-sous="' + esc(i.Type === 'Movie' ? (i.ProductionYear || '') : pr.sous) + '"' +
                ' data-type="' + esc(i.Type) + '" data-tag="' + esc(tag) + '" data-img="' + esc(pr.imgId) + '">' +
                '<span class="wf-vignette"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></span>' +
                '<span class="wf-nom">' + esc(libelle || pr.nom) + (pr.sous ? ' <small>' + esc(pr.sous) + '</small>' : '') +
                '<small class="wf-type">' + (TYPES_LIBELLES[i.Type] || 'Titre') + '</small></span>' +
                '<span class="material-icons add_circle" aria-hidden="true"></span></button>';
        }
        function resultatSerie(i) {
            return '<div class="wf-resultat-serie">' + boutonAjout(i, i.Name + ' (série entière)') +
                (cycle ? '<button type="button" class="wf-lien-mini" data-act="saisons" data-serie="' + esc(i.Id) + '"><span class="material-icons expand_more" aria-hidden="true"></span> Saisons et épisodes</button>' +
                    '<div class="wf-sous-resultats" data-serie="' + esc(i.Id) + '" hidden></div>' : '') + '</div>';
        }
        function ouvrirSaisons(b) {
            var id = b.getAttribute('data-serie');
            var zone = fond.querySelector('.wf-sous-resultats[data-serie="' + id + '"]');
            if (!zone) return;
            if (!zone.hidden) { zone.hidden = true; return; }
            zone.hidden = false;
            zone.innerHTML = loupAttente();
            json('Shows/' + id + '/Seasons', { UserId: uid(), EnableImages: true, ImageTypeLimit: 1, EnableImageTypes: 'Primary' }).then(function (r) {
                zone.innerHTML = (r.Items || []).map(function (sa) {
                    return '<div class="wf-resultat-saison">' + boutonAjout(sa, sa.Name + ' (entière)') +
                        '<button type="button" class="wf-lien-mini" data-act="episodes" data-serie="' + esc(id) + '" data-saison="' + esc(sa.Id) + '">' +
                        '<span class="material-icons expand_more" aria-hidden="true"></span> Épisodes un par un</button>' +
                        '<div class="wf-sous-resultats" data-saison="' + esc(sa.Id) + '" hidden></div></div>';
                }).join('') || '<p class="wf-vide">Aucune saison.</p>';
            }).catch(function () { zone.innerHTML = '<p class="wf-vide">Saisons introuvables.</p>'; });
        }
        function ouvrirEpisodes(b) {
            var sid = b.getAttribute('data-saison');
            var zone = fond.querySelector('.wf-sous-resultats[data-saison="' + sid + '"]');
            if (!zone) return;
            if (!zone.hidden) { zone.hidden = true; return; }
            zone.hidden = false;
            zone.innerHTML = loupAttente();
            json('Shows/' + b.getAttribute('data-serie') + '/Episodes', { UserId: uid(), SeasonId: sid, EnableImageTypes: 'Primary', ImageTypeLimit: 1 }).then(function (r) {
                zone.innerHTML = '<button type="button" class="wf-lien-mini" data-act="tous-episodes"><span class="material-icons done_all" aria-hidden="true"></span> Ajouter tous les épisodes un par un</button>' +
                    (r.Items || []).map(function (ep) { return boutonAjout(ep); }).join('');
            }).catch(function () { zone.innerHTML = '<p class="wf-vide">Épisodes introuvables.</p>'; });
        }

        var minuterie;
        champ.addEventListener('input', function () {
            clearTimeout(minuterie);
            var terme = champ.value.trim();
            if (terme.length < 2) { res.innerHTML = ''; return; }
            minuterie = setTimeout(function () {
                json('Users/' + uid() + '/Items', {
                    searchTerm: terme, IncludeItemTypes: cycle ? 'Movie,Series,Episode' : 'Movie,Series', Recursive: true, Limit: 15,
                    Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: false
                }).then(function (r) {
                    if (champ.value.trim() !== terme) return;
                    res.innerHTML = (r.Items || []).map(function (i) {
                        return i.Type === 'Series' ? resultatSerie(i) : boutonAjout(i);
                    }).join('') || '<p class="wf-vide">Aucun résultat.</p>';
                }).catch(function () { res.innerHTML = '<p class="wf-vide">Recherche impossible.</p>'; });
            }, 300);
        });

        // Enregistrement
        function enregistrer() {
            relireDom();
            var ids = liste.filter(function (e) { return e.sorte === 'item'; }).map(function (e) { return e.id; });
            var jetonsListe = [];
            var groupeOuvert = false;
            liste.forEach(function (e) {
                if (e.sorte === 'groupe') {
                    if (e.nom) { jetonsListe.push('~' + encodeURIComponent(e.nom)); groupeOuvert = true; }
                    else if (groupeOuvert) { jetonsListe.push('~'); groupeOuvert = false; }
                } else {
                    jetonsListe.push(e.id);
                }
            });
            var ajouts = ids.filter(function (i) { return initiaux.indexOf(i) === -1; });
            var retraits = initiaux.filter(function (i) { return ids.indexOf(i) === -1; });
            var boutons = fond.querySelectorAll('footer button');
            boutons.forEach(function (b) { b.disabled = true; });
            etatTexte.textContent = 'Enregistrement…';
            var a = api();
            var p = Promise.resolve();
            if (ajouts.length) p = p.then(function () { return a.ajax({ type: 'POST', url: url('Collections/' + item.Id + '/Items', { ids: ajouts.join(',') }) }); });
            if (retraits.length) p = p.then(function () { return a.ajax({ type: 'DELETE', url: url('Collections/' + item.Id + '/Items', { ids: retraits.join(',') }) }); });
            var valeur = jetonsListe.join(',');
            p.then(function () { return a.getItem(uid(), item.Id); }).then(function (complet) {
                complet.ProviderIds = complet.ProviderIds || {};
                complet.ProviderIds.WolfFlix = valeur;
                if (cycle) complet.ProviderIds.WolfFlixType = 'c';
                complet.Tags = (complet.Tags || []).filter(function (x) { return x.indexOf('wfordre:') !== 0; });
                return a.updateItem(complet);
            }).then(function () { return a.getItem(uid(), item.Id); }).then(function (verif) {
                if (verif.ProviderIds && verif.ProviderIds.WolfFlix === valeur) return verif;
                verif.Tags = (verif.Tags || []).filter(function (x) { return x.indexOf('wfordre:') !== 0; }).concat(['wfordre:' + valeur]);
                return a.updateItem(verif).then(function () { return a.getItem(uid(), item.Id); });
            }).then(function (frais) {
                oublier(item.Id);
                delete typesItems[item.Id];
                fermer();
                toast('Ordre enregistré');
                bloc.removeAttribute('data-id');
                bloc.innerHTML = loupAttente();
                bloc.setAttribute('data-id', item.Id);
                typesItems[item.Id] = Promise.resolve(frais);
                remplirOrdre(bloc, frais, t);
            }).catch(function () {
                boutons.forEach(function (b) { b.disabled = false; });
                etatTexte.textContent = '';
                toast('Échec de l\'enregistrement (droits administrateur requis ?)', true);
            });
        }
    }

    /* ---------- Bibliothèque Séries : rangée « Cycles » en tête ---------- */
    var seriesParBib = {};
    function cyclesBibliotheque() {
        var h = location.hash || '';
        if (!/^#\/tv\?/.test(h)) return;
        var m = /[?&](?:topParentId|parentId)=([0-9a-f]{32})/i.exec(h);
        if (!m) return;
        var bib = m[1];
        var grille = Array.prototype.filter.call(document.querySelectorAll('.itemsContainer'), function (c) {
            return visible(c) && c.querySelector('.card[data-type="Series"]');
        })[0];
        if (!grille || !grille.parentNode) return;
        var hote = grille.parentNode;
        var marque = hote.getAttribute('data-wf-cycles');
        if (hote.querySelector(':scope > .wf-section-bib-cycles[data-bib="' + bib + '"]') || marque === 'en-cours' || marque === 'aucun-' + bib) return;
        hote.setAttribute('data-wf-cycles', 'en-cours');
        if (!seriesParBib[bib]) {
            seriesParBib[bib] = json('Users/' + uid() + '/Items', {
                ParentId: bib, Recursive: true, IncludeItemTypes: 'Series', EnableImages: false, EnableUserData: false
            }).then(function (r) {
                var e = {};
                (r.Items || []).forEach(function (i) { e[i.Id] = true; });
                return e;
            });
            seriesParBib[bib].catch(function () { delete seriesParBib[bib]; });
        }
        Promise.all([charger(), seriesParBib[bib]]).then(function (r) {
            var ici = r[1];
            var cycles = r[0].filter(function (c) {
                return c.type === 'c' && c.ids.length && (c.series || []).some(function (id) { return ici[id]; });
            });
            if (!cycles.length || !grille.isConnected) { hote.setAttribute('data-wf-cycles', 'aucun-' + bib); return; }
            hote.setAttribute('data-wf-cycles', 'fait');
            var tmp = document.createElement('div');
            tmp.innerHTML = rangee(NOMS.c.plusieurs, cycles.map(function (c) {
                return carte({ id: c.id, nom: c.nom, tag: c.tag, sous: compte(c) });
            }), 'bib-cycles', '#/home?wf=cycles');
            var sec = tmp.firstChild;
            sec.setAttribute('data-bib', bib);
            hote.insertBefore(sec, grille);
            images(sec);
        }).catch(function () { hote.removeAttribute('data-wf-cycles'); });
    }

    /* ---------- Orchestration ---------- */
    var prevu = false;
    function passer() {
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () {
            prevu = false;
            if (!api()) return;
            page();
            accueil();
            fiche();
            favoris();
            bibliotheques();
            cyclesBibliotheque();
        });
    }
    window.addEventListener('wf-route', passer);
    window.addEventListener('hashchange', passer);
    new MutationObserver(passer).observe(document.body, { childList: true, subtree: true });
    passer();
})();
