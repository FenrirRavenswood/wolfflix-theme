/* WolfFlix — « Reprendre la lecture » (livres et webtoons) sur l'accueil
   Remplace « Continuer la lecture » de Jellyfin :
     · un livre / chapitre commencé apparaît avec sa progression à jour ;
     · un livre / chapitre TERMINÉ fait apparaître le suivant du même dossier
       (chapitre suivant d'un webtoon, tome suivant d'une saga) ;
     · un clic ouvre directement le lecteur WolfFlix. */
(function () {
    'use strict';
    if (window.__wfReprise) return;
    window.__wfReprise = true;

    var html = document.documentElement;
    var comparateur = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
    var RE_CONTINUER = /continuer la lecture|continue reading|reprendre la lecture/i;

    function api() {
        var a = window.ApiClient;
        return a && a.getCurrentUserId && a.getCurrentUserId() ? a : null;
    }
    function uid() { return api().getCurrentUserId(); }
    function json(chemin, q) { return api().getJSON(api().getUrl(chemin, q)); }
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function visible(el) { return !!(el && el.offsetParent !== null); }
    function image(id, tag) {
        return tag ? api().getUrl('Items/' + id + '/Images/Primary', { tag: tag, maxHeight: 400, quality: 90 }) : '';
    }

    /* ---------- Ce qu'il faut proposer ---------- */
    function freres(parentId) {
        return json('Users/' + uid() + '/Items', {
            ParentId: parentId, IncludeItemTypes: 'Book', Fields: 'Path', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: true, Limit: 3000
        }).then(function (r) {
            var l = (r.Items || []).slice();
            l.sort(function (a, b) {
                return comparateur.compare(a.SortName || a.Name || '', b.SortName || b.Name || '') || comparateur.compare(a.Path || '', b.Path || '');
            });
            return l;
        }).catch(function () { return []; });
    }

    function propositions() {
        return json('Users/' + uid() + '/Items', {
            IncludeItemTypes: 'Book', Recursive: true, SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 120,
            Fields: 'ParentId,Path', EnableUserData: true, EnableImageTypes: 'Primary', ImageTypeLimit: 1
        }).then(function (r) {
            var lus = (r.Items || []).filter(function (i) { return i.UserData && i.UserData.LastPlayedDate; });
            // Le plus récent de chaque dossier (webtoon, saga de livres…)
            var vus = {}, derniers = [];
            lus.forEach(function (i) {
                var cle = i.ParentId || i.Id;
                if (vus[cle]) return;
                vus[cle] = true;
                derniers.push(i);
            });
            derniers = derniers.slice(0, 24);
            var parents = derniers.map(function (i) { return i.ParentId; }).filter(Boolean);
            var infosParents = parents.length ? json('Users/' + uid() + '/Items', {
                Ids: parents.join(','), EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: false
            }).then(function (d) {
                var m = {};
                (d.Items || []).forEach(function (p) { m[p.Id] = p; });
                return m;
            }).catch(function () { return {}; }) : Promise.resolve({});
            return infosParents.then(function (parentsParId) {
                return Promise.all(derniers.map(function (i) {
                    var ud = i.UserData || {};
                    var parent = parentsParId[i.ParentId];
                    var dossier = parent && parent.Type !== 'CollectionFolder' && parent.Type !== 'UserView' ? parent : null;
                    var enCours = !ud.Played && (ud.PlaybackPositionTicks > 0 || ud.PlayedPercentage > 0);
                    if (enCours) return { item: i, parent: dossier, pc: ud.PlayedPercentage || 0, suite: false };
                    if (!ud.Played || !dossier) return null;          // livre seul terminé : rien à proposer
                    return freres(i.ParentId).then(function (l) {
                        var k = -1;
                        for (var n = 0; n < l.length; n++) if (l[n].Id === i.Id) k = n;
                        for (var x = k + 1; x < l.length; x++) {
                            var u = l[x].UserData || {};
                            if (!u.Played) return { item: l[x], parent: dossier, pc: u.PlayedPercentage || 0, suite: !(u.PlaybackPositionTicks > 0) };
                        }
                        return null;
                    });
                }));
            });
        }).then(function (l) { return l.filter(Boolean); });
    }

    /* ---------- Rangée ---------- */
    function carte(p) {
        var i = p.item;
        var img = image(i.Id, i.ImageTags && i.ImageTags.Primary) || (p.parent ? image(p.parent.Id, p.parent.ImageTags && p.parent.ImageTags.Primary) : '');
        var pc = Math.round(p.pc || 0);
        var etiquette = p.suite ? 'À lire ensuite' : pc + ' %';
        return '<div class="card overflowPortraitCard portraitCard wf-carte wf-carte-reprise" data-id="' + esc(i.Id) + '">' +
            '<div class="cardBox cardBox-bottompadded">' +
            '<a class="cardScalable" href="#/details?id=' + esc(i.Id) + '" data-wf-lire="' + esc(i.Id) + '">' +
            '<div class="cardPadder cardPadder-portrait"></div>' +
            '<div class="cardImageContainer coveredImage cardContent' + (img ? '' : ' wf-sans-image') + '"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' +
            (img ? '' : '<span class="wf-sans-image-nom">' + esc(i.Name) + '</span>') +
            '<span class="wf-reprise-etiquette' + (p.suite ? ' wf-suite' : '') + '">' + esc(etiquette) + '</span>' +
            (!p.suite && pc > 0 ? '<div class="itemProgressBar"><div class="itemProgressBarForeground" style="width:' + pc + '%"></div></div>' : '') +
            '</div></a>' +
            '<div class="cardText cardTextCentered cardText-first"><bdi>' + esc(i.Name) + '</bdi></div>' +
            (p.parent ? '<div class="cardText cardTextCentered cardText-secondary"><bdi>' + esc(p.parent.Name) + '</bdi></div>' : '') +
            '</div></div>';
    }
    function rangee(cartes) {
        return '<div class="verticalSection wf-section wf-section-reprise">' +
            '<div class="wf-section-entete padded-left padded-right"><h2 class="sectionTitle sectionTitle-cards">Reprendre la lecture</h2>' +
            '<div class="wf-fleches"><button type="button" class="wf-fleche" data-wf-fleche="-1" aria-label="Précédent"><span class="material-icons chevron_left"></span></button>' +
            '<button type="button" class="wf-fleche" data-wf-fleche="1" aria-label="Suivant"><span class="material-icons chevron_right"></span></button></div></div>' +
            '<div class="wf-rangee padded-left padded-right">' + cartes.join('') + '</div></div>';
    }

    var dernierCalcul = 0;
    var enCours = false;
    function accueil(force) {
        if (!api() || !html.classList.contains('wf-accueil') || enCours) return;
        var conteneur = Array.prototype.filter.call(document.querySelectorAll('.homeSectionsContainer'), visible)[0];
        if (!conteneur || !conteneur.querySelector('.card')) return;
        var existante = conteneur.querySelector('.wf-section-reprise');
        if (existante && !force && Date.now() - dernierCalcul < 20000) return;
        if (!existante && conteneur.hasAttribute('data-wf-reprise') && !force && Date.now() - dernierCalcul < 20000) return;
        enCours = true;
        dernierCalcul = Date.now();
        propositions().then(function (l) {
            conteneur.setAttribute('data-wf-reprise', '1');
            // La rangée de Jellyfin est remplacée par la nôtre
            var native = null;
            conteneur.querySelectorAll('.verticalSection:not(.wf-section) .sectionTitle').forEach(function (t) {
                if (!native && RE_CONTINUER.test(t.textContent || '')) native = t.closest('.verticalSection');
            });
            if (native) native.classList.add('wf-remplacee', 'wf-reprise-native');
            var ancienne = conteneur.querySelector('.wf-section-reprise');
            if (!l.length) { if (ancienne) ancienne.remove(); return; }
            var morceau = rangee(l.map(carte));
            if (ancienne) { ancienne.outerHTML = morceau; return; }
            var lienSuivre = conteneur.querySelector('a[href*="nextup"]');
            var repere = native || conteneur.querySelector('.wf-section-suivre-c') || (lienSuivre && lienSuivre.closest('.verticalSection'));
            if (repere) repere.insertAdjacentHTML('afterend', morceau);
            else conteneur.insertAdjacentHTML('afterbegin', morceau);
        }).catch(function () { /* on réessaiera */ }).then(function () { enCours = false; });
    }

    // Un clic sur une carte ouvre directement le lecteur
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-wf-lire]');
        if (!a || !window.WolfFlix || !window.WolfFlix.lire) return;
        e.preventDefault();
        e.stopPropagation();
        var id = a.getAttribute('data-wf-lire');
        window.WolfFlix.lire(id).then(function (ok) { if (!ok) location.hash = '#/details?id=' + id; });
    }, true);

    // Progression changée dans le lecteur : la rangée sera recalculée au retour sur l'accueil
    var minuterieMaj = null;
    window.addEventListener('wf-lecture-maj', function () {
        dernierCalcul = 0;
        clearTimeout(minuterieMaj);
        minuterieMaj = setTimeout(function () { accueil(true); }, 4000);
    });
    window.addEventListener('wf-route', function () { setTimeout(function () { accueil(false); }, 600); });
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(function () { accueil(false); });
    setTimeout(function () { accueil(false); }, 1500);
})();
