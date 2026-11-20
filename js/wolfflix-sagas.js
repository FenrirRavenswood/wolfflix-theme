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
    var CLE = 'wf-sagas-v1-';
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
    function ordreStocke(bs) {
        var p = bs && bs.ProviderIds && (bs.ProviderIds.WolfFlix || bs.ProviderIds.wolfflix);
        if (p) return p.split(',').filter(Boolean);
        var tag = ((bs && bs.Tags) || []).filter(function (t) { return t.indexOf('wfordre:') === 0; })[0];
        return tag ? tag.slice(8).split(',').filter(Boolean) : null;
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
                    var type = 's';
                    (e.Items || []).forEach(function (i) {
                        ids.push(i.Id);
                        if (/^(Series|Season|Episode)$/.test(i.Type)) type = 'c';
                    });
                    cache[b.Id] = { n: b.ChildCount, t: type, ids: ids };
                });
            }).then(function () {
                if (perime) cache._t = Date.now();
                var existe = {};
                liste.forEach(function (b) { existe[b.Id] = true; });
                Object.keys(cache).forEach(function (k) { if (k !== '_t' && !existe[k]) delete cache[k]; });
                ecrireCache(cache);
                return liste.map(function (b) {
                    var c = cache[b.Id] || { t: 's', ids: [] };
                    var o = ordreStocke(b);
                    return {
                        id: b.Id, nom: b.Name, tag: b.ImageTags && b.ImageTags.Primary,
                        cree: b.DateCreated, type: c.t, ids: ordonner(c.ids, o), perso: !!o
                    };
                });
            });
        });
        etat.promesse.catch(function () { etat.promesse = null; });
        return etat.promesse;
    }

    /* ---------- Cartes ---------- */
    function carte(o) {
        var img = o.tag ? image(o.id, o.tag, 360) : '';
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
            '<h2 class="sectionTitle sectionTitle-cards padded-left">' +
            (lien ? '<a class="wf-titre-lien" href="' + lien + '">' + esc(titre) + ' <span class="material-icons chevron_right" aria-hidden="true"></span></a>' : esc(titre)) +
            '</h2><div class="wf-rangee padded-left padded-right">' + cartes.join('') + '</div></div>';
    }

    function compte(c) {
        var n = c.ids.length;
        if (c.type === 's') return n + (n > 1 ? ' films' : ' film');
        return n + (n > 1 ? ' titres' : ' titre');
    }

    /* ---------- « À suivre » : prochain titre non vu de chaque collection ---------- */
    function aSuivre(collections) {
        var q = { Recursive: true, EnableImages: false, EnableUserData: false };
        return Promise.all([
            json('Users/' + uid() + '/Items', Object.assign({ IncludeItemTypes: 'Movie,Series,Video', Filters: 'IsPlayed', SortBy: 'DatePlayed', SortOrder: 'Descending' }, q)),
            json('Users/' + uid() + '/Items', Object.assign({ IncludeItemTypes: 'Movie,Video,Episode', Filters: 'IsResumable', SortBy: 'DatePlayed', SortOrder: 'Descending', Fields: 'SeriesId' }, q)),
            json('Shows/NextUp', { UserId: uid(), Limit: 200, Fields: 'SeriesId', EnableImages: false, EnableUserData: false }).catch(function () { return { Items: [] }; })
        ]).then(function (r) {
            var vu = {};
            var rang = {};
            var enCours = {};
            (r[0].Items || []).forEach(function (i, k) { vu[i.Id] = true; if (!(i.Id in rang)) rang[i.Id] = k + 1000; });
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
                            return carte({
                                id: c.item.Id, nom: c.item.Name, tag: c.item.ImageTags && c.item.ImageTags.Primary,
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
                var reprise = conteneur.querySelector('.itemsContainer[data-monitor*="videoplayback"]');
                var section = reprise && reprise.closest('.verticalSection');
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

    /* ---------- Pages « Sagas » et « Cycles » ---------- */
    function page() {
        var m = /^#\/home\?(?:[^#]*&)?wf=(sagas|cycles)/.exec(location.hash || '');
        var el = document.getElementById('wf-page');
        if (!m) {
            if (el) el.remove();
            html.classList.remove('wf-page-ouverte');
            return;
        }
        var type = m[1] === 'sagas' ? 's' : 'c';
        if (el && el.getAttribute('data-type') === type) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'wf-page';
            document.body.appendChild(el);
        }
        var barre = document.querySelector('.MuiAppBar-root');
        el.style.setProperty('--wf-haut', (barre ? Math.round(barre.getBoundingClientRect().bottom) : 64) + 'px');
        el.setAttribute('data-type', type);
        html.classList.add('wf-page-ouverte');
        var tri = sessionStorage.getItem('wf-tri-' + type) || 'recent';
        el.innerHTML = '<div class="wf-page-entete padded-left padded-right">' +
            '<div><p class="wf-page-surtitre">WolfFlix</p><h1 class="wf-page-titre">' + NOMS[type].plusieurs + '</h1><p class="wf-page-compte"></p></div>' +
            '<div class="wf-page-outils">' +
            '<label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span><input type="search" placeholder="Rechercher" aria-label="Rechercher"></label>' +
            '<select class="wf-tri" aria-label="Trier">' +
            '<option value="recent">Ajout récent</option><option value="nom">Nom</option><option value="taille">Nombre de titres</option>' +
            '</select></div></div>' +
            '<div class="wf-page-grille padded-left padded-right">' + loupAttente() + '</div>';
        el.querySelector('.wf-tri').value = tri;

        charger().then(function (cols) {
            if (el.getAttribute('data-type') !== type || !el.isConnected) return;
            var liste = cols.filter(function (c) { return c.type === type && c.ids.length; });
            var grille = el.querySelector('.wf-page-grille');
            var champ = el.querySelector('input');
            var select = el.querySelector('.wf-tri');
            function afficher() {
                var f = champ.value.trim().toLowerCase();
                var t = select.value;
                sessionStorage.setItem('wf-tri-' + type, t);
                var l = liste.filter(function (c) { return !f || c.nom.toLowerCase().indexOf(f) !== -1; });
                l = l.slice().sort(function (a, b) {
                    if (t === 'nom') return a.nom.localeCompare(b.nom, 'fr');
                    if (t === 'taille') return b.ids.length - a.ids.length;
                    return (b.cree || '').localeCompare(a.cree || '');
                });
                el.querySelector('.wf-page-compte').textContent = l.length + ' ' + (l.length > 1 ? NOMS[type].plusieurs : NOMS[type].un).toLowerCase();
                grille.innerHTML = l.length ? l.map(function (c) {
                    return carte({ id: c.id, nom: c.nom, tag: c.tag, sous: compte(c) + (c.perso ? ' · ordre perso' : '') });
                }).join('') : '<p class="wf-vide">Rien ici pour l\'instant.</p>';
                images(grille);
            }
            var minuterie;
            champ.addEventListener('input', function () { clearTimeout(minuterie); minuterie = setTimeout(afficher, 150); });
            select.addEventListener('change', afficher);
            afficher();
            var defile = +sessionStorage.getItem('wf-defile-' + type) || 0;
            if (defile) el.scrollTop = defile;
            el.addEventListener('scroll', function () { sessionStorage.setItem('wf-defile-' + type, el.scrollTop); }, { passive: true });
        }).catch(function () {
            var g = el.querySelector('.wf-page-grille');
            if (g) g.innerHTML = '<p class="wf-vide">Impossible de charger les collections. Réessaie dans un instant.</p>';
        });
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
            var pol = user.Policy || {};
            var admin = !!pol.IsAdministrator;
            var perso = !!ordreStocke(item);
            var dernierVu = -1;
            enfants.forEach(function (e, k) { if (e.UserData && e.UserData.Played) dernierVu = k; });
            var prochain = -1;
            for (var k = dernierVu + 1; k < enfants.length; k++) {
                if (!(enfants[k].UserData && enfants[k].UserData.Played)) { prochain = k; break; }
            }
            if (dernierVu === -1) prochain = -1;
            bloc.innerHTML = '<div class="wf-ordre-entete padded-right">' +
                '<h2 class="sectionTitle sectionTitle-cards">Ordre de visionnage' + (perso ? ' <span class="wf-pastille">personnalisé</span>' : '') + '</h2>' +
                (admin ? '<button type="button" class="wf-btn wf-btn-sec wf-ordre-modifier"><span class="material-icons reorder" aria-hidden="true"></span> Modifier l\'ordre</button>' : '') +
                '</div><div class="wf-rangee">' +
                enfants.map(function (e, k) {
                    return carte({
                        id: e.Id, nom: e.Name, tag: e.ImageTags && e.ImageTags.Primary,
                        sous: e.ProductionYear || '', rang: k + 1,
                        vu: !!(e.UserData && e.UserData.Played),
                        ruban: k === prochain ? 'À suivre' : '',
                        classe: k === prochain ? 'wf-prochain' : ''
                    });
                }).join('') + '</div>';
            images(bloc);
            var p = pageFiche();
            if (p) p.classList.add('wf-collection-ordonnee');
            var b = bloc.querySelector('.wf-ordre-modifier');
            if (b) b.addEventListener('click', function () { editeur(item, enfants, t, bloc); });
        }).catch(function () {
            bloc.remove();
        });
    }

    /* ---------- Éditeur d'ordre ---------- */
    function editeur(item, enfants, t, bloc) {
        var liste = enfants.map(function (e) { return { id: e.Id, nom: e.Name, annee: e.ProductionYear || '', tag: e.ImageTags && e.ImageTags.Primary }; });
        var initiaux = liste.map(function (e) { return e.id; });
        var fond = document.createElement('div');
        fond.className = 'wf-editeur-fond';
        fond.innerHTML = '<div class="wf-editeur" role="dialog" aria-modal="true" aria-label="Ordre de visionnage">' +
            '<header><p class="wf-page-surtitre">' + NOMS[t].un + '</p><h2>' + esc(item.Name) + '</h2>' +
            '<p class="wf-aide">Glisse les titres par la poignée, ou utilise les flèches.</p></header>' +
            '<ol class="wf-editeur-liste"></ol>' +
            '<div class="wf-editeur-ajout"><label class="wf-champ"><span class="material-icons add" aria-hidden="true"></span>' +
            '<input type="search" placeholder="Ajouter un film ou une série…" aria-label="Ajouter un film ou une série"></label>' +
            '<div class="wf-editeur-resultats"></div></div>' +
            '<footer><span class="wf-editeur-etat"></span><button type="button" class="wf-btn wf-btn-sec" data-act="annuler">Annuler</button>' +
            '<button type="button" class="wf-btn wf-btn-pri" data-act="enregistrer">Enregistrer</button></footer></div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var ol = fond.querySelector('.wf-editeur-liste');
        var etatTexte = fond.querySelector('.wf-editeur-etat');

        function ligne(e, k) {
            var img = e.tag ? image(e.id, e.tag, 120) : '';
            return '<li data-id="' + esc(e.id) + '">' +
                '<span class="wf-poignee material-icons drag_indicator" aria-label="Déplacer"></span>' +
                '<span class="wf-num">' + (k + 1) + '</span>' +
                '<span class="wf-vignette"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></span>' +
                '<span class="wf-nom">' + esc(e.nom) + (e.annee ? ' <small>' + e.annee + '</small>' : '') + '</span>' +
                '<button type="button" class="wf-icone" data-act="haut" aria-label="Monter"><span class="material-icons expand_less"></span></button>' +
                '<button type="button" class="wf-icone" data-act="bas" aria-label="Descendre"><span class="material-icons expand_more"></span></button>' +
                '<button type="button" class="wf-icone wf-icone-retirer" data-act="retirer" aria-label="Retirer"><span class="material-icons close"></span></button>' +
                '</li>';
        }
        function dessiner() {
            ol.innerHTML = liste.map(ligne).join('');
        }
        function relireDom() {
            var parId = {};
            liste.forEach(function (e) { parId[e.id] = e; });
            liste = Array.prototype.map.call(ol.children, function (li) { return parId[li.getAttribute('data-id')]; });
            Array.prototype.forEach.call(ol.children, function (li, k) { li.querySelector('.wf-num').textContent = k + 1; });
        }
        dessiner();

        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
            document.removeEventListener('keydown', clavier, true);
        }
        function clavier(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }
        document.addEventListener('keydown', clavier, true);

        fond.addEventListener('click', function (e) {
            if (e.target === fond) { fermer(); return; }
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            var li = b.closest('li');
            var k = li ? Array.prototype.indexOf.call(ol.children, li) : -1;
            if (act === 'haut' && k > 0) { liste.splice(k - 1, 0, liste.splice(k, 1)[0]); dessiner(); }
            else if (act === 'bas' && k > -1 && k < liste.length - 1) { liste.splice(k + 1, 0, liste.splice(k, 1)[0]); dessiner(); }
            else if (act === 'retirer' && k > -1) { liste.splice(k, 1); dessiner(); }
            else if (act === 'ajouter') {
                var nouv = { id: b.getAttribute('data-id'), nom: b.getAttribute('data-nom'), annee: b.getAttribute('data-annee'), tag: b.getAttribute('data-tag') };
                if (!liste.some(function (x) { return x.id === nouv.id; })) {
                    liste.push(nouv);
                    dessiner();
                    ol.lastElementChild.classList.add('wf-nouveau');
                    ol.lastElementChild.scrollIntoView({ block: 'nearest' });
                }
                b.disabled = true;
            }
            else if (act === 'annuler') fermer();
            else if (act === 'enregistrer') enregistrer();
        });

        // Glisser-déposer (souris et tactile)
        var tire = null;
        ol.addEventListener('pointerdown', function (e) {
            var poignee = e.target.closest('.wf-poignee');
            if (!poignee) return;
            e.preventDefault();
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
        var minuterie;
        champ.addEventListener('input', function () {
            clearTimeout(minuterie);
            var terme = champ.value.trim();
            if (terme.length < 2) { res.innerHTML = ''; return; }
            minuterie = setTimeout(function () {
                json('Users/' + uid() + '/Items', {
                    searchTerm: terme, IncludeItemTypes: 'Movie,Series', Recursive: true, Limit: 12,
                    Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: false
                }).then(function (r) {
                    if (champ.value.trim() !== terme) return;
                    var deja = {};
                    liste.forEach(function (x) { deja[x.id] = true; });
                    res.innerHTML = (r.Items || []).map(function (i) {
                        var tag = i.ImageTags && i.ImageTags.Primary ? i.ImageTags.Primary : '';
                        var img = tag ? image(i.Id, tag, 120) : '';
                        return '<button type="button" class="wf-resultat" data-act="ajouter"' + (deja[i.Id] ? ' disabled' : '') +
                            ' data-id="' + esc(i.Id) + '" data-nom="' + esc(i.Name) + '" data-annee="' + esc(i.ProductionYear || '') + '" data-tag="' + esc(tag) + '">' +
                            '<span class="wf-vignette"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></span>' +
                            '<span class="wf-nom">' + esc(i.Name) + (i.ProductionYear ? ' <small>' + i.ProductionYear + '</small>' : '') +
                            '<small class="wf-type">' + (i.Type === 'Series' ? 'Série' : 'Film') + '</small></span>' +
                            '<span class="material-icons add_circle" aria-hidden="true"></span></button>';
                    }).join('') || '<p class="wf-vide">Aucun résultat.</p>';
                }).catch(function () { res.innerHTML = '<p class="wf-vide">Recherche impossible.</p>'; });
            }, 300);
        });

        // Enregistrement
        function enregistrer() {
            var ids = liste.map(function (e) { return e.id; });
            var ajouts = ids.filter(function (i) { return initiaux.indexOf(i) === -1; });
            var retraits = initiaux.filter(function (i) { return ids.indexOf(i) === -1; });
            var boutons = fond.querySelectorAll('footer button');
            boutons.forEach(function (b) { b.disabled = true; });
            etatTexte.textContent = 'Enregistrement…';
            var a = api();
            var p = Promise.resolve();
            if (ajouts.length) p = p.then(function () { return a.ajax({ type: 'POST', url: url('Collections/' + item.Id + '/Items', { ids: ajouts.join(',') }) }); });
            if (retraits.length) p = p.then(function () { return a.ajax({ type: 'DELETE', url: url('Collections/' + item.Id + '/Items', { ids: retraits.join(',') }) }); });
            var valeur = ids.join(',');
            p.then(function () { return a.getItem(uid(), item.Id); }).then(function (complet) {
                complet.ProviderIds = complet.ProviderIds || {};
                complet.ProviderIds.WolfFlix = valeur;
                complet.Tags = (complet.Tags || []).filter(function (x) { return x.indexOf('wfordre:') !== 0; });
                return a.updateItem(complet);
            }).then(function () { return a.getItem(uid(), item.Id); }).then(function (verif) {
                if (verif.ProviderIds && verif.ProviderIds.WolfFlix === valeur) return verif;
                // Repli : si Jellyfin n'a pas gardé l'identifiant, on range l'ordre dans une étiquette
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
        });
    }
    window.addEventListener('wf-route', passer);
    window.addEventListener('hashchange', passer);
    new MutationObserver(passer).observe(document.body, { childList: true, subtree: true });
    passer();
})();
