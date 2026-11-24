/* WolfFlix — page « À venir » (#/home?wf=avenir)
   Deux onglets, calculés chaque nuit par l'extension WolfFlix (TMDB) :
     · À venir : prochains films des sagas que tu as, prochains épisodes et saisons de tes séries,
       triés par date (dates françaises quand TMDB les connaît, sinon « date inconnue ») ;
     · Ce qui manque : films des sagas que tu n'as pas (même sortis il y a 10 ans),
       saisons et épisodes déjà diffusés absents du serveur.
   Visible par tous les utilisateurs ; l'administrateur peut ignorer une entrée. */
(function () {
    'use strict';
    if (window.__wfAVenir) return;
    window.__wfAVenir = true;

    var html = document.documentElement;
    var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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
    function hautEntete() {
        var barre = document.querySelector('.MuiAppBar-root');
        return (barre ? Math.round(barre.getBoundingClientRect().bottom) : 64) + 'px';
    }
    function dateLisible(d) {
        if (!d) return '';
        var p = d.split('-');
        return (+p[2]) + ' ' + MOIS[+p[1] - 1] + ' ' + p[0];
    }
    function mois(d) {
        if (!d) return 'Date inconnue';
        var p = d.split('-');
        var m = MOIS[+p[1] - 1];
        return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + p[0];
    }
    function lienJellyfin(id) {
        var a = api();
        return '#/details?id=' + id + (a && a.serverId ? '&serverId=' + a.serverId() : '');
    }
    function lienTmdb(e) { return 'https://www.themoviedb.org/' + (e.Type === 'film' ? 'movie' : 'tv') + '/' + e.Tmdb; }

    var etat = { onglet: 'avenir', type: 'tout', texte: '', donnees: null, voirIgnores: false };

    function carte(e, admin) {
        var date = e.Date ? dateLisible(e.Date) + (e.DateFrance ? '' : (e.Type === 'film' ? ' (hors France)' : ' (diffusion d’origine)')) : 'Date inconnue';
        var cible = e.Type === 'film' || !e.Lien ? lienTmdb(e) : lienJellyfin(e.Lien);
        var externe = cible.indexOf('http') === 0;
        return '<div class="wf-av-carte' + (e.ignore ? ' wf-av-ignoree' : '') + '">' +
            '<a class="wf-av-affiche" href="' + esc(cible) + '"' + (externe ? ' target="_blank" rel="noopener"' : '') + '>' +
            (e.Affiche ? '<img loading="lazy" src="' + esc(e.Affiche) + '" alt="">' : '<span class="material-icons ' + (e.Type === 'film' ? 'movie' : 'tv') + '" aria-hidden="true"></span>') +
            '<span class="wf-av-type">' + (e.Type === 'film' ? 'Film' : 'Série') + '</span></a>' +
            '<div class="wf-av-infos"><b class="wf-av-titre">' + esc(e.Titre) + '</b>' +
            '<span class="wf-av-detail">' + esc(e.Detail) + '</span>' +
            '<span class="wf-av-date">' + esc(date) + '</span>' +
            (e.Lien && e.Type === 'film' ? '<a class="wf-av-lien" href="' + lienJellyfin(e.Lien) + '">Voir la saga chez toi</a>' : '') +
            (admin ? '<button type="button" class="wf-av-ignorer" data-cle="' + esc(e.Cle) + '" data-oui="' + (e.ignore ? '0' : '1') + '">' +
                (e.ignore ? 'Ne plus ignorer' : 'Ignorer') + '</button>' : '') +
            '</div></div>';
    }

    function afficher(el) {
        var d = etat.donnees;
        var corps = el.querySelector('.wf-av-corps');
        if (!d) return;
        var liste = (etat.onglet === 'avenir' ? d.aVenir : d.manquants).filter(function (e) {
            if (etat.type !== 'tout' && e.Type !== etat.type) return false;
            if (e.ignore && !etat.voirIgnores) return false;
            var t = etat.texte;
            return !t || (e.Titre + ' ' + e.Groupe + ' ' + e.Detail).toLowerCase().indexOf(t) !== -1;
        });
        el.querySelector('.wf-page-compte').textContent = liste.length + ' ' + (etat.onglet === 'avenir' ? 'sortie' + (liste.length > 1 ? 's' : '') + ' à venir' : 'titre' + (liste.length > 1 ? 's' : '') + ' manquant' + (liste.length > 1 ? 's' : '')) +
            (d.maj && new Date(d.maj).getFullYear() > 2000 ? ' · mis à jour le ' + new Date(d.maj).toLocaleDateString('fr-FR') : '');
        if (!liste.length) {
            corps.innerHTML = '<p class="wf-vide">' + (d.maj && new Date(d.maj).getFullYear() > 2000 ? 'Rien ici pour l’instant.' :
                'Pas encore calculé. L’administrateur doit ajouter la clé TMDB dans la page WolfFlix du tableau de bord.') + '</p>';
            return;
        }
        // À venir : par mois ; Ce qui manque : par saga / série
        var groupes = [], parNom = {};
        liste.forEach(function (e) {
            var g = etat.onglet === 'avenir' ? mois(e.Date) : e.Groupe || e.Titre;
            if (!parNom[g]) { parNom[g] = { nom: g, l: [], lien: e.Lien, type: e.Type }; groupes.push(parNom[g]); }
            parNom[g].l.push(e);
        });
        corps.innerHTML = groupes.map(function (g) {
            var titre = etat.onglet === 'manque' && g.lien
                ? '<a href="' + lienJellyfin(g.lien) + '">' + esc(g.nom) + '</a> <small>' + (g.type === 'film' ? 'saga' : 'série') + '</small>'
                : esc(g.nom);
            return '<section class="wf-av-groupe"><h2>' + titre + '</h2><div class="wf-av-grille">' +
                g.l.map(function (e) { return carte(e, d.admin); }).join('') + '</div></section>';
        }).join('');
    }

    function charger(el) {
        return json('WolfFlix/AVenir').then(function (d) {
            etat.donnees = d;
            if (!el.isConnected) return;
            el.querySelectorAll('.wf-av-admin').forEach(function (x) { x.hidden = !d.admin; });
            afficher(el);
            if (d.enCours) setTimeout(function () { if (el.isConnected) charger(el); }, 5000);
        }, function () {
            el.querySelector('.wf-av-corps').innerHTML = '<p class="wf-vide">L’extension WolfFlix n’est pas installée sur ce serveur (Tableau de bord → Extensions).</p>';
        });
    }

    function page() {
        var ouvert = /^#\/home\?(?:[^#]*&)?wf=avenir/.test(location.hash || '');
        var el = document.getElementById('wf-page');
        if (!ouvert) {
            if (el && el.getAttribute('data-type') === 'avenir') {
                el.remove();
                html.classList.remove('wf-page-ouverte');
            }
            return;
        }
        if (el && el.getAttribute('data-type') === 'avenir') {
            el.style.setProperty('--wf-haut', hautEntete());
            return;
        }
        if (el) el.remove();   // page d'un autre module : élément neuf, sans ses écouteurs
        {
            el = document.createElement('div');
            el.id = 'wf-page';
            document.body.appendChild(el);
        }
        el.setAttribute('data-type', 'avenir');
        el.style.setProperty('--wf-haut', hautEntete());
        html.classList.add('wf-page-ouverte');
        el.innerHTML = '<div class="wf-page-entete padded-left padded-right">' +
            '<div><p class="wf-page-surtitre">WolfFlix</p><h1 class="wf-page-titre">À venir</h1><p class="wf-page-compte"></p></div>' +
            '<div class="wf-page-outils">' +
            '<div class="wf-av-onglets" role="tablist">' +
            '<button type="button" class="wf-btn" data-onglet="avenir">À venir</button>' +
            '<button type="button" class="wf-btn" data-onglet="manque">Ce qui manque</button></div>' +
            '<select class="wf-tri wf-av-filtre" aria-label="Type"><option value="tout">Films et séries</option><option value="film">Films</option><option value="serie">Séries</option></select>' +
            '<label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span><input type="search" placeholder="Rechercher" aria-label="Rechercher"></label>' +
            '<label class="wf-av-admin wf-av-voir" hidden><input type="checkbox"> Voir les ignorés</label>' +
            '<button type="button" class="wf-btn wf-av-admin wf-av-maj" hidden><span class="material-icons refresh" aria-hidden="true"></span> Recalculer</button>' +
            '</div></div>' +
            '<div class="wf-av-corps padded-left padded-right"><p class="wf-vide">Chargement…</p></div>';

        function onglets() {
            el.querySelectorAll('[data-onglet]').forEach(function (b) {
                b.classList.toggle('wf-btn-pri', b.getAttribute('data-onglet') === etat.onglet);
            });
        }
        onglets();
        el.querySelector('.wf-av-filtre').value = etat.type;
        el.addEventListener('click', function (e) {
            var o = e.target.closest('[data-onglet]');
            if (o) { etat.onglet = o.getAttribute('data-onglet'); onglets(); afficher(el); return; }
            var ig = e.target.closest('.wf-av-ignorer');
            if (ig) {
                ig.disabled = true;
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/AVenir/Ignorer', { cle: ig.getAttribute('data-cle'), oui: ig.getAttribute('data-oui') === '1' }) })
                    .then(function () { return charger(el); });
                return;
            }
            if (e.target.closest('.wf-av-maj')) {
                var b = el.querySelector('.wf-av-maj');
                b.disabled = true;
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/AVenir/MettreAJour') }).then(function () {
                    setTimeout(function () { b.disabled = false; charger(el); }, 2500);
                });
            }
        });
        el.querySelector('.wf-av-filtre').addEventListener('change', function (e) { etat.type = e.target.value; afficher(el); });
        el.querySelector('input[type=search]').addEventListener('input', function (e) { etat.texte = e.target.value.trim().toLowerCase(); afficher(el); });
        el.querySelector('.wf-av-voir input').addEventListener('change', function (e) { etat.voirIgnores = e.target.checked; afficher(el); });
        charger(el);
    }

    window.addEventListener('resize', function () {
        var el = document.getElementById('wf-page');
        if (el && el.getAttribute('data-type') === 'avenir') el.style.setProperty('--wf-haut', hautEntete());
    }, { passive: true });
    window.addEventListener('wf-route', page);
    window.addEventListener('hashchange', page);
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(page);
    page();
})();
