/* WolfFlix — « Santé du serveur » (#/home?wf=sante), administrateurs seulement.
   Données : extension WolfFlix 0.7+ (bilan toutes les 6 heures, ou à la demande).
     · alertes : dossiers disparus des bibliothèques (avec la date) ;
     · place sur chaque disque ;
     · à réencoder en priorité (gros fichiers non HEVC) et gain estimé ;
     · affiches manquantes, titres non identifiés, doublons, films sans VF. */
(function () {
    'use strict';
    if (window.__wfSante) return;
    window.__wfSante = true;

    var html = document.documentElement;
    var admin = null;

    function api() {
        var a = window.ApiClient;
        return a && a.getCurrentUserId && a.getCurrentUserId() ? a : null;
    }
    function json(chemin, q) { return api().getJSON(api().getUrl(chemin, q)); }
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function go(o) {
        if (!o) return '0 Go';
        return o >= 1e12 ? (o / 1e12).toFixed(2).replace('.', ',') + ' To' : Math.round(o / 1e9).toLocaleString('fr-FR') + ' Go';
    }
    function lien(id) {
        var a = api();
        return '#/details?id=' + id + (a && a.serverId ? '&serverId=' + a.serverId() : '');
    }
    function hautEntete() {
        var barre = document.querySelector('.MuiAppBar-root');
        return (barre ? Math.round(barre.getBoundingClientRect().bottom) : 64) + 'px';
    }

    // Lien « Santé » dans la barre et sur l'accueil : seulement pour un administrateur
    function verifierAdmin() {
        if (admin !== null || !api()) return;
        admin = false;
        api().getCurrentUser().then(function (u) {
            admin = !!(u && u.Policy && u.Policy.IsAdministrator);
            html.classList.toggle('wf-admin', admin);
        }).catch(function () { admin = null; });
    }

    /* ---------- Rendu ---------- */
    var ICONES = { Movie: 'movie', Series: 'tv', BoxSet: 'collections_bookmark', Book: 'menu_book' };
    function liste(elements, total, vide) {
        if (!elements || !elements.length) return '<p class="wf-vide">' + vide + '</p>';
        return '<ul class="wf-sa-liste">' + elements.map(function (e) {
            return '<li><span class="material-icons ' + (ICONES[e.Type] || 'description') + '" aria-hidden="true"></span>' +
                '<a href="' + lien(e.Id) + '">' + esc(e.Nom) + '</a>' +
                (e.Taille ? '<b>' + go(e.Taille) + '</b>' : '') +
                (e.Detail ? '<small>' + esc(e.Detail) + '</small>' : '') + '</li>';
        }).join('') + '</ul>' + (total > elements.length ? '<p class="wf-aide">… et ' + (total - elements.length) + ' autres.</p>' : '');
    }
    function bloc(titre, icone, n, contenu, ouvert, classe) {
        return '<details class="wf-sa-bloc' + (classe ? ' ' + classe : '') + '"' + (ouvert ? ' open' : '') + '>' +
            '<summary><span class="material-icons ' + icone + '" aria-hidden="true"></span>' + titre +
            '<span class="wf-sa-n' + (n ? '' : ' wf-sa-zero') + '">' + n + '</span></summary>' + contenu + '</details>';
    }
    function rendu(el, r) {
        var d = r.donnees;
        var corps = el.querySelector('.wf-sa-corps');
        el.querySelector('.wf-page-compte').textContent = r.enCours ? 'Bilan en cours…' :
            d ? 'Dernier bilan : ' + new Date(d.Maj).toLocaleString('fr-FR') : 'Premier bilan en cours…';
        if (!d) { corps.innerHTML = '<p class="wf-vide">Le premier bilan prend une à deux minutes…</p>'; return; }
        var c = d.Compteurs || {};
        var out = '';
        // Alertes
        if (d.Alertes && d.Alertes.length) {
            out += '<section class="wf-sa-alertes"><header><span class="material-icons warning" aria-hidden="true"></span>' +
                '<b>' + d.Alertes.length + (d.Alertes.length > 1 ? ' dossiers ont disparu' : ' dossier a disparu') + ' des bibliothèques</b>' +
                '<button type="button" class="wf-btn wf-btn-sec" data-act="lues">Marquer comme vues</button></header><ul>' +
                d.Alertes.map(function (a) {
                    return '<li><time>' + new Date(a.Date).toLocaleString('fr-FR') + '</time><code>' + esc(a.Chemin) + '</code><small>' + esc(a.Bibliotheque) + '</small></li>';
                }).join('') + '</ul><p class="wf-aide">Contrôle toutes les 6 heures. Un dossier déplacé ou renommé apparaît aussi ici.</p></section>';
        } else {
            out += '<section class="wf-sa-ok"><span class="material-icons verified" aria-hidden="true"></span> Aucun dossier disparu depuis le dernier contrôle.</section>';
        }
        // Disques
        out += '<h2 class="wf-sa-titre">Disques</h2><div class="wf-sa-disques">' + (d.Disques || []).map(function (k) {
            var pris = k.Total - k.Libre;
            var pc = k.Total ? Math.round(pris / k.Total * 100) : 0;
            return '<div class="wf-sa-disque' + (pc >= 90 ? ' wf-sa-plein' : pc >= 80 ? ' wf-sa-presque' : '') + '">' +
                '<div class="wf-sa-disque-tete"><b>' + esc(k.Point) + '</b><span>' + go(k.Libre) + ' libres sur ' + go(k.Total) + '</span></div>' +
                '<div class="wf-sa-jauge"><span style="width:' + pc + '%"></span></div>' +
                '<small>' + pc + ' % utilisés · ' + esc((k.Bibliotheques || []).join(', ')) + '</small></div>';
        }).join('') + '</div>';
        // Compteurs
        out += '<div class="wf-sa-compteurs">' + [['movie', c.films, 'films'], ['tv', c.series, 'séries'], ['video_library', c.episodes, 'épisodes'],
            ['menu_book', c.livres, 'livres'], ['collections_bookmark', c.collections, 'collections']].map(function (x) {
            return '<div><span class="material-icons ' + x[0] + '" aria-hidden="true"></span><b>' + (x[1] || 0).toLocaleString('fr-FR') + '</b><span>' + x[2] + '</span></div>';
        }).join('') + '</div>';
        // Listes
        out += bloc('À réencoder en priorité', 'compress', c.aReencoder || 0,
            '<p class="wf-aide">Films lourds (plus de 1,2 Go par heure) qui ne sont pas encore en HEVC / AV1, les plus gros d\'abord. ' +
            'Gain estimé d\'après tes essais HandBrake (≈ un tiers) : <b>' + go(d.GainEstime) + '</b>.</p>' +
            liste(d.AReencoder, c.aReencoder, 'Rien à réencoder : bravo.'), false);
        out += bloc('Sans affiche', 'hide_image', c.sansAffiche || 0, liste(d.SansAffiche, c.sansAffiche, 'Toutes les fiches ont une affiche.'), false);
        out += bloc('Non identifiés', 'help', c.nonIdentifies || 0,
            '<p class="wf-aide">Films et séries sans identifiant TMDB / IMDb / TVDB : ni notes, ni « À venir », ni sagas possibles. Utilise « Identifier » sur leur fiche.</p>' +
            liste(d.NonIdentifies, c.nonIdentifies, 'Tout est identifié.'), false);
        out += bloc('Doublons', 'content_copy', c.doublons || 0,
            '<p class="wf-aide">Même film ou même série présent plusieurs fois (même identifiant TMDB / IMDb).</p>' +
            liste(d.Doublons, c.doublons, 'Aucun doublon.'), false);
        out += bloc('Films sans VF', 'record_voice_over', c.sansVf || 0,
            '<p class="wf-aide">Aucune piste audio française (langue des pistes indiquée à côté).</p>' +
            liste(d.SansVf, c.sansVf, 'Tous les films ont une VF.'), false);
        corps.innerHTML = out;
    }

    /* ---------- Page ---------- */
    var minuterie = null;
    function charger(el) {
        clearTimeout(minuterie);
        json('WolfFlix/Sante').then(function (r) {
            if (!el.isConnected) return;
            rendu(el, r);
            if (r.enCours || !r.donnees) minuterie = setTimeout(function () { charger(el); }, 5000);
        }, function (x) {
            el.querySelector('.wf-sa-corps').innerHTML = '<p class="wf-vide">' + (x && x.status === 403
                ? 'Réservé aux administrateurs.' : 'La santé du serveur demande l\'extension WolfFlix 0.7 ou plus récente.') + '</p>';
        });
    }
    function page() {
        verifierAdmin();
        var ouvert = /^#\/home\?(?:[^#]*&)?wf=sante/.test(location.hash || '');
        var el = document.getElementById('wf-page');
        if (!ouvert) {
            if (el && el.getAttribute('data-type') === 'sante') {
                el.remove();
                html.classList.remove('wf-page-ouverte');
                clearTimeout(minuterie);
            }
            return;
        }
        if (el && el.getAttribute('data-type') === 'sante') { el.style.setProperty('--wf-haut', hautEntete()); return; }
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'wf-page';
        document.body.appendChild(el);
        el.setAttribute('data-type', 'sante');
        el.style.setProperty('--wf-haut', hautEntete());
        html.classList.add('wf-page-ouverte');
        el.innerHTML = '<div class="wf-page-entete padded-left padded-right">' +
            '<div><p class="wf-page-surtitre">Administrateur</p><h1 class="wf-page-titre">Santé du serveur</h1><p class="wf-page-compte">Chargement…</p></div>' +
            '<div class="wf-page-outils"><button type="button" class="wf-btn wf-btn-pri" data-act="bilan"><span class="material-icons refresh" aria-hidden="true"></span> Refaire le bilan</button></div></div>' +
            '<div class="wf-sa-corps padded-left padded-right"><p class="wf-vide">Chargement…</p></div>';
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'bilan') {
                b.disabled = true;
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/Sante/Calculer') }).catch(function () { /* rien */ }).then(function () {
                    setTimeout(function () { b.disabled = false; charger(el); }, 1500);
                });
            } else if (act === 'lues') {
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/Sante/AlertesLues') }).then(function () { charger(el); });
            }
        });
        charger(el);
    }

    window.addEventListener('resize', function () {
        var el = document.getElementById('wf-page');
        if (el && el.getAttribute('data-type') === 'sante') el.style.setProperty('--wf-haut', hautEntete());
    }, { passive: true });
    window.addEventListener('wf-route', page);
    window.addEventListener('hashchange', page);
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(verifierAdmin);
    page();
})();
