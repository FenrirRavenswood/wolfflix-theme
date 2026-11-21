/* =====================================================================
   WolfFlix — Module « Lecteur » (chargé par wolfflix-core.js)
   Remplace la lecture des livres de Jellyfin par un lecteur WolfFlix,
   ouvert par-dessus l'interface (comme le lecteur vidéo) :
   - Livres (EPUB, KEPUB, MOBI, AZW, AZW3, FB2, PDF) : moteur foliate-js,
     page simple / double page / défilement, thèmes, polices, taille,
     interligne, marges, justification, césure, luminosité, sommaire.
   - Images (CBZ, ZIP, CBR, RAR, CB7, 7Z, CBT) :
       · mode Webtoon : défilement vertical continu, chapitre suivant
         enchaîné sans coupure, défilement automatique ;
       · mode Pages : manga/BD, page simple ou double, sens de lecture.
   - La position est sauvegardée au mot / au pixel près (même au milieu
     d'un chapitre ou d'une image), dans le navigateur ET sur le serveur
     Jellyfin : on reprend au même endroit sur n'importe quel appareil.
   Bibliothèques tierces (dans lib/) : foliate-js (MIT), zip.js (BSD-3),
   libarchive.js (MIT, moteur servi par Jellyfin lui-même).
   Désactiver : WolfFlixConfig.lecteur = false.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfLecteur) return;
    window.__wfLecteur = true;

    var html = document.documentElement;
    var config = window.WolfFlixConfig || {};
    var BASE = (window.WolfFlix && window.WolfFlix.BASE) || 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@main/';
    var CLIENT = 'wolfflix-lecture';

    /* ================= Utilitaires ================= */
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
    function toast(texte, erreur) {
        var t = document.createElement('div');
        t.className = 'wf-toast' + (erreur ? ' wf-toast-erreur' : '');
        t.textContent = texte;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('wf-toast-sortie'); }, 2800);
        setTimeout(function () { t.remove(); }, 3300);
    }
    function element(id) {
        return json('Items/' + id, { userId: uid(), Fields: 'Path,MediaSources,ParentId,Overview' })
            .catch(function () { return api().getItem(uid(), id); });
    }
    function lireJson(cle, defaut) {
        try { var v = JSON.parse(localStorage.getItem(cle)); return v == null ? defaut : v; } catch (e) { return defaut; }
    }
    function ecrireJson(cle, v) {
        try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* plein */ }
    }
    var comparateur = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
    function triNaturel(a, b) { return comparateur.compare(a, b); }
    function borne(x, a, b) { return Math.max(a, Math.min(b, x)); }

    /* ================= Formats ================= */
    var EXT_TEXTE = ['epub', 'kepub', 'mobi', 'azw', 'azw3', 'kf8', 'prc', 'fb2', 'fbz', 'pdf'];
    var EXT_ZIP = ['cbz', 'zip'];
    var EXT_ARCHIVE = ['cbr', 'rar', 'cb7', '7z', 'cbt', 'tar'];
    var IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp|jxl)$/i;

    function extension(item) {
        var chemins = [item.Path].concat((item.MediaSources || []).map(function (m) { return m.Path; }));
        for (var i = 0; i < chemins.length; i++) {
            var m = /\.([a-z0-9]+)$/i.exec(chemins[i] || '');
            if (m) return m[1].toLowerCase();
        }
        var c = item.Container || (item.MediaSources && item.MediaSources[0] && item.MediaSources[0].Container) || '';
        return String(c).toLowerCase().split(',')[0];
    }
    function genre(item) {
        var e = extension(item);
        if (EXT_TEXTE.indexOf(e) !== -1) return 'texte';
        if (EXT_ZIP.indexOf(e) !== -1 || EXT_ARCHIVE.indexOf(e) !== -1) return 'images';
        return null;
    }
    function urlFichier(id) {
        // Jellyfin 12 n'accepte plus « api_key » (ancienne méthode, désactivée par défaut) : c'est « ApiKey »
        return url('Items/' + id + '/Download', { ApiKey: api().accessToken() });
    }

    function telecharger(lien, surProgres) {
        return fetch(lien).then(function (r) {
            if (!r.ok) {
                var e = new Error('HTTP ' + r.status);
                e.statut = r.status;
                throw e;
            }
            var total = +r.headers.get('Content-Length') || 0;
            if (!r.body || !total || !surProgres) return r.blob();
            var lecteur = r.body.getReader();
            var morceaux = [];
            var recu = 0;
            function lire() {
                return lecteur.read().then(function (x) {
                    if (x.done) return new Blob(morceaux);
                    morceaux.push(x.value);
                    recu += x.value.length;
                    surProgres(recu / total);
                    return lire();
                });
            }
            return lire();
        });
    }

    /* ================= Bibliothèques (chargées à la demande) ================= */
    var chargements = {};
    function script(chemin, globale) {
        if (window[globale]) return Promise.resolve(window[globale]);
        if (!chargements[chemin]) {
            chargements[chemin] = new Promise(function (ok, ko) {
                var s = document.createElement('script');
                s.src = BASE + chemin;
                s.onload = function () { ok(window[globale]); };
                s.onerror = function () { delete chargements[chemin]; ko(new Error('chargement ' + chemin)); };
                document.head.appendChild(s);
            });
        }
        return chargements[chemin];
    }
    function zipjs() {
        return script('lib/zip/zip-native.min.js', 'zip').then(function (z) {
            z.configure({ useWebWorkers: false });
            return z;
        });
    }
    function libarchive() {
        if (!chargements.libarchive) {
            chargements.libarchive = import(BASE + 'lib/libarchive/libarchive.js').then(function (m) {
                // Le moteur (worker + wasm) est celui fourni par Jellyfin : même origine, donc autorisé
                var racine = location.origin + location.pathname.replace(/[^/]*$/, '');
                m.Archive.init({ workerUrl: racine + 'libraries/worker-bundle.js' });
                return m.Archive;
            });
            chargements.libarchive.catch(function () { delete chargements.libarchive; });
        }
        return chargements.libarchive;
    }

    /* ================= Sauvegarde de la position ================= */
    // Navigateur (instantané) + serveur Jellyfin (synchronisé entre appareils, par livre et par utilisateur)
    var Position = {
        cle: function (id) { return 'wf-lect-' + uid() + '-' + id; },
        lire: function (id) {
            var local = lireJson(this.cle(id), null);
            return api().ajax({
                type: 'GET', dataType: 'json',
                url: url('DisplayPreferences/' + id, { userId: uid(), client: CLIENT })
            }).then(function (d) {
                var s = null;
                try { s = d && d.CustomPrefs && d.CustomPrefs.pos ? JSON.parse(d.CustomPrefs.pos) : null; } catch (e) { s = null; }
                if (s && (!local || (s.d || 0) > (local.d || 0))) return s;
                return local;
            }).catch(function () { return local; });
        },
        minuteries: {},
        ecrire: function (id, pos) {
            pos.d = Date.now();
            ecrireJson(this.cle(id), pos);
            var self = this;
            clearTimeout(this.minuteries[id]);
            this.minuteries[id] = setTimeout(function () { self.envoyer(id); }, 4000);
        },
        envoyer: function (id) {
            clearTimeout(this.minuteries[id]);
            delete this.minuteries[id];
            var pos = lireJson(this.cle(id), null);
            if (!pos || !api()) return Promise.resolve();
            var corps = {
                Id: id, Client: CLIENT, SortBy: 'SortName', SortOrder: 'Ascending',
                RememberIndexing: false, RememberSorting: false, ScrollDirection: 'Horizontal',
                ShowBackdrop: false, ShowSidebar: false, PrimaryImageHeight: 250, PrimaryImageWidth: 250,
                CustomPrefs: { pos: JSON.stringify(pos) }
            };
            return api().ajax({
                type: 'POST', contentType: 'application/json', data: JSON.stringify(corps),
                url: url('DisplayPreferences/' + id, { userId: uid(), client: CLIENT })
            }).catch(function () { /* on réessaiera à la prochaine sauvegarde */ });
        },
        toutEnvoyer: function () {
            var self = this;
            Object.keys(this.minuteries).forEach(function (id) { self.envoyer(id); });
        }
    };
    window.addEventListener('pagehide', function () { Position.toutEnvoyer(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Position.toutEnvoyer(); });

    // Progression visible dans Jellyfin (barres de progression, « Continuer la lecture », « Vu »)
    var dernierEtat = {};
    function etatJellyfin(id, fraction, ticks, fini, force) {
        var maintenant = Date.now();
        var prec = dernierEtat[id];
        if (!force && prec && maintenant - prec.t < 15000 && prec.fini === fini) return;
        dernierEtat[id] = { t: maintenant, fini: fini };
        var corps = fini ? { Played: true, PlaybackPositionTicks: 0, PlayedPercentage: 0, LastPlayedDate: new Date().toISOString() }
            : { PlayedPercentage: borne(fraction * 100, 0, 100), PlaybackPositionTicks: Math.max(0, Math.round(ticks)), LastPlayedDate: new Date().toISOString() };
        api().ajax({
            type: 'POST', contentType: 'application/json', data: JSON.stringify(corps),
            url: url('UserItems/' + id + '/UserData', { userId: uid() })
        }).catch(function () { /* sans gravité */ });
    }

    /* ================= Réglages (par utilisateur, synchronisés) ================= */
    var REGLAGES_DEFAUT = {
        texte: { theme: 'nuit', police: 'literata', taille: 110, interligne: 1.55, marges: 'moyennes', justifier: true, cesure: true, mise: 'auto', animation: true, luminosite: 100 },
        images: { fond: 'noir', largeur: 100, espace: 0, sens: 'ltr', double: 'auto', ajustement: 'ecran', luminosite: 100, vitesse: 60 },
        series: {}
    };
    var reglages = null;
    var CLE_REGLAGES = 'wolfflix-reglages-lecture';
    function chargerReglages() {
        if (reglages) return Promise.resolve(reglages);
        var local = lireJson('wf-lect-reglages-' + uid(), null);
        return api().ajax({
            type: 'GET', dataType: 'json',
            url: url('DisplayPreferences/' + CLE_REGLAGES, { userId: uid(), client: CLIENT })
        }).then(function (d) {
            var s = null;
            try { s = d && d.CustomPrefs && d.CustomPrefs.reglages ? JSON.parse(d.CustomPrefs.reglages) : null; } catch (e) { s = null; }
            return s && (!local || (s.d || 0) >= (local.d || 0)) ? s : local;
        }).catch(function () { return local; }).then(function (r) {
            r = r || {};
            reglages = {
                texte: Object.assign({}, REGLAGES_DEFAUT.texte, r.texte || {}),
                images: Object.assign({}, REGLAGES_DEFAUT.images, r.images || {}),
                series: Object.assign({}, r.series || {})
            };
            return reglages;
        });
    }
    var minuterieReglages = null;
    function sauverReglages() {
        reglages.d = Date.now();
        ecrireJson('wf-lect-reglages-' + uid(), reglages);
        clearTimeout(minuterieReglages);
        minuterieReglages = setTimeout(function () {
            var corps = {
                Id: CLE_REGLAGES, Client: CLIENT, SortBy: 'SortName', SortOrder: 'Ascending',
                RememberIndexing: false, RememberSorting: false, ScrollDirection: 'Horizontal',
                ShowBackdrop: false, ShowSidebar: false, PrimaryImageHeight: 250, PrimaryImageWidth: 250,
                CustomPrefs: { reglages: JSON.stringify(reglages) }
            };
            api().ajax({
                type: 'POST', contentType: 'application/json', data: JSON.stringify(corps),
                url: url('DisplayPreferences/' + CLE_REGLAGES, { userId: uid(), client: CLIENT })
            }).catch(function () { /* local seulement */ });
        }, 1500);
    }

    /* ================= Coque du lecteur (commune à tous les modes) ================= */
    var courant = null; // lecteur ouvert

    var ICONES = {
        retour: 'arrow_back', sommaire: 'toc', reglages: 'text_fields', plein: 'fullscreen', pleinSortie: 'fullscreen_exit',
        auto: 'play_arrow', pause: 'pause'
    };

    function creerCoque(titre, sousTitre) {
        var c = document.createElement('div');
        c.id = 'wf-lecteur';
        c.className = 'wf-lect-ui';
        c.setAttribute('role', 'dialog');
        c.setAttribute('aria-modal', 'true');
        c.setAttribute('aria-label', 'Lecteur : ' + titre);
        c.innerHTML =
            '<div class="wf-lect-scene"></div>' +
            '<div class="wf-lect-voile" aria-hidden="true"></div>' +
            '<div class="wf-lect-fil" aria-hidden="true"><span></span></div>' +
            '<header class="wf-lect-haut">' +
            '<button type="button" class="wf-lect-bouton" data-act="fermer" title="Fermer (Échap)"><span class="material-icons ' + ICONES.retour + '"></span></button>' +
            '<div class="wf-lect-titres"><span class="wf-lect-sous">' + esc(sousTitre || '') + '</span><span class="wf-lect-titre">' + esc(titre) + '</span></div>' +
            '<span class="wf-lect-chapitre"></span>' +
            '<div class="wf-lect-actions">' +
            '<button type="button" class="wf-lect-bouton" data-act="auto" title="Défilement automatique" hidden><span class="material-icons ' + ICONES.auto + '"></span></button>' +
            '<button type="button" class="wf-lect-bouton" data-act="sommaire" title="Sommaire"><span class="material-icons ' + ICONES.sommaire + '"></span></button>' +
            '<button type="button" class="wf-lect-bouton" data-act="reglages" title="Réglages de lecture"><span class="material-icons ' + ICONES.reglages + '"></span></button>' +
            '<button type="button" class="wf-lect-bouton" data-act="plein" title="Plein écran (F)"><span class="material-icons ' + ICONES.plein + '"></span></button>' +
            '</div></header>' +
            '<footer class="wf-lect-bas">' +
            '<span class="wf-lect-info-g"></span>' +
            '<input type="range" class="wf-lect-curseur" min="0" max="1000" value="0" aria-label="Progression">' +
            '<span class="wf-lect-info-d"></span>' +
            '</footer>' +
            '<aside class="wf-lect-panneau" data-panneau="sommaire" aria-label="Sommaire"><header><h2>Sommaire</h2>' +
            '<button type="button" class="wf-lect-bouton" data-act="panneau-fermer"><span class="material-icons close"></span></button></header><div class="wf-lect-panneau-corps"></div></aside>' +
            '<aside class="wf-lect-panneau" data-panneau="reglages" aria-label="Réglages"><header><h2>Réglages de lecture</h2>' +
            '<button type="button" class="wf-lect-bouton" data-act="panneau-fermer"><span class="material-icons close"></span></button></header><div class="wf-lect-panneau-corps"></div></aside>' +
            '<div class="wf-lect-attente"><span class="wf-attente-loup"></span><span class="wf-lect-attente-texte">Ouverture…</span><span class="wf-lect-attente-barre"><span></span></span></div>';
        document.body.appendChild(c);
        html.classList.add('wf-lecteur-ouvert');
        return c;
    }

    function ouvrirLecteur(item, options) {
        options = options || {};
        var type = genre(item);
        if (!type) return false;
        if (courant) courant.fermer(true);

        var coque = creerCoque(item.Name, options.serie || '');
        var etat = {
            item: item, coque: coque, ferme: false, uiMinuterie: null,
            scene: coque.querySelector('.wf-lect-scene'),
            fermer: null, surCurseur: null, surCle: null, panneaux: {}
        };
        courant = etat;

        // Historique : le bouton « retour » du navigateur ferme le lecteur
        try { history.pushState({ wfLecteur: true }, '', location.href); } catch (e) { /* rien */ }
        function surPopstate() { if (!etat.ferme) etat.fermer(true); }
        window.addEventListener('popstate', surPopstate);

        etat.attente = function (texte, fraction) {
            var a = coque.querySelector('.wf-lect-attente');
            if (texte === false) { a.classList.add('wf-cache'); return; }
            a.classList.remove('wf-cache');
            if (texte) a.querySelector('.wf-lect-attente-texte').textContent = texte;
            a.querySelector('.wf-lect-attente-barre span').style.width = (fraction != null ? Math.round(fraction * 100) : 0) + '%';
            a.classList.toggle('wf-avec-barre', fraction != null);
        };
        etat.erreur = function (message, natif) {
            etat.attente(false);
            var d = document.createElement('div');
            d.className = 'wf-lect-erreur';
            d.innerHTML = '<span class="material-icons error_outline" aria-hidden="true"></span><p>' + esc(message) + '</p>' +
                '<div>' + (natif ? '<button type="button" class="wf-btn wf-btn-sec" data-act="natif">Ouvrir avec le lecteur Jellyfin</button>' : '') +
                '<button type="button" class="wf-btn wf-btn-pri" data-act="fermer">Fermer</button></div>';
            coque.appendChild(d);
        };

        // Interface : apparaît au toucher / mouvement, se cache pendant la lecture
        etat.montrerUi = function (garder) {
            coque.classList.add('wf-lect-ui');
            clearTimeout(etat.uiMinuterie);
            if (!garder) etat.uiMinuterie = setTimeout(function () { if (!coque.querySelector('.wf-lect-panneau.wf-ouvert')) coque.classList.remove('wf-lect-ui'); }, 3200);
        };
        etat.cacherUi = function () {
            clearTimeout(etat.uiMinuterie);
            if (!coque.querySelector('.wf-lect-panneau.wf-ouvert')) coque.classList.remove('wf-lect-ui');
        };
        etat.basculerUi = function () {
            if (coque.classList.contains('wf-lect-ui')) etat.cacherUi(); else etat.montrerUi();
        };
        etat.ouvrirPanneau = function (nom) {
            coque.querySelectorAll('.wf-lect-panneau').forEach(function (p) {
                p.classList.toggle('wf-ouvert', p.getAttribute('data-panneau') === nom && !p.classList.contains('wf-ouvert'));
            });
            var ouvert = coque.querySelector('.wf-lect-panneau.wf-ouvert');
            if (ouvert && etat.panneaux[nom]) etat.panneaux[nom](ouvert.querySelector('.wf-lect-panneau-corps'));
            etat.montrerUi(!!ouvert);
        };
        etat.chapitre = function (t) { coque.querySelector('.wf-lect-chapitre').textContent = t || ''; };
        etat.infos = function (g, d) {
            coque.querySelector('.wf-lect-info-g').textContent = g || '';
            coque.querySelector('.wf-lect-info-d').textContent = d || '';
        };
        etat.curseur = function (f) {
            var c = coque.querySelector('.wf-lect-curseur');
            if (!etat.curseurActif) c.value = Math.round(borne(f, 0, 1) * 1000);
            coque.querySelector('.wf-lect-fil span').style.width = (borne(f, 0, 1) * 100).toFixed(2) + '%';
        };
        etat.lumiere = function (v) {
            coque.querySelector('.wf-lect-voile').style.opacity = String(borne(1 - v / 100, 0, 0.85));
        };

        var curseur = coque.querySelector('.wf-lect-curseur');
        curseur.addEventListener('input', function () {
            etat.curseurActif = true;
            if (etat.surCurseur) etat.surCurseur(curseur.value / 1000, false);
        });
        curseur.addEventListener('change', function () {
            etat.curseurActif = false;
            if (etat.surCurseur) etat.surCurseur(curseur.value / 1000, true);
        });

        coque.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'fermer') etat.fermer();
            else if (act === 'sommaire' || act === 'reglages') etat.ouvrirPanneau(act);
            else if (act === 'panneau-fermer') etat.ouvrirPanneau('');
            else if (act === 'plein') pleinEcran(coque);
            else if (act === 'natif') { etat.fermer(); ouvrirNatif(item.Id); }
            else if (act === 'auto' && etat.surAuto) etat.surAuto();
        });
        coque.addEventListener('mousemove', function (e) {
            if (e.clientY < 90 || e.clientY > window.innerHeight - 90) etat.montrerUi();
        });

        function clavier(e) {
            if (etat.ferme) return;
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (coque.querySelector('.wf-lect-panneau.wf-ouvert')) etat.ouvrirPanneau('');
                else etat.fermer();
                return;
            }
            if (e.key === 'f' || e.key === 'F') { pleinEcran(coque); return; }
            if (etat.surCle && etat.surCle(e) !== false) { e.preventDefault(); e.stopPropagation(); }
        }
        document.addEventListener('keydown', clavier, true);
        etat.clavier = clavier;

        etat.fermer = function (depuisHistorique) {
            if (etat.ferme) return;
            etat.ferme = true;
            try { if (etat.avantFermeture) etat.avantFermeture(); } catch (e) { /* rien */ }
            Position.toutEnvoyer();
            document.removeEventListener('keydown', clavier, true);
            window.removeEventListener('popstate', surPopstate);
            if (document.fullscreenElement) document.exitFullscreen().catch(function () { /* rien */ });
            coque.classList.add('wf-lect-sortie');
            setTimeout(function () { coque.remove(); }, 250);
            html.classList.remove('wf-lecteur-ouvert');
            if (courant === etat) courant = null;
            if (!depuisHistorique) { try { if (history.state && history.state.wfLecteur) history.back(); } catch (e) { /* rien */ } }
            // Les cartes de Jellyfin se mettront à jour (progression, « vu »)
            if (window.WolfFlix && window.WolfFlix.oublierElement) window.WolfFlix.oublierElement(item.Id);
        };

        etat.montrerUi();
        chargerReglages().then(function () {
            if (etat.ferme) return;
            return Position.lire(item.Id).then(function (pos) {
                if (options.depuisDebut) pos = null;
                if (pos && pos.fini) pos = null;
                if (type === 'texte') return lecteurTexte(etat, pos);
                return lecteurImages(etat, pos, options);
            });
        }).catch(function (e) {
            if (etat.ferme) return;
            var droit = e && e.statut === 403;
            etat.erreur(e && e.statut === 401 ? 'Jellyfin a refusé l\'accès au fichier (session expirée ?). Recharge la page avec Ctrl+F5, puis réessaie.'
                : droit ? 'Ton compte n\'a pas le droit de télécharger les fichiers. Dans Tableau de bord → Utilisateurs → ton compte, coche « Autoriser le téléchargement des médias » (le lecteur de Jellyfin a le même besoin).'
                : 'Impossible d\'ouvrir ce livre (' + ((e && e.message) || 'erreur inconnue') + ').', true);
        });
        return true;
    }

    function pleinEcran(el) {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () { /* rien */ });
        else if (el.requestFullscreen) el.requestFullscreen().catch(function () { /* rien */ });
    }

    function radio(nom, valeur, choix) {
        return '<div class="wf-lect-choix" role="radiogroup" data-reglage="' + nom + '">' + choix.map(function (c) {
            return '<button type="button" role="radio" aria-checked="' + (String(c[0]) === String(valeur)) + '" data-valeur="' + esc(c[0]) + '"' +
                (c[2] ? ' style="' + c[2] + '"' : '') + '>' + c[1] + '</button>';
        }).join('') + '</div>';
    }
    function glissiere(nom, valeur, min, max, pas, format) {
        return '<div class="wf-lect-glissiere"><input type="range" data-reglage="' + nom + '" min="' + min + '" max="' + max + '" step="' + pas + '" value="' + valeur + '">' +
            '<output>' + format(valeur) + '</output></div>';
    }
    function lierReglages(corps, cible, appliquer, formats) {
        corps.querySelectorAll('.wf-lect-choix').forEach(function (g) {
            g.addEventListener('click', function (e) {
                var b = e.target.closest('button[data-valeur]');
                if (!b) return;
                g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
                var v = b.getAttribute('data-valeur');
                cible[g.getAttribute('data-reglage')] = v === 'true' ? true : v === 'false' ? false : (isNaN(+v) || v === '' ? v : +v);
                sauverReglages();
                appliquer(g.getAttribute('data-reglage'));
            });
        });
        corps.querySelectorAll('input[type="range"][data-reglage]').forEach(function (r) {
            r.addEventListener('input', function () {
                var nom = r.getAttribute('data-reglage');
                cible[nom] = +r.value;
                var o = r.parentNode.querySelector('output');
                if (o && formats && formats[nom]) o.textContent = formats[nom](+r.value);
                appliquer(nom);
            });
            r.addEventListener('change', sauverReglages);
        });
    }

    /* ================= Lecteur de LIVRES (foliate-js) ================= */
    var THEMES = {
        nuit: { fond: '#121214', texte: '#E6E1DA', lien: '#E0707A', nom: 'Nuit' },
        sepia: { fond: '#F3EAD6', texte: '#3A2E22', lien: '#8A1D26', nom: 'Sépia' },
        papier: { fond: '#FBFAF7', texte: '#1E1E1E', lien: '#A3232E', nom: 'Papier' },
        parchemin: { fond: '#E6D8BA', texte: '#2A1F15', lien: '#7A1820', nom: 'Parchemin' },
        encre: { fond: '#000000', texte: '#C9C9C9', lien: '#C73441', nom: 'Encre (OLED)' }
    };
    var POLICES = {
        livre: { nom: 'Police du livre', css: '' },
        literata: { nom: 'Literata', css: '"WF Literata", Georgia, serif' },
        spectral: { nom: 'Spectral', css: '"WF Spectral", Georgia, serif' },
        atkinson: { nom: 'Atkinson (lisibilité)', css: '"WF Atkinson", Verdana, sans-serif' },
        dyslexie: { nom: 'OpenDyslexic', css: '"WF OpenDyslexic", Verdana, sans-serif' },
        systeme: { nom: 'Sans empattement', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }
    };
    function policesCss() {
        var f = BASE + 'fonts/';
        function ff(famille, fichier, poids, style) {
            return '@font-face{font-family:"' + famille + '";src:url("' + f + fichier + '") format("woff2");font-weight:' + poids + ';font-style:' + (style || 'normal') + ';font-display:swap}';
        }
        return ff('WF Literata', 'literata-latin-400-normal.woff2', 400) + ff('WF Literata', 'literata-latin-400-italic.woff2', 400, 'italic') +
            ff('WF Literata', 'literata-latin-700-normal.woff2', 700) +
            ff('WF Spectral', 'spectral-400-normal.woff2', 400) + ff('WF Spectral', 'spectral-400-italic.woff2', 400, 'italic') +
            ff('WF Spectral', 'spectral-600-normal.woff2', 700) +
            ff('WF Atkinson', 'atkinson-hyperlegible-latin-400-normal.woff2', 400) + ff('WF Atkinson', 'atkinson-hyperlegible-latin-400-italic.woff2', 400, 'italic') +
            ff('WF Atkinson', 'atkinson-hyperlegible-latin-700-normal.woff2', 700) +
            ff('WF OpenDyslexic', 'opendyslexic-latin-400-normal.woff2', 400) + ff('WF OpenDyslexic', 'opendyslexic-latin-700-normal.woff2', 700);
    }
    function cssLivre(r) {
        var t = THEMES[r.theme] || THEMES.nuit;
        var police = (POLICES[r.police] || POLICES.literata).css;
        return policesCss() +
            '@namespace epub "http://www.idpf.org/2007/ops";' +
            'html{color:' + t.texte + ' !important;background:' + t.fond + ' !important;color-scheme:' + (r.theme === 'nuit' || r.theme === 'encre' ? 'dark' : 'light') + '}' +
            'body{color:inherit !important;background:transparent !important;font-size:' + r.taille + '% !important;' + (police ? 'font-family:' + police + ' !important;' : '') + '}' +
            (police ? 'p,li,blockquote,dd,div,span{font-family:inherit !important}' : '') +
            'p,li,blockquote,dd{line-height:' + r.interligne + ' !important;text-align:' + (r.justifier ? 'justify' : 'start') + ';' +
            '-webkit-hyphens:' + (r.cesure ? 'auto' : 'manual') + ';hyphens:' + (r.cesure ? 'auto' : 'manual') + ';widows:2;orphans:2}' +
            '[align="left"]{text-align:left}[align="right"]{text-align:right}[align="center"]{text-align:center}' +
            'a:link,a:visited{color:' + t.lien + ' !important}' +
            'h1,h2,h3,h4{line-height:1.25 !important;text-align:center}' +
            'img,svg{max-width:100%;height:auto}' +
            'pre{white-space:pre-wrap !important}' +
            '::selection{background:rgba(199,52,65,.35)}' +
            'aside[epub|type~="footnote"],aside[epub|type~="endnote"],aside[epub|type~="note"],aside[epub|type~="rearnote"]{display:none}';
    }

    // SHA-1 de secours (polices obfusquées d'EPUB quand Jellyfin est en http : Web Crypto indisponible)
    function sha1(octets) {
        var b = octets instanceof Uint8Array ? octets : new TextEncoder().encode(String(octets));
        var l = b.length;
        var mots = new Uint32Array((((l + 8) >> 6) + 1) * 16);
        for (var i = 0; i < l; i++) mots[i >> 2] |= b[i] << (24 - (i % 4) * 8);
        mots[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
        mots[mots.length - 1] = l * 8;
        var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
        var w = new Uint32Array(80);
        for (var j = 0; j < mots.length; j += 16) {
            for (var t = 0; t < 80; t++) {
                w[t] = t < 16 ? mots[j + t] : ((w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]) << 1) | ((w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]) >>> 31);
            }
            var a = h0, bb = h1, c = h2, d = h3, e = h4;
            for (var k = 0; k < 80; k++) {
                var f = k < 20 ? (bb & c) | (~bb & d) : k < 40 ? bb ^ c ^ d : k < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
                var kk = k < 20 ? 0x5A827999 : k < 40 ? 0x6ED9EBA1 : k < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
                var tmp = (((a << 5) | (a >>> 27)) + f + e + kk + w[k]) >>> 0;
                e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = tmp;
            }
            h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
        }
        var out = new Uint8Array(20);
        [h0, h1, h2, h3, h4].forEach(function (h, n) {
            out[n * 4] = h >>> 24; out[n * 4 + 1] = (h >>> 16) & 255; out[n * 4 + 2] = (h >>> 8) & 255; out[n * 4 + 3] = h & 255;
        });
        return out;
    }
    function sha1Epub(texte) {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            return window.crypto.subtle.digest('SHA-1', new TextEncoder().encode(texte)).then(function (x) { return new Uint8Array(x); });
        }
        return Promise.resolve(sha1(new TextEncoder().encode(texte)));
    }

    // Lecture d'un ZIP (EPUB, CBZ) par morceaux, sans tout télécharger
    async function chargeurZip(lien, surProgres) {
        var zip = await zipjs();
        var lecteur;
        var entrees;
        try {
            lecteur = new zip.ZipReader(new zip.HttpRangeReader(lien, { preventHeadRequest: true }));
            entrees = await lecteur.getEntries();
        } catch (e) {
            // Le serveur refuse la lecture par morceaux : téléchargement complet
            var blob = await telecharger(lien, surProgres);
            lecteur = new zip.ZipReader(new zip.BlobReader(blob));
            entrees = await lecteur.getEntries();
        }
        var parNom = new Map(entrees.map(function (x) { return [x.filename, x]; }));
        return {
            entries: entrees,
            loadText: function (n) { return parNom.has(n) ? parNom.get(n).getData(new zip.TextWriter()) : null; },
            loadBlob: function (n, type) { return parNom.has(n) ? parNom.get(n).getData(new zip.BlobWriter(type)) : null; },
            getSize: function (n) { var x = parNom.get(n); return x ? x.uncompressedSize : 0; },
            fermer: function () { try { lecteur.close(); } catch (e) { /* rien */ } }
        };
    }

    function nettoyerScripts(livre) {
        // Les EPUB peuvent contenir des scripts : on les retire avant affichage (sécurité)
        if (!livre.transformTarget) return;
        livre.transformTarget.addEventListener('data', function (ev) {
            var d = ev.detail;
            if (!/html|xml|svg/i.test(d.type || '')) return;
            d.data = Promise.resolve(d.data).then(function (x) {
                if (typeof x !== 'string') return x;
                return x.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
                    .replace(/<script\b[^>]*\/>/gi, '')
                    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
            }).catch(function () { return ''; });
        });
    }

    async function lecteurTexte(etat, pos) {
        var item = etat.item;
        var ext = extension(item);
        var r = reglages.texte;
        var coque = etat.coque;
        coque.setAttribute('data-mode', 'texte');
        coque.setAttribute('data-theme', r.theme);
        etat.attente('Ouverture du livre…', null);

        // Balise renommée « wf-foliate-view » : Jellyfin (ou une extension) peut déjà utiliser « foliate-view »
        var View = (await import(BASE + 'lib/foliate/view.js')).View;
        var livre;
        var chargeur = null;
        if (ext === 'epub' || ext === 'kepub') {
            chargeur = await chargeurZip(urlFichier(item.Id), function (f) { etat.attente('Téléchargement…', f); });
            var EPUB = (await import(BASE + 'lib/foliate/epub.js')).EPUB;
            livre = await new EPUB({ loadText: chargeur.loadText, loadBlob: chargeur.loadBlob, getSize: chargeur.getSize, sha1: sha1Epub }).init();
        } else {
            var blob = await telecharger(urlFichier(item.Id), function (f) { etat.attente('Téléchargement…', f); });
            if (etat.ferme) return;
            etat.attente('Mise en page…', null);
            var types = { pdf: 'application/pdf', fb2: 'application/x-fictionbook+xml', fbz: 'application/x-zip-compressed-fb2' };
            var fichier = new File([blob], 'livre.' + ext, { type: types[ext] || 'application/octet-stream' });
            var makeBook = (await import(BASE + 'lib/foliate/view.js')).makeBook;
            livre = await makeBook(fichier);
        }
        if (etat.ferme) return;
        nettoyerScripts(livre);

        var vue = new View();
        vue.className = 'wf-lect-vue';
        etat.scene.appendChild(vue);
        if (typeof vue.open !== 'function') throw new Error('moteur de lecture indisponible (conflit avec une autre extension ?)');
        await vue.open(livre);
        var fixe = vue.isFixedLayout;
        var rendu = vue.renderer;
        etat.attente(false);

        function appliquer(quoi) {
            var t = THEMES[r.theme] || THEMES.nuit;
            coque.setAttribute('data-theme', r.theme);
            coque.style.setProperty('--wf-lect-fond', t.fond);
            coque.style.setProperty('--wf-lect-texte', t.texte);
            etat.lumiere(r.luminosite);
            if (fixe) {
                if (rendu.setAttribute) rendu.setAttribute('zoom', 'fit-page');
                return;
            }
            var paysage = etat.scene.clientWidth > etat.scene.clientHeight * 1.15;
            var mise = r.mise === 'auto' ? (paysage && etat.scene.clientWidth > 1000 ? 'double' : 'une') : r.mise;
            rendu.setAttribute('flow', mise === 'defilement' ? 'scrolled' : 'paginated');
            rendu.setAttribute('max-column-count', mise === 'double' ? '2' : '1');
            rendu.setAttribute('max-inline-size', mise === 'double' ? '620px' : '760px');
            rendu.setAttribute('gap', { etroites: '4%', moyennes: '7%', larges: '11%' }[r.marges] || '7%');
            rendu.setAttribute('margin', window.innerHeight < 600 ? '36px' : '56px');
            if (r.animation && mise !== 'defilement') rendu.setAttribute('animated', ''); else rendu.removeAttribute('animated');
            if (quoi !== 'luminosite' && rendu.setStyles) rendu.setStyles(cssLivre(r));
            coque.classList.toggle('wf-lect-defilement', mise === 'defilement');
        }
        appliquer();
        var minRedim = null;
        etat.surRedim = function () { clearTimeout(minRedim); minRedim = setTimeout(function () { if (r.mise === 'auto') appliquer('mise'); }, 250); };
        window.addEventListener('resize', etat.surRedim);

        // Navigation
        function precedent() { return vue.goLeft(); }
        function suivant() { return vue.goRight(); }
        var dernierTour = 0;
        function molette(e) {
            if (coque.classList.contains('wf-lect-defilement')) return;
            var maintenant = Date.now();
            if (maintenant - dernierTour < 350 || Math.abs(e.deltaY) < 8) return;
            dernierTour = maintenant;
            if (e.deltaY > 0) vue.next(); else vue.prev();
        }
        etat.scene.addEventListener('wheel', molette, { passive: true });
        etat.surCle = function (e) {
            var k = e.key;
            if (k === 'ArrowLeft' || k === 'PageUp') { precedent(); return; }
            if (k === 'ArrowRight' || k === 'PageDown') { suivant(); return; }
            if (k === ' ') { if (e.shiftKey) vue.prev(); else vue.next(); return; }
            if (k === 'ArrowUp' && !coque.classList.contains('wf-lect-defilement')) { vue.prev(); return; }
            if (k === 'ArrowDown' && !coque.classList.contains('wf-lect-defilement')) { vue.next(); return; }
            if (k === 'Home') { vue.goToFraction(0); return; }
            if (k === 'End') { vue.goToFraction(1); return; }
            return false;
        };

        // Zones de toucher : bords = page précédente / suivante, centre = afficher/masquer l'interface
        var zones = document.createElement('div');
        zones.className = 'wf-lect-zones';
        zones.innerHTML = '<button type="button" class="wf-lect-zone wf-lect-zone-g" aria-label="Page précédente"></button><button type="button" class="wf-lect-zone wf-lect-zone-d" aria-label="Page suivante"></button>';
        etat.scene.appendChild(zones);
        zones.querySelector('.wf-lect-zone-g').addEventListener('click', function () { precedent(); etat.cacherUi(); });
        zones.querySelector('.wf-lect-zone-d').addEventListener('click', function () { suivant(); etat.cacherUi(); });
        zones.addEventListener('wheel', molette, { passive: true });

        vue.addEventListener('load', function (ev) {
            var doc = ev.detail.doc;
            doc.addEventListener('keydown', function (e) { etat.clavier(e); });
            doc.addEventListener('wheel', molette, { passive: true });
            doc.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('a[href]')) return;
                var sel = doc.getSelection && doc.getSelection();
                if (sel && String(sel).length) return;
                etat.basculerUi();
            });
        });
        vue.addEventListener('external-link', function (e) { e.preventDefault(); window.open(e.detail.a.href, '_blank', 'noopener'); });

        // Progression + sauvegarde
        var total = livre.sections ? livre.sections.length : 1;
        vue.addEventListener('relocate', function (ev) {
            var d = ev.detail;
            var indexFxl = fixe && typeof rendu.index === 'number' ? rendu.index : null;
            var fraction = typeof d.fraction === 'number' ? d.fraction
                : indexFxl != null ? indexFxl / Math.max(1, total - 1)
                    : (d.section ? d.section.current / Math.max(1, d.section.total - 1) : 0);
            etat.curseur(fraction);
            etat.chapitre(d.tocItem && d.tocItem.label ? d.tocItem.label : '');
            var g = '';
            if (indexFxl != null) g = 'Page ' + (indexFxl + 1) + ' / ' + total;
            else if (d.time && d.time.section > 0.5) g = '≈ ' + Math.ceil(d.time.section) + ' min restantes dans ce chapitre';
            else if (d.pageItem) g = 'Page ' + d.pageItem.label;
            else if (d.location) g = 'Emplacement ' + (d.location.current + 1) + ' / ' + d.location.total;
            etat.infos(g, Math.round(fraction * 100) + ' %');
            var fini = fraction >= 0.995;
            Position.ecrire(item.Id, { t: 'texte', cfi: d.cfi || null, f: fraction, i: indexFxl != null ? indexFxl : (d.section ? d.section.current : null), fini: fini });
            etatJellyfin(item.Id, fraction, fraction * 10000000, fini);
        });
        etat.surCurseur = function (f, fin) { if (fin || f === 0 || f === 1) vue.goToFraction(f); };
        etat.avantFermeture = function () {
            window.removeEventListener('resize', etat.surRedim);
            var l = lireJson(Position.cle(item.Id), null);
            if (l) etatJellyfin(item.Id, l.f || 0, (l.f || 0) * 10000000, !!l.fini, true);
            try { vue.close && vue.close(); } catch (e) { /* rien */ }
            if (chargeur) chargeur.fermer();
        };

        // Panneaux
        etat.panneaux.sommaire = function (corps) {
            var toc = livre.toc || [];
            function liste(l, niveau) {
                return '<ol class="wf-lect-toc">' + l.map(function (x) {
                    return '<li><button type="button" data-href="' + esc(x.href) + '" style="padding-left:' + (0.8 + niveau * 1.1) + 'em">' + esc(x.label) + '</button>' +
                        (x.subitems && x.subitems.length ? liste(x.subitems, niveau + 1) : '') + '</li>';
                }).join('') + '</ol>';
            }
            corps.innerHTML = (toc.length ? liste(toc, 0) : '<p class="wf-vide">Ce livre n\'a pas de sommaire.</p>') +
                '<button type="button" class="wf-btn wf-btn-sec wf-lect-recommencer"><span class="material-icons restart_alt" aria-hidden="true"></span> Recommencer depuis le début</button>';
            corps.querySelectorAll('[data-href]').forEach(function (b) {
                b.addEventListener('click', function () { vue.goTo(b.getAttribute('data-href')); etat.ouvrirPanneau(''); });
            });
            corps.querySelector('.wf-lect-recommencer').addEventListener('click', function () { vue.goToFraction(0); etat.ouvrirPanneau(''); });
            var actuel = vue.lastLocation && vue.lastLocation.tocItem;
            if (actuel) corps.querySelectorAll('[data-href]').forEach(function (b) { if (b.getAttribute('data-href') === actuel.href) b.classList.add('wf-actif'); });
        };
        etat.panneaux.reglages = function (corps) {
            var pct = function (v) { return v + ' %'; };
            corps.innerHTML =
                '<h3>Thème</h3>' + radio('theme', r.theme, Object.keys(THEMES).map(function (k) {
                    return [k, THEMES[k].nom, 'background:' + THEMES[k].fond + ';color:' + THEMES[k].texte];
                })) +
                (fixe ? '' :
                    '<h3>Police</h3>' + radio('police', r.police, Object.keys(POLICES).map(function (k) {
                        return [k, POLICES[k].nom, POLICES[k].css ? 'font-family:' + POLICES[k].css.replace(/"/g, "'") : ''];
                    })) +
                    '<h3>Taille du texte</h3>' + glissiere('taille', r.taille, 70, 220, 5, pct) +
                    '<h3>Interligne</h3>' + glissiere('interligne', r.interligne, 1.1, 2.2, 0.05, function (v) { return (+v).toFixed(2); }) +
                    '<h3>Marges</h3>' + radio('marges', r.marges, [['etroites', 'Étroites'], ['moyennes', 'Moyennes'], ['larges', 'Larges']]) +
                    '<h3>Mise en page</h3>' + radio('mise', r.mise, [['auto', 'Auto'], ['une', 'Une page'], ['double', 'Double page'], ['defilement', 'Défilement']]) +
                    '<h3>Texte</h3>' + radio('justifier', r.justifier, [[true, 'Justifié'], [false, 'Aligné à gauche']]) +
                    radio('cesure', r.cesure, [[true, 'Césure'], [false, 'Sans césure']]) +
                    '<h3>Tourner les pages</h3>' + radio('animation', r.animation, [[true, 'Glissement'], [false, 'Instantané']])) +
                '<h3>Luminosité</h3>' + glissiere('luminosite', r.luminosite, 30, 100, 1, pct);
            lierReglages(corps, r, appliquer, { taille: pct, luminosite: pct, interligne: function (v) { return (+v).toFixed(2); } });
        };

        // Position de départ
        var depart = null;
        if (pos && pos.t === 'texte') depart = pos.cfi || (typeof pos.i === 'number' && fixe ? pos.i : null);
        try {
            await vue.init({ lastLocation: depart });
        } catch (e) {
            await vue.init({ lastLocation: null });
        }
        if (!depart && pos && typeof pos.f === 'number' && pos.f > 0) vue.goToFraction(pos.f);
        if (depart) toast('Reprise de ta lecture');
    }

    /* ================= Sources d'IMAGES (CBZ / CBR / …) ================= */
    function chapitreDe(nom) {
        var parties = nom.split('/');
        if (parties.length > 1) return parties.slice(0, -1).join(' / ');
        var m = /(?:chap(?:itre|ter)?|ch|ep(?:isode)?|c)[ ._-]*0*(\d+(?:\.\d+)?)/i.exec(nom);
        return m ? 'Chapitre ' + m[1] : '';
    }

    async function ouvrirArchive(item, surProgres) {
        var ext = extension(item);
        var lien = urlFichier(item.Id);
        var pages;
        var infos = null;
        var fermer = function () { /* rien */ };
        if (EXT_ZIP.indexOf(ext) !== -1) {
            var ch = await chargeurZip(lien, surProgres);
            fermer = ch.fermer;
            var images = ch.entries.filter(function (x) {
                return !x.directory && IMAGE.test(x.filename) && !/(^|\/)(__MACOSX|\.)/.test(x.filename);
            });
            images.sort(function (a, b) { return triNaturel(a.filename, b.filename); });
            pages = images.map(function (x) {
                return { nom: x.filename, chapitre: chapitreDe(x.filename), charger: function () { return ch.loadBlob(x.filename); } };
            });
            var ci = ch.entries.filter(function (x) { return /(^|\/)comicinfo\.xml$/i.test(x.filename); })[0];
            if (ci) { try { infos = await ch.loadText(ci.filename); } catch (e) { infos = null; } }
        } else {
            var Archive = await libarchive();
            var blob = await telecharger(lien, surProgres);
            var archive = await Archive.open(new File([blob], 'livre.' + ext));
            fermer = function () { try { archive.close(); } catch (e) { /* rien */ } };
            var fichiers = await archive.getFilesArray();
            var imgs = fichiers.filter(function (f) {
                var nom = (f.path || '') + (f.file && f.file.name ? f.file.name : '');
                return IMAGE.test(nom) && !/(^|\/)(__MACOSX|\.)/.test(nom);
            }).map(function (f) { return { nom: (f.path || '') + f.file.name, f: f.file }; });
            imgs.sort(function (a, b) { return triNaturel(a.nom, b.nom); });
            pages = imgs.map(function (x) {
                return { nom: x.nom, chapitre: chapitreDe(x.nom), charger: function () { return x.f.extract ? x.f.extract() : Promise.resolve(x.f); } };
            });
            var ciF = fichiers.filter(function (f) { return /comicinfo\.xml$/i.test(f.file && f.file.name || ''); })[0];
            if (ciF) { try { infos = await (await ciF.file.extract()).text(); } catch (e) { infos = null; } }
        }
        var manga = false;
        var formatWebtoon = false;
        if (infos) {
            manga = /<Manga>\s*YesAndRightToLeft\s*<\/Manga>/i.test(infos);
            formatWebtoon = /<Format>\s*(Web\s*-?toon|Long\s*Strip)/i.test(infos) || /<Tags>[^<]*webtoon/i.test(infos);
        }
        return { pages: pages, fermer: fermer, manga: manga, webtoon: formatWebtoon };
    }

    function dimensions(blob) {
        if (window.createImageBitmap) {
            return createImageBitmap(blob).then(function (b) {
                var d = { l: b.width, h: b.height };
                if (b.close) b.close();
                return d;
            });
        }
        return new Promise(function (ok) {
            var u = URL.createObjectURL(blob);
            var i = new Image();
            i.onload = function () { ok({ l: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); };
            i.onerror = function () { ok({ l: 1, h: 1.4 }); URL.revokeObjectURL(u); };
            i.src = u;
        });
    }

    async function lecteurImages(etat, pos, options) {
        var item = etat.item;
        var serie = item.ParentId || 'aucune';
        etat.attente('Ouverture…', null);
        var source = await ouvrirArchive(item, function (f) { etat.attente('Téléchargement…', f); });
        if (etat.ferme) { source.fermer(); return; }
        if (!source.pages.length) throw new Error('aucune image dans ce fichier');

        // Mode : choix enregistré pour la série, sinon détection (images très hautes = webtoon)
        var choixSerie = reglages.series[serie] || {};
        var mode = options.mode || choixSerie.mode;
        if (!mode) {
            if (source.webtoon) mode = 'webtoon';
            else {
                var echantillon = source.pages.slice(1, 4);
                if (!echantillon.length) echantillon = source.pages.slice(0, 1);
                var ratios = [];
                for (var i = 0; i < echantillon.length; i++) {
                    try { var d = await dimensions(await echantillon[i].charger()); ratios.push(d.h / Math.max(1, d.l)); } catch (e) { /* rien */ }
                }
                ratios.sort();
                var median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1.4;
                mode = median > 2.1 ? 'webtoon' : 'pages';
            }
        }
        if (!choixSerie.sens && source.manga) choixSerie.sens = 'rtl';
        etat.serie = serie;
        etat.choixSerie = choixSerie;
        if (mode === 'webtoon') return modeWebtoon(etat, source, pos);
        return modePages(etat, source, pos);
    }

    function changerMode(etat, mode) {
        reglages.series[etat.serie] = Object.assign({}, reglages.series[etat.serie] || {}, { mode: mode });
        sauverReglages();
        var item = etat.item;
        var serie = etat.coque.querySelector('.wf-lect-sous').textContent;
        etat.fermer();
        setTimeout(function () { ouvrirLecteur(item, { mode: mode, serie: serie }); }, 320);
    }

    // Chapitres / tomes voisins dans le même dossier (pour enchaîner)
    function voisins(item) {
        if (!item.ParentId) return Promise.resolve([]);
        return json('Users/' + uid() + '/Items', {
            ParentId: item.ParentId, IncludeItemTypes: 'Book', Fields: 'Path,MediaSources,ParentId', EnableImages: false, Limit: 2000
        }).then(function (r) {
            var l = (r.Items || []).slice();
            l.sort(function (a, b) { return triNaturel(a.SortName || a.Name || '', b.SortName || b.Name || '') || triNaturel(a.Path || '', b.Path || ''); });
            return l;
        }).catch(function () { return []; });
    }

    /* ----- Mode WEBTOON : défilement vertical continu ----- */
    async function modeWebtoon(etat, source, pos) {
        var r = reglages.images;
        var coque = etat.coque;
        coque.setAttribute('data-mode', 'webtoon');
        coque.setAttribute('data-fond', r.fond);
        coque.querySelector('[data-act="auto"]').hidden = false;
        var scene = etat.scene;
        var defile = document.createElement('div');
        defile.className = 'wf-wt';
        defile.tabIndex = -1;
        scene.appendChild(defile);
        var bande = document.createElement('div');
        bande.className = 'wf-wt-bande';
        defile.appendChild(bande);

        var pages = [];          // toutes les images affichées (plusieurs fichiers possibles)
        var fichiers = [];       // { item, source, debut, fin, ratios }
        var enCharge = 0;
        var file = [];

        function appliquer() {
            coque.setAttribute('data-fond', r.fond);
            // 100 % = 900 px max sur grand écran, toute la largeur sur téléphone
            bande.style.setProperty('--wf-wt-largeur-px', Math.round(r.largeur * 9) + 'px');
            bande.style.setProperty('--wf-wt-espace', r.espace + 'px');
            etat.lumiere(r.luminosite);
        }
        appliquer();

        function ajouterFichier(it, src, cleDims) {
            var f = { item: it, source: src, debut: pages.length, ratios: lireJson('wf-dims-' + it.Id, []), cleDims: cleDims };
            if (fichiers.length) {
                var sep = document.createElement('div');
                sep.className = 'wf-wt-separateur';
                sep.innerHTML = '<span>Fin de « ' + esc(fichiers[fichiers.length - 1].item.Name) + ' »</span><strong>' + esc(it.Name) + '</strong>';
                bande.appendChild(sep);
            }
            var estimation = 1.5;
            src.pages.forEach(function (p, k) {
                var el = document.createElement('div');
                el.className = 'wf-wt-page';
                var ratio = f.ratios[k] || estimation;
                el.style.aspectRatio = '1 / ' + ratio;
                el.setAttribute('data-n', String(pages.length));
                bande.appendChild(el);
                pages.push({ el: el, fichier: f, k: k, page: p, url: null, etat: 'vide', ratio: ratio, connu: !!f.ratios[k] });
                observateur.observe(el);
            });
            f.fin = pages.length;
            fichiers.push(f);
            return f;
        }

        // Chargement des images proches de l'écran (3 en parallèle, les plus proches d'abord)
        var visibles = new Set();
        var observateur = new IntersectionObserver(function (entrees) {
            entrees.forEach(function (en) {
                var n = +en.target.getAttribute('data-n');
                if (en.isIntersecting) visibles.add(n); else visibles.delete(n);
            });
            planifierChargements();
        }, { root: defile, rootMargin: '250% 0px 250% 0px' });

        function planifierChargements() {
            var centre = indexCourant();
            var aFaire = Array.from(visibles).filter(function (n) { return pages[n] && pages[n].etat === 'vide'; });
            aFaire.sort(function (a, b) { return Math.abs(a - centre) - Math.abs(b - centre); });
            file = aFaire;
            pomper();
            // Libère la mémoire des images très loin
            pages.forEach(function (p, n) {
                if (p.url && Math.abs(n - centre) > 60) {
                    URL.revokeObjectURL(p.url);
                    p.url = null;
                    p.etat = 'vide';
                    var img = p.el.querySelector('img');
                    if (img) img.remove();
                }
            });
        }
        function pomper() {
            while (enCharge < 3 && file.length) {
                var n = file.shift();
                var p = pages[n];
                if (!p || p.etat !== 'vide') continue;
                charger(p);
            }
        }
        function charger(p) {
            p.etat = 'charge';
            enCharge++;
            Promise.resolve(p.page.charger()).then(function (blob) {
                if (etat.ferme) return;
                var u = URL.createObjectURL(blob);
                var img = new Image();
                img.decoding = 'async';
                img.alt = '';
                img.draggable = false;
                img.onload = function () {
                    var ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
                    var ancienne = p.el.getBoundingClientRect().height;
                    var hautAvant = p.el.getBoundingClientRect().top - defile.getBoundingClientRect().top;
                    p.el.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
                    p.el.appendChild(img);
                    p.el.classList.add('wf-wt-prete');
                    var nouvelle = p.el.getBoundingClientRect().height;
                    // Garde la lecture immobile si une image AU-DESSUS change de taille
                    if (hautAvant + ancienne <= 1 && nouvelle !== ancienne) defile.scrollTop += nouvelle - ancienne;
                    p.ratio = ratio;
                    if (!p.connu) {
                        p.connu = true;
                        p.fichier.ratios[p.k] = +ratio.toFixed(4);
                        clearTimeout(p.fichier.minDims);
                        p.fichier.minDims = setTimeout(function () { ecrireJson('wf-dims-' + p.fichier.item.Id, p.fichier.ratios); }, 2000);
                    }
                    if (attenteRestauration && attenteRestauration()) attenteRestauration = null;
                };
                img.src = u;
                p.url = u;
                p.etat = 'pret';
            }).catch(function () {
                p.etat = 'erreur';
                p.el.classList.add('wf-wt-erreur');
            }).then(function () {
                enCharge--;
                pomper();
            });
        }

        // Où en est-on ? (image sous la ligne de lecture + décalage à l'intérieur)
        function ligne() { return defile.scrollTop + defile.clientHeight * 0.12; }
        function indexCourant() {
            var y = ligne();
            var bas = 0, haut = pages.length - 1, res = 0;
            while (bas <= haut) {
                var mil = (bas + haut) >> 1;
                if (pages[mil].el.offsetTop <= y) { res = mil; bas = mil + 1; } else haut = mil - 1;
            }
            return res;
        }
        function positionCourante() {
            var n = indexCourant();
            var p = pages[n];
            if (!p) return null;
            var h = p.el.offsetHeight || 1;
            return { n: n, p: p, o: borne((ligne() - p.el.offsetTop) / h, 0, 1) };
        }
        function allerA(n, o) {
            var p = pages[borne(n, 0, pages.length - 1)];
            if (!p) return;
            defile.scrollTop = p.el.offsetTop + (o || 0) * p.el.offsetHeight - defile.clientHeight * 0.12;
        }

        // Restauration précise : on se replace, puis on corrige tant que les images voisines se chargent
        var attenteRestauration = null;
        function restaurer(n, o) {
            var essais = 0;
            allerA(n, o);
            attenteRestauration = function () {
                allerA(n, o);
                essais++;
                var p = pages[n];
                return essais > 6 || (p && p.connu && (!pages[n - 1] || pages[n - 1].connu));
            };
            defile.addEventListener('pointerdown', function () { attenteRestauration = null; }, { once: true });
            defile.addEventListener('wheel', function () { attenteRestauration = null; }, { once: true, passive: true });
        }

        // Fichier courant, sauvegarde, enchaînement
        var fichierActif = null;
        var dernierY = 0;
        var liste = null;
        var chargementSuivant = null;

        function majProgression() {
            var pc = positionCourante();
            if (!pc) return;
            var f = pc.p.fichier;
            var local = pc.n - f.debut;
            var total = f.fin - f.debut;
            var fraction = (local + pc.o) / total;
            if (fichierActif !== f) {
                if (fichierActif && fichiers.indexOf(fichierActif) < fichiers.indexOf(f)) {
                    // Chapitre précédent terminé
                    Position.ecrire(fichierActif.item.Id, { t: 'images', i: fichierActif.fin - fichierActif.debut - 1, o: 1, n: fichierActif.fin - fichierActif.debut, fini: true });
                    etatJellyfin(fichierActif.item.Id, 1, 0, true, true);
                }
                fichierActif = f;
                coque.querySelector('.wf-lect-titre').textContent = f.item.Name;
            }
            etat.curseur(fraction);
            etat.chapitre(pc.p.page.chapitre || '');
            etat.infos('Image ' + (local + 1) + ' / ' + total, Math.round(fraction * 100) + ' %');
            var fini = local >= total - 1 && pc.o > 0.85;
            Position.ecrire(f.item.Id, { t: 'images', i: local, o: +pc.o.toFixed(4), n: total, fini: fini });
            etatJellyfin(f.item.Id, fraction, local * 10000, fini);
            // Prépare le fichier suivant à l'approche de la fin
            if (total - local < 8 && f === fichiers[fichiers.length - 1]) preparerSuivant(f);
        }

        function preparerSuivant(f) {
            if (chargementSuivant) return;
            chargementSuivant = (liste ? Promise.resolve(liste) : voisins(f.item).then(function (l) { liste = l; return l; })).then(function (l) {
                var k = -1;
                for (var i = 0; i < l.length; i++) if (l[i].Id === f.item.Id) k = i;
                var suivant = k >= 0 ? l[k + 1] : null;
                if (!suivant || genre(suivant) !== 'images') return null;
                return ouvrirArchive(suivant).then(function (src) {
                    if (etat.ferme) { src.fermer(); return null; }
                    ajouterFichier(suivant, src);
                    return suivant;
                });
            }).catch(function () { return null; }).then(function (x) {
                if (!x) {
                    var fin = document.createElement('div');
                    fin.className = 'wf-wt-fin';
                    fin.innerHTML = '<span class="material-icons auto_stories" aria-hidden="true"></span><strong>Tu es à jour !</strong><span>Plus de chapitre dans ce dossier pour l\'instant.</span>';
                    if (!bande.querySelector('.wf-wt-fin')) bande.appendChild(fin);
                } else {
                    chargementSuivant = null;
                }
            });
        }

        var rafDefile = 0;
        defile.addEventListener('scroll', function () {
            if (rafDefile) return;
            rafDefile = requestAnimationFrame(function () {
                rafDefile = 0;
                var y = defile.scrollTop;
                // Comme les applis webtoon : on cache l'interface en descendant, on la montre en remontant
                if (y > dernierY + 6 && !autoActif) etat.cacherUi();
                else if (y < dernierY - 40) etat.montrerUi();
                dernierY = y;
                majProgression();
                planifierChargements();
            });
        }, { passive: true });

        // Toucher : un tap au centre montre/cache l'interface
        var depart = null;
        defile.addEventListener('pointerdown', function (e) { depart = { x: e.clientX, y: e.clientY, t: Date.now() }; arreterAuto(); });
        defile.addEventListener('pointerup', function (e) {
            if (!depart) return;
            var bouge = Math.abs(e.clientX - depart.x) + Math.abs(e.clientY - depart.y);
            if (bouge < 8 && Date.now() - depart.t < 350) etat.basculerUi();
            depart = null;
        });

        // Défilement doux au clavier
        var animation = null;
        function defilerDe(dy) {
            arreterAuto();
            var debut = defile.scrollTop;
            var cible = borne(debut + dy, 0, defile.scrollHeight);
            var t0 = performance.now();
            cancelAnimationFrame(animation);
            (function pas(t) {
                var x = Math.min(1, (t - t0) / 260);
                var e = 1 - Math.pow(1 - x, 3);
                defile.scrollTop = debut + (cible - debut) * e;
                if (x < 1) animation = requestAnimationFrame(pas);
            })(t0);
        }
        etat.surCle = function (e) {
            var h = defile.clientHeight;
            switch (e.key) {
                case 'ArrowDown': defilerDe(h * 0.2); return;
                case 'ArrowUp': defilerDe(-h * 0.2); return;
                case 'PageDown': case ' ': defilerDe((e.shiftKey ? -1 : 1) * h * 0.85); return;
                case 'PageUp': defilerDe(-h * 0.85); return;
                case 'Home': defile.scrollTop = 0; return;
                case 'End': defile.scrollTop = defile.scrollHeight; return;
                case 'a': case 'A': etat.surAuto(); return;
                default: return false;
            }
        };

        // Défilement automatique
        var autoActif = false;
        var autoRaf = 0;
        var autoT = 0;
        var reste = 0;
        function boucleAuto(t) {
            if (!autoActif) return;
            var dt = autoT ? (t - autoT) / 1000 : 0;
            autoT = t;
            reste += r.vitesse * dt;
            var px = Math.floor(reste);
            if (px >= 1) { defile.scrollTop += px; reste -= px; }
            autoRaf = requestAnimationFrame(boucleAuto);
        }
        function arreterAuto() {
            if (!autoActif) return;
            autoActif = false;
            cancelAnimationFrame(autoRaf);
            var b = coque.querySelector('[data-act="auto"] .material-icons');
            b.className = 'material-icons ' + ICONES.auto;
            b.textContent = '';
        }
        etat.surAuto = function () {
            if (autoActif) { arreterAuto(); return; }
            autoActif = true;
            autoT = 0;
            reste = 0;
            var b = coque.querySelector('[data-act="auto"] .material-icons');
            b.className = 'material-icons ' + ICONES.pause;
            etat.cacherUi();
            autoRaf = requestAnimationFrame(boucleAuto);
        };

        etat.surCurseur = function (f) {
            var fa = fichierActif || fichiers[0];
            var total = fa.fin - fa.debut;
            var x = f * total;
            allerA(fa.debut + Math.min(total - 1, Math.floor(x)), x - Math.floor(x));
        };
        etat.avantFermeture = function () {
            arreterAuto();
            observateur.disconnect();
            pages.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); });
            fichiers.forEach(function (f) { try { f.source.fermer(); } catch (e) { /* rien */ } });
            var f = fichierActif || fichiers[0];
            var l = f && lireJson(Position.cle(f.item.Id), null);
            if (l) etatJellyfin(f.item.Id, (l.i + l.o) / Math.max(1, l.n), l.i * 10000, !!l.fini, true);
        };

        etat.panneaux.sommaire = function (corps) {
            var f = fichierActif || fichiers[0];
            var chapitres = [];
            for (var n = f.debut; n < f.fin; n++) {
                var c = pages[n].page.chapitre;
                if (c && (!chapitres.length || chapitres[chapitres.length - 1].c !== c)) chapitres.push({ c: c, n: n });
            }
            corps.innerHTML = '<p class="wf-lect-aide">' + esc(f.item.Name) + '</p>' +
                (chapitres.length > 1 ? '<ol class="wf-lect-toc">' + chapitres.map(function (x) {
                    return '<li><button type="button" data-n="' + x.n + '">' + esc(x.c) + '</button></li>';
                }).join('') + '</ol>' : '<p class="wf-vide">Un seul chapitre dans ce fichier.</p>') +
                '<div class="wf-lect-voisins"></div>' +
                '<button type="button" class="wf-btn wf-btn-sec wf-lect-recommencer"><span class="material-icons restart_alt" aria-hidden="true"></span> Revenir au début du chapitre</button>';
            corps.querySelectorAll('[data-n]').forEach(function (b) {
                b.addEventListener('click', function () { allerA(+b.getAttribute('data-n'), 0); etat.ouvrirPanneau(''); });
            });
            corps.querySelector('.wf-lect-recommencer').addEventListener('click', function () { allerA(f.debut, 0); etat.ouvrirPanneau(''); });
            listeChapitresFichiers(corps.querySelector('.wf-lect-voisins'), f.item, etat, 'webtoon');
        };
        etat.panneaux.reglages = function (corps) {
            var pct = function (v) { return v + ' %'; };
            corps.innerHTML =
                '<h3>Mode de lecture</h3>' + radio('mode', 'webtoon', [['webtoon', 'Webtoon (défilement)'], ['pages', 'Pages (manga / BD)']]) +
                '<h3>Largeur des images</h3>' + glissiere('largeur', r.largeur, 40, 100, 5, pct) +
                '<h3>Espace entre les images</h3>' + radio('espace', r.espace, [[0, 'Aucun'], [6, 'Fin'], [24, 'Large']]) +
                '<h3>Fond</h3>' + radio('fond', r.fond, [['noir', 'Noir'], ['gris', 'Gris'], ['blanc', 'Blanc']]) +
                '<h3>Vitesse du défilement automatique</h3>' + glissiere('vitesse', r.vitesse, 15, 400, 5, function (v) { return v + ' px/s'; }) +
                '<h3>Luminosité</h3>' + glissiere('luminosite', r.luminosite, 30, 100, 1, pct);
            var choixMode = corps.querySelector('[data-reglage="mode"]');
            choixMode.removeAttribute('data-reglage');
            choixMode.addEventListener('click', function (e) {
                var b = e.target.closest('[data-valeur]');
                if (b && b.getAttribute('data-valeur') !== 'webtoon') changerMode(etat, b.getAttribute('data-valeur'));
            });
            var pos0 = positionCourante();
            lierReglages(corps, r, function () {
                appliquer();
                if (pos0) allerA(pos0.n, pos0.o);
            }, { largeur: pct, luminosite: pct, vitesse: function (v) { return v + ' px/s'; } });
        };

        ajouterFichier(etat.item, source);
        etat.attente(false);
        fichierActif = fichiers[0];
        if (pos && pos.t === 'images' && typeof pos.i === 'number') {
            restaurer(Math.min(pos.i, source.pages.length - 1), pos.o || 0);
            toast('Reprise de ta lecture');
        }
        defile.focus({ preventScroll: true });
        planifierChargements();
        setTimeout(majProgression, 50);
    }

    /* ----- Mode PAGES : manga / BD ----- */
    async function modePages(etat, source, pos) {
        var r = reglages.images;
        var choix = etat.choixSerie;
        var sens = choix.sens || r.sens;
        var coque = etat.coque;
        coque.setAttribute('data-mode', 'pages');
        coque.setAttribute('data-fond', r.fond);
        var scene = etat.scene;
        var cadre = document.createElement('div');
        cadre.className = 'wf-pg';
        scene.appendChild(cadre);
        var pages = source.pages.map(function (p) { return { page: p, url: null, ratio: null, promesse: null }; });
        var planches = [];
        var indexPlanche = 0;

        function doubleActif() {
            var d = choix.double || r.double;
            if (d === 'non') return false;
            if (d === 'oui') return true;
            return scene.clientWidth > scene.clientHeight * 1.15;
        }
        function construirePlanches() {
            planches = [];
            var dbl = doubleActif();
            for (var i = 0; i < pages.length; i++) {
                var large = pages[i].ratio && pages[i].ratio < 1;
                if (!dbl || i === 0 || large || i === pages.length - 1 || (pages[i + 1] && pages[i + 1].ratio && pages[i + 1].ratio < 1)) planches.push([i]);
                else { planches.push([i, i + 1]); i++; }
            }
        }
        function plancheDe(n) {
            for (var i = 0; i < planches.length; i++) if (planches[i].indexOf(n) !== -1) return i;
            return 0;
        }
        function chargerPage(n) {
            var p = pages[n];
            if (!p) return Promise.resolve(null);
            if (!p.promesse) {
                p.promesse = Promise.resolve(p.page.charger()).then(function (blob) {
                    p.url = URL.createObjectURL(blob);
                    return dimensions(blob).then(function (d) { p.ratio = d.h / Math.max(1, d.l); return p; });
                }).catch(function () { p.promesse = null; return null; });
            }
            return p.promesse;
        }
        function liberer() {
            var garde = planches[indexPlanche] || [];
            pages.forEach(function (p, n) {
                if (p.url && Math.abs(n - (garde[0] || 0)) > 12) {
                    URL.revokeObjectURL(p.url);
                    p.url = null;
                    p.promesse = null;
                }
            });
        }
        var sensAnim = 0;
        function afficher() {
            var pl = planches[indexPlanche] || [0];
            Promise.all(pl.map(chargerPage)).then(function (ps) {
                var ordre = sens === 'rtl' ? ps.slice().reverse() : ps;
                var div = document.createElement('div');
                div.className = 'wf-pg-planche' + (ps.length > 1 ? ' wf-pg-double' : '') + (r.ajustement === 'largeur' ? ' wf-pg-largeur' : '');
                div.innerHTML = ordre.filter(Boolean).map(function (p) { return '<img src="' + p.url + '" alt="" draggable="false">'; }).join('');
                if (sensAnim) div.classList.add(sensAnim > 0 ? 'wf-pg-entree-d' : 'wf-pg-entree-g');
                cadre.replaceChildren(div);
                sensAnim = 0;
                cadre.scrollTop = 0;
                // Préchargement des planches voisines
                [1, 2, -1].forEach(function (d) { (planches[indexPlanche + d] || []).forEach(chargerPage); });
                liberer();
            });
            var n = pl[0];
            var fraction = pages.length > 1 ? (pl[pl.length - 1]) / (pages.length - 1) : 1;
            etat.curseur(fraction);
            etat.chapitre(pages[n].page.chapitre || '');
            etat.infos('Page ' + (pl.map(function (x) { return x + 1; }).join('-')) + ' / ' + pages.length, Math.round(fraction * 100) + ' %');
            var fini = pl[pl.length - 1] >= pages.length - 1;
            Position.ecrire(etat.item.Id, { t: 'images', i: n, o: 0, n: pages.length, fini: fini });
            etatJellyfin(etat.item.Id, fraction, n * 10000, fini);
            if (fini) finDeVolume();
        }
        function aller(delta) {
            var cible = indexPlanche + delta;
            if (cible < 0) return;
            if (cible >= planches.length) { finDeVolume(true); return; }
            sensAnim = delta;
            indexPlanche = cible;
            afficher();
        }
        function gauche() { aller(sens === 'rtl' ? 1 : -1); }
        function droite() { aller(sens === 'rtl' ? -1 : 1); }

        var bandeauFin = null;
        function finDeVolume(insister) {
            if (bandeauFin) { if (insister) bandeauFin.classList.add('wf-secoue'); return; }
            voisins(etat.item).then(function (l) {
                var k = -1;
                for (var i = 0; i < l.length; i++) if (l[i].Id === etat.item.Id) k = i;
                var suivant = k >= 0 ? l[k + 1] : null;
                bandeauFin = document.createElement('div');
                bandeauFin.className = 'wf-pg-fin';
                bandeauFin.innerHTML = suivant ? '<span>Terminé ! Suite : <strong>' + esc(suivant.Name) + '</strong></span><button type="button" class="wf-btn wf-btn-pri">Continuer <span class="material-icons arrow_forward" aria-hidden="true"></span></button>'
                    : '<span><strong>Terminé !</strong> Rien d\'autre dans ce dossier pour l\'instant.</span>';
                coque.appendChild(bandeauFin);
                var b = bandeauFin.querySelector('button');
                if (b) b.addEventListener('click', function () {
                    var serie = coque.querySelector('.wf-lect-sous').textContent;
                    etat.fermer();
                    setTimeout(function () { ouvrirLecteur(suivant, { serie: serie }); }, 320);
                });
            });
        }

        // Toucher / clic : bords = page, centre = interface ; glisser = page
        var depart = null;
        cadre.addEventListener('pointerdown', function (e) { depart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
        cadre.addEventListener('pointerup', function (e) {
            if (!depart) return;
            var dx = e.clientX - depart.x;
            var dy = e.clientY - depart.y;
            var rapide = Date.now() - depart.t < 600;
            depart = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && rapide) {
                if (dx < 0) droite(); else gauche();
                return;
            }
            if (Math.abs(dx) + Math.abs(dy) > 10) return;
            var x = e.clientX / window.innerWidth;
            if (x < 0.3) { gauche(); etat.cacherUi(); } else if (x > 0.7) { droite(); etat.cacherUi(); } else etat.basculerUi();
        });
        var derniereMolette = 0;
        cadre.addEventListener('wheel', function (e) {
            if (r.ajustement === 'largeur') {
                var finVert = cadre.scrollTop + cadre.clientHeight >= cadre.scrollHeight - 2;
                var debutVert = cadre.scrollTop <= 0;
                if ((e.deltaY > 0 && !finVert) || (e.deltaY < 0 && !debutVert)) return;
            }
            var t = Date.now();
            if (t - derniereMolette < 300 || Math.abs(e.deltaY) < 8) return;
            derniereMolette = t;
            aller(e.deltaY > 0 ? 1 : -1);
        }, { passive: true });
        etat.surCle = function (e) {
            switch (e.key) {
                case 'ArrowLeft': gauche(); return;
                case 'ArrowRight': droite(); return;
                case 'PageDown': case ' ': aller(e.shiftKey ? -1 : 1); return;
                case 'PageUp': aller(-1); return;
                case 'ArrowDown': if (r.ajustement === 'largeur') { cadre.scrollTop += cadre.clientHeight * 0.3; return; } aller(1); return;
                case 'ArrowUp': if (r.ajustement === 'largeur') { cadre.scrollTop -= cadre.clientHeight * 0.3; return; } aller(-1); return;
                case 'Home': indexPlanche = 0; afficher(); return;
                case 'End': indexPlanche = planches.length - 1; afficher(); return;
                default: return false;
            }
        };
        etat.surCurseur = function (f, fin) {
            var n = Math.round(f * (pages.length - 1));
            etat.infos('Page ' + (n + 1) + ' / ' + pages.length, Math.round(f * 100) + ' %');
            if (fin) { indexPlanche = plancheDe(n); afficher(); }
        };
        var minRedim = null;
        etat.surRedim = function () {
            clearTimeout(minRedim);
            minRedim = setTimeout(function () {
                var n = (planches[indexPlanche] || [0])[0];
                construirePlanches();
                indexPlanche = plancheDe(n);
                afficher();
            }, 200);
        };
        window.addEventListener('resize', etat.surRedim);
        etat.avantFermeture = function () {
            window.removeEventListener('resize', etat.surRedim);
            pages.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); });
            try { source.fermer(); } catch (e) { /* rien */ }
            var l = lireJson(Position.cle(etat.item.Id), null);
            if (l) etatJellyfin(etat.item.Id, l.i / Math.max(1, l.n - 1), l.i * 10000, !!l.fini, true);
        };

        function appliquer() {
            coque.setAttribute('data-fond', r.fond);
            coque.setAttribute('data-sens', sens);
            etat.lumiere(r.luminosite);
            var n = (planches[indexPlanche] || [0])[0];
            construirePlanches();
            indexPlanche = plancheDe(n);
            afficher();
        }
        etat.panneaux.sommaire = function (corps) {
            var chapitres = [];
            pages.forEach(function (p, n) {
                var c = p.page.chapitre;
                if (c && (!chapitres.length || chapitres[chapitres.length - 1].c !== c)) chapitres.push({ c: c, n: n });
            });
            corps.innerHTML = (chapitres.length > 1 ? '<ol class="wf-lect-toc">' + chapitres.map(function (x) {
                return '<li><button type="button" data-n="' + x.n + '">' + esc(x.c) + ' <small>p. ' + (x.n + 1) + '</small></button></li>';
            }).join('') + '</ol>' : '') +
                '<div class="wf-lect-vignettes">' + pages.map(function (p, n) {
                    return '<button type="button" data-n="' + n + '" class="wf-lect-vignette"><span>' + (n + 1) + '</span></button>';
                }).join('') + '</div>' +
                '<div class="wf-lect-voisins"></div>';
            corps.querySelectorAll('[data-n]').forEach(function (b) {
                b.addEventListener('click', function () { indexPlanche = plancheDe(+b.getAttribute('data-n')); afficher(); etat.ouvrirPanneau(''); });
            });
            // Miniatures chargées au fil de l'eau
            var obs = new IntersectionObserver(function (en) {
                en.forEach(function (x) {
                    if (!x.isIntersecting) return;
                    obs.unobserve(x.target);
                    chargerPage(+x.target.getAttribute('data-n')).then(function (p) {
                        if (p && p.url) x.target.style.backgroundImage = 'url("' + p.url + '")';
                    });
                });
            }, { root: corps, rootMargin: '200px' });
            corps.querySelectorAll('.wf-lect-vignette').forEach(function (v) { obs.observe(v); });
            listeChapitresFichiers(corps.querySelector('.wf-lect-voisins'), etat.item, etat, 'pages');
        };
        etat.panneaux.reglages = function (corps) {
            var pct = function (v) { return v + ' %'; };
            corps.innerHTML =
                '<h3>Mode de lecture</h3>' + radio('mode', 'pages', [['pages', 'Pages (manga / BD)'], ['webtoon', 'Webtoon (défilement)']]) +
                '<h3>Sens de lecture (cette série)</h3>' + radio('sens', sens, [['ltr', 'Gauche → droite'], ['rtl', 'Droite → gauche (manga)']]) +
                '<h3>Double page (cette série)</h3>' + radio('double', choix.double || r.double, [['auto', 'Auto'], ['non', 'Jamais'], ['oui', 'Toujours']]) +
                '<h3>Ajustement</h3>' + radio('ajustement', r.ajustement, [['ecran', 'Page entière'], ['largeur', 'Largeur']]) +
                '<h3>Fond</h3>' + radio('fond', r.fond, [['noir', 'Noir'], ['gris', 'Gris'], ['blanc', 'Blanc']]) +
                '<h3>Luminosité</h3>' + glissiere('luminosite', r.luminosite, 30, 100, 1, pct);
            var choixMode = corps.querySelector('[data-reglage="mode"]');
            choixMode.removeAttribute('data-reglage');
            choixMode.addEventListener('click', function (e) {
                var b = e.target.closest('[data-valeur]');
                if (b && b.getAttribute('data-valeur') !== 'pages') changerMode(etat, b.getAttribute('data-valeur'));
            });
            // Sens et double page : réglages propres à la série
            ['sens', 'double'].forEach(function (nom) {
                var g = corps.querySelector('[data-reglage="' + nom + '"]');
                g.removeAttribute('data-reglage');
                g.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-valeur]');
                    if (!b) return;
                    g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
                    choix[nom] = b.getAttribute('data-valeur');
                    if (nom === 'sens') sens = choix.sens;
                    reglages.series[etat.serie] = Object.assign({}, reglages.series[etat.serie] || {}, choix);
                    sauverReglages();
                    appliquer();
                });
            });
            lierReglages(corps, r, appliquer, { luminosite: pct });
        };

        // Départ : dimensions de la première page pour composer les planches
        await chargerPage(0);
        if (pos && pos.t === 'images' && typeof pos.i === 'number') await chargerPage(Math.min(pos.i, pages.length - 1));
        construirePlanches();
        indexPlanche = pos && pos.t === 'images' && typeof pos.i === 'number' ? plancheDe(Math.min(pos.i, pages.length - 1)) : 0;
        etat.attente(false);
        coque.setAttribute('data-sens', sens);
        etat.lumiere(r.luminosite);
        afficher();
        if (pos && pos.i) toast('Reprise de ta lecture');
    }

    // Liste des autres fichiers du dossier (chapitres / tomes) dans le sommaire
    function listeChapitresFichiers(zone, item, etat, mode) {
        if (!zone) return;
        voisins(item).then(function (l) {
            if (l.length < 2) return;
            zone.innerHTML = '<h3>Dans ce dossier</h3><ol class="wf-lect-toc">' + l.map(function (x) {
                var actif = x.Id === item.Id;
                var vu = x.UserData && x.UserData.Played;
                return '<li><button type="button" data-id="' + x.Id + '"' + (actif ? ' class="wf-actif"' : '') + '>' + esc(x.Name) +
                    (vu ? ' <span class="material-icons check" aria-label="lu"></span>' : '') + '</button></li>';
            }).join('') + '</ol>';
            zone.querySelectorAll('[data-id]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var cible = l.filter(function (x) { return x.Id === b.getAttribute('data-id'); })[0];
                    if (!cible || cible.Id === item.Id) { etat.ouvrirPanneau(''); return; }
                    var serie = etat.coque.querySelector('.wf-lect-sous').textContent;
                    etat.fermer();
                    setTimeout(function () { ouvrirLecteur(cible, { serie: serie, mode: mode }); }, 320);
                });
            });
            // Pas de scrollIntoView : il ferait glisser tout le lecteur pendant l'animation du panneau
            var a = zone.querySelector('.wf-actif');
            var corps = zone.closest('.wf-lect-panneau-corps');
            if (a && corps) corps.scrollTop = Math.max(0, a.offsetTop - corps.clientHeight / 2);
        });
    }

    /* ================= Ouverture depuis Jellyfin ================= */
    function ouvrirParId(id, options) {
        if (!api()) return Promise.resolve(false);
        return element(id).then(function (item) {
            if (!item || item.Type !== 'Book' || !genre(item)) return false;
            var serie = '';
            var p = item.ParentId ? json('Items/' + item.ParentId, { userId: uid() }).then(function (x) {
                // Le nom du dossier sert de sur-titre (série), sauf si c'est la racine de la bibliothèque
                serie = x && x.Type === 'Folder' && x.ParentId && !x.IsRoot ? x.Name : '';
                if (x && x.Type === 'Folder' && x.ParentId) {
                    return json('Items/' + x.ParentId, { userId: uid() }).then(function (gp) {
                        if (gp && (gp.Type === 'CollectionFolder' || gp.Type === 'UserRootFolder' || gp.Type === 'AggregateFolder') && /^(livres?|books?)$/i.test(x.Name)) serie = '';
                    }).catch(function () { /* rien */ });
                }
            }).catch(function () { /* rien */ }) : Promise.resolve();
            return p.then(function () {
                return ouvrirLecteur(item, Object.assign({ serie: serie }, options || {}));
            });
        });
    }

    var passeNatif = false;
    function ouvrirNatif(id) {
        // Repli : on relance le bouton de Jellyfin sans l'intercepter
        passeNatif = true;
        var b = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons .btnPlay, #itemDetailPage:not(.hide) .mainDetailButtons .btnResume');
        if (b) b.click();
        else toast('Ouvre la fiche du livre puis utilise « Lire » pour le lecteur Jellyfin.');
        setTimeout(function () { passeNatif = false; }, 500);
        void id;
    }

    // Types connus des fiches ouvertes (pour décider tout de suite au clic)
    var typesFiches = {};
    function memoriserFiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || typesFiches[m[1]] || !api()) return;
        typesFiches[m[1]] = 'en-cours';
        var p = window.WolfFlix && window.WolfFlix.element ? window.WolfFlix.element(m[1]) : api().getItem(uid(), m[1]);
        p.then(function (it) { typesFiches[m[1]] = it.Type; }).catch(function () { delete typesFiches[m[1]]; });
    }

    document.addEventListener('click', function (e) {
        if (passeNatif || !e.target.closest || !api()) return;
        // 1. Boutons Lire / Reprendre de la fiche d'un livre
        var b = e.target.closest('.mainDetailButtons .btnPlay, .mainDetailButtons .btnResume, .mainDetailButtons .btnReplay');
        if (b) {
            var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
            if (m && typesFiches[m[1]] === 'Book') {
                e.preventDefault();
                e.stopImmediatePropagation();
                ouvrirParId(m[1], { depuisDebut: b.classList.contains('btnReplay') }).then(function (ok) { if (!ok) ouvrirNatif(m[1]); });
            }
            return;
        }
        // 2. Bouton lecture d'une carte de livre (accueil, bibliothèque, « Continuer la lecture »)
        var bc = e.target.closest('[data-action="play"], [data-action="resume"], [data-action="playallfromhere"]');
        var carte = bc && bc.closest('[data-type="Book"][data-id]');
        if (carte) {
            e.preventDefault();
            e.stopImmediatePropagation();
            ouvrirParId(carte.getAttribute('data-id')).then(function (ok) {
                if (!ok) location.hash = '#/details?id=' + carte.getAttribute('data-id');
            });
        }
    }, true);

    window.WolfFlix = window.WolfFlix || {};
    window.WolfFlix.lire = function (id, options) { return ouvrirParId(id, options); };

    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(memoriserFiche);
    else new MutationObserver(memoriserFiche).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', memoriserFiche);
    memoriserFiche();
    void config;
})();
