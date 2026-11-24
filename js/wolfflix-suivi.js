/* WolfFlix — page « Mon suivi » (#/home?wf=suivi), personnelle à chaque utilisateur.
   Données : extension WolfFlix (chaque film, épisode, livre, chapitre, livre audio terminé, avec sa date).
     · Historique : par année, mois ou semaine, avec les totaux de la période ;
     · Progression : séries en cours, sagas et cycles, dossiers de livres entamés ;
     · Objectifs : jauges de l'année + jauge automatique du rythme réel ;
     · Bilan : image PNG à télécharger. */
(function () {
    'use strict';
    if (window.__wfSuivi) return;
    window.__wfSuivi = true;

    var html = document.documentElement;
    var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var TYPES = {
        film: { icone: 'movie', un: 'film', plusieurs: 'films' },
        episode: { icone: 'tv', un: 'épisode', plusieurs: 'épisodes' },
        livre: { icone: 'menu_book', un: 'livre', plusieurs: 'livres' },
        chapitre: { icone: 'auto_stories', un: 'chapitre', plusieurs: 'chapitres' },
        audio: { icone: 'headphones', un: 'livre audio', plusieurs: 'livres audio' }
    };
    var OBJECTIFS = [
        { cle: 'Films', texte: 'Films', compte: function (s) { return s.film; } },
        { cle: 'Episodes', texte: 'Épisodes', compte: function (s) { return s.episode; } },
        { cle: 'Livres', texte: 'Livres (lus ou écoutés)', compte: function (s) { return s.livre + s.audio; } },
        { cle: 'Chapitres', texte: 'Chapitres de webtoons', compte: function (s) { return s.chapitre; } },
        { cle: 'Heures', texte: 'Heures de visionnage et d’écoute', compte: function (s) { return Math.round(s.minutes / 60); } }
    ];

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
    function hautEntete() {
        var barre = document.querySelector('.MuiAppBar-root');
        return (barre ? Math.round(barre.getBoundingClientRect().bottom) : 64) + 'px';
    }
    function lien(id) {
        var a = api();
        return '#/details?id=' + id + (a && a.serverId ? '&serverId=' + a.serverId() : '');
    }
    function majuscule(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
    function pluriel(n, t) { return n + ' ' + (n > 1 ? TYPES[t].plusieurs : TYPES[t].un); }
    function nombre(n) { return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 }); }

    /* ---------- Périodes ---------- */
    function jour(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function lundi(d) {
        var j = jour(d);
        j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
        return j;
    }
    function semaineIso(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
        var debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return Math.ceil(((t - debut) / 86400000 + 1) / 7);
    }
    function periode(vue, ref) {
        var debut, fin, titre;
        if (vue === 'annee') {
            debut = new Date(ref.getFullYear(), 0, 1);
            fin = new Date(ref.getFullYear() + 1, 0, 1);
            titre = String(ref.getFullYear());
        } else if (vue === 'mois') {
            debut = new Date(ref.getFullYear(), ref.getMonth(), 1);
            fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
            titre = majuscule(MOIS[ref.getMonth()]) + ' ' + ref.getFullYear();
        } else {
            debut = lundi(ref);
            fin = new Date(debut);
            fin.setDate(fin.getDate() + 7);
            var dim = new Date(fin);
            dim.setDate(dim.getDate() - 1);
            titre = 'Semaine ' + semaineIso(debut) + ' · ' + debut.getDate() + ' ' + MOIS[debut.getMonth()] + ' – ' + dim.getDate() + ' ' + MOIS[dim.getMonth()] + ' ' + dim.getFullYear();
        }
        return { debut: debut, fin: fin, titre: titre };
    }
    function decaler(vue, ref, sens) {
        var d = new Date(ref);
        if (vue === 'annee') d.setFullYear(d.getFullYear() + sens);
        else if (vue === 'mois') d.setMonth(d.getMonth() + sens, 1);
        else d.setDate(d.getDate() + 7 * sens);
        return d;
    }

    /* ---------- Données ---------- */
    var etat = {
        onglet: 'historique', vue: 'mois', ref: new Date(), lectures: null, objectifs: {},
        main: lireOption('main', true), importees: lireOption('import', true)
    };
    function lireOption(nom, defaut) {
        try {
            var v = localStorage.getItem('wf-suivi-' + nom);
            return v === null ? defaut : v === '1';
        } catch (e) { return defaut; }
    }
    function ecrireOption(nom, v) {
        try { localStorage.setItem('wf-suivi-' + nom, v ? '1' : '0'); } catch (e) { /* rien */ }
    }
    function retenues() {
        return (etat.lectures || []).filter(function (l) {
            if (l.o === 'main' && !etat.main) return false;
            if (l.o === 'import' && !etat.importees) return false;
            return true;
        });
    }
    function dans(liste, p) {
        return liste.filter(function (l) { return l.date >= p.debut && l.date < p.fin; });
    }
    function stats(liste) {
        var s = { film: 0, episode: 0, livre: 0, chapitre: 0, audio: 0, minutes: 0, total: liste.length };
        liste.forEach(function (l) {
            if (s[l.t] !== undefined) s[l.t]++;
            s.minutes += l.m || 0;
        });
        return s;
    }
    function heures(min) {
        var h = Math.floor(min / 60);
        return h ? h + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') : '') : (min % 60) + ' min';
    }

    /* ---------- Historique ---------- */
    function blocStats(s) {
        var cases = [
            ['movie', s.film, s.film > 1 ? 'films' : 'film'],
            ['tv', s.episode, s.episode > 1 ? 'épisodes' : 'épisode'],
            ['schedule', heures(s.minutes), 'devant l’écran ou à l’écoute'],
            ['menu_book', s.livre, s.livre > 1 ? 'livres' : 'livre'],
            ['auto_stories', s.chapitre, s.chapitre > 1 ? 'chapitres' : 'chapitre'],
            ['headphones', s.audio, s.audio > 1 ? 'livres audio' : 'livre audio']
        ];
        return '<div class="wf-su-stats">' + cases.map(function (c) {
            return '<div class="wf-su-stat"><span class="material-icons ' + c[0] + '" aria-hidden="true"></span><b>' + c[1] + '</b><span>' + c[2] + '</span></div>';
        }).join('') + '</div>';
    }
    // Les épisodes d'une même série (ou chapitres d'un même webtoon) le même jour sont réunis
    function regrouper(liste) {
        var res = [], parCle = {};
        liste.forEach(function (l) {
            if ((l.t === 'episode' || l.t === 'chapitre') && l.p) {
                var cle = l.t + l.p + l.date.toDateString();
                if (parCle[cle]) { parCle[cle].l.push(l); return; }
                parCle[cle] = { l: [l] };
                res.push(parCle[cle]);
                return;
            }
            res.push({ l: [l] });
        });
        return res;
    }
    function ligne(g) {
        var l = g.l[0];
        var heure = l.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var titre, sous;
        if (g.l.length > 1) {
            titre = '<a href="' + lien(l.p) + '">' + esc(l.s) + '</a>';
            var x = g.l.map(function (y) { return y.x; }).filter(Boolean).sort();
            sous = pluriel(g.l.length, l.t) + (x.length ? ' · ' + esc(x[0] + (x.length > 1 ? ' → ' + x[x.length - 1] : '')) : '');
        } else if (l.t === 'episode' || l.t === 'chapitre') {
            titre = '<a href="' + lien(l.i) + '">' + esc(l.n) + '</a>';
            sous = (l.s ? '<a href="' + lien(l.p) + '">' + esc(l.s) + '</a>' : '') + (l.x ? ' · ' + esc(l.x) : '');
        } else {
            titre = '<a href="' + lien(l.i) + '">' + esc(l.n) + '</a>';
            sous = majuscule(TYPES[l.t].un) + (l.s ? ' · ' + esc(l.s) : '') + (l.m ? ' · ' + heures(l.m) : '');
        }
        var marque = l.o === 'main' ? ' <span class="wf-su-marque" title="Marqué « vu » à la main">à la main</span>'
            : l.o === 'import' ? ' <span class="wf-su-marque" title="Repris de Jellyfin : date du dernier visionnage">repris</span>' : '';
        return '<li class="wf-su-ligne"><span class="material-icons ' + TYPES[l.t].icone + '" aria-hidden="true"></span>' +
            '<span class="wf-su-heure">' + heure + '</span>' +
            '<span class="wf-su-texte"><b>' + titre + '</b><small>' + sous + marque + '</small></span>' +
            (g.l.length === 1 ? '<button type="button" class="wf-su-retirer" data-i="' + esc(l.i) + '" data-d="' + esc(l.d) + '" aria-label="Retirer de l’historique" title="Retirer de l’historique"><span class="material-icons close"></span></button>' : '') +
            '</li>';
    }
    function historique(el) {
        var p = periode(etat.vue, etat.ref);
        var liste = dans(retenues(), p).sort(function (a, b) { return b.date - a.date; });
        var s = stats(liste);
        var out = '<div class="wf-su-nav">' +
            '<div class="wf-av-onglets">' + [['annee', 'Année'], ['mois', 'Mois'], ['semaine', 'Semaine']].map(function (v) {
                return '<button type="button" class="wf-btn' + (etat.vue === v[0] ? ' wf-btn-pri' : '') + '" data-vue="' + v[0] + '">' + v[1] + '</button>';
            }).join('') + '</div>' +
            '<div class="wf-su-periode"><button type="button" class="wf-fleche" data-sens="-1" aria-label="Période précédente"><span class="material-icons chevron_left"></span></button>' +
            '<b>' + esc(p.titre) + '</b>' +
            '<button type="button" class="wf-fleche" data-sens="1" aria-label="Période suivante"' + (p.fin > new Date() ? ' disabled' : '') + '><span class="material-icons chevron_right"></span></button></div></div>' +
            blocStats(s);
        if (!liste.length) {
            el.innerHTML = out + '<p class="wf-vide">Rien de terminé sur cette période.</p>';
            return;
        }
        // Année : par mois · Mois : par semaine · Semaine : par jour
        var groupes = [], parNom = {};
        liste.forEach(function (l) {
            var nom;
            if (etat.vue === 'annee') nom = majuscule(MOIS[l.date.getMonth()]);
            else if (etat.vue === 'mois') {
                var lu = lundi(l.date);
                var di = new Date(lu);
                di.setDate(di.getDate() + 6);
                nom = 'Semaine ' + semaineIso(lu) + ' · du ' + lu.getDate() + ' ' + MOIS[lu.getMonth()] + ' au ' + di.getDate() + ' ' + MOIS[di.getMonth()];
            } else nom = majuscule(JOURS[l.date.getDay()]) + ' ' + l.date.getDate() + ' ' + MOIS[l.date.getMonth()];
            if (!parNom[nom]) { parNom[nom] = { nom: nom, l: [] }; groupes.push(parNom[nom]); }
            parNom[nom].l.push(l);
        });
        out += groupes.map(function (g) {
            var sg = stats(g.l);
            var resume = ['film', 'episode', 'livre', 'chapitre', 'audio'].filter(function (t) { return sg[t]; })
                .map(function (t) { return pluriel(sg[t], t); }).join(' · ');
            return '<section class="wf-su-groupe"><h2>' + esc(g.nom) + ' <small>' + resume + '</small></h2><ul>' +
                regrouper(g.l).map(ligne).join('') + '</ul></section>';
        }).join('');
        el.innerHTML = out;
    }

    /* ---------- Progression ---------- */
    var progression = null;
    function barre(fait, total) {
        var pc = total ? Math.min(100, Math.round(fait / total * 100)) : 0;
        return '<div class="wf-su-barre"><span style="width:' + pc + '%"></span></div>' +
            '<small>' + fait + ' / ' + total + ' · ' + pc + ' %</small>';
    }
    function carteProgression(o) {
        return '<a class="wf-su-prog" href="' + lien(o.id) + '">' +
            '<span class="wf-su-prog-image"' + (o.image ? ' style="background-image:url(\'' + esc(o.image) + '\')"' : '') + '></span>' +
            '<span class="wf-su-prog-infos"><b>' + esc(o.nom) + '</b><span class="wf-su-prog-type">' + esc(o.type) + '</span>' + barre(o.fait, o.total) + '</span></a>';
    }
    function image(id, tag) {
        return tag ? api().getUrl('Items/' + id + '/Images/Primary', { tag: tag, maxHeight: 200, quality: 85 }) : '';
    }
    function chargerProgression() {
        if (progression) return progression;
        var series = json('Users/' + uid() + '/Items', {
            IncludeItemTypes: 'Series', Recursive: true, Fields: 'RecursiveItemCount', EnableUserData: true,
            SortBy: 'DatePlayed', SortOrder: 'Descending', ImageTypeLimit: 1, EnableImageTypes: 'Primary'
        }).then(function (r) {
            return (r.Items || []).map(function (s) {
                var total = s.RecursiveItemCount || 0;
                var reste = s.UserData && s.UserData.UnplayedItemCount != null ? s.UserData.UnplayedItemCount : total;
                return { id: s.Id, nom: s.Name, type: 'Série', fait: Math.max(0, total - reste), total: total, image: image(s.Id, s.ImageTags && s.ImageTags.Primary) };
            }).filter(function (o) { return o.total && o.fait > 0 && o.fait < o.total; });
        }).catch(function () { return []; });

        var collections = (window.WolfFlix && window.WolfFlix.collections ? window.WolfFlix.collections() : Promise.resolve([])).then(function (cols) {
            cols = (cols || []).filter(function (c) { return c.ids && c.ids.length; });
            var ids = [];
            cols.forEach(function (c) { c.ids.forEach(function (i) { if (ids.indexOf(i) === -1) ids.push(i); }); });
            var lots = [];
            for (var k = 0; k < ids.length; k += 150) lots.push(ids.slice(k, k + 150));
            return Promise.all(lots.map(function (l) {
                return json('Users/' + uid() + '/Items', { Ids: l.join(','), EnableUserData: true, EnableImages: false, Fields: 'RecursiveItemCount' })
                    .then(function (r) { return r.Items || []; }).catch(function () { return []; });
            })).then(function (res) {
                var vu = {};
                [].concat.apply([], res).forEach(function (i) { vu[i.Id] = !!(i.UserData && i.UserData.Played); });
                return cols.map(function (c) {
                    var fait = c.ids.filter(function (i) { return vu[i]; }).length;
                    return { id: c.id, nom: c.nom, type: c.type === 'c' ? 'Cycle' : 'Saga', fait: fait, total: c.ids.length, image: image(c.id, c.tag) };
                }).filter(function (o) { return o.fait > 0 && o.fait < o.total; });
            });
        }).catch(function () { return []; });

        // Dossiers de livres et webtoons entamés (vus dans l'historique)
        var dossiers = [];
        (etat.lectures || []).slice().reverse().forEach(function (l) {
            if ((l.t === 'livre' || l.t === 'chapitre' || l.t === 'audio') && l.p && dossiers.indexOf(l.p) === -1 && dossiers.length < 40) dossiers.push(l.p);
        });
        var livres = Promise.all(dossiers.map(function (p) {
            return json('Users/' + uid() + '/Items', { ParentId: p, IncludeItemTypes: 'Book,AudioBook', Recursive: true, EnableUserData: true, EnableImages: false })
                .then(function (r) {
                    var l = r.Items || [];
                    return { id: p, fait: l.filter(function (i) { return i.UserData && i.UserData.Played; }).length, total: l.length };
                }).catch(function () { return null; });
        })).then(function (res) {
            res = res.filter(function (o) { return o && o.total > 1 && o.fait < o.total; });
            if (!res.length) return [];
            return json('Users/' + uid() + '/Items', { Ids: res.map(function (o) { return o.id; }).join(','), ImageTypeLimit: 1, EnableImageTypes: 'Primary' }).then(function (r) {
                var info = {};
                (r.Items || []).forEach(function (i) { info[i.Id] = i; });
                return res.map(function (o) {
                    var i = info[o.id] || {};
                    o.nom = i.Name || 'Dossier';
                    o.type = 'Livres';
                    o.image = image(o.id, i.ImageTags && i.ImageTags.Primary);
                    return o;
                });
            });
        }).catch(function () { return []; });

        progression = Promise.all([series, collections, livres]);
        progression.catch(function () { progression = null; });
        return progression;
    }
    function vueProgression(el) {
        el.innerHTML = '<p class="wf-vide">Calcul de ta progression…</p>';
        chargerProgression().then(function (r) {
            if (!el.isConnected || etat.onglet !== 'progression') return;
            var parties = [['Séries en cours', r[0]], ['Sagas et cycles en cours', r[1]], ['Livres et webtoons en cours', r[2]]];
            el.innerHTML = parties.map(function (p) {
                return '<section class="wf-su-groupe"><h2>' + p[0] + ' <small>' + p[1].length + '</small></h2>' +
                    (p[1].length ? '<div class="wf-su-progs">' + p[1].map(carteProgression).join('') + '</div>' : '<p class="wf-vide">Rien en cours.</p>') +
                    '</section>';
            }).join('');
        });
    }

    /* ---------- Objectifs ---------- */
    function anneeEnCours() {
        var maintenant = new Date();
        var p = periode('annee', maintenant);
        var ecoule = Math.max(1, (maintenant - p.debut) / 86400000);
        var duree = (p.fin - p.debut) / 86400000;
        return { p: p, s: stats(dans(retenues(), p)), ecoule: ecoule, duree: duree };
    }
    function vueObjectifs(el) {
        var a = anneeEnCours();
        var o = etat.objectifs || {};
        el.innerHTML = '<p class="wf-su-aide">Objectifs pour ' + a.p.titre + '. La jauge « rythme » montre où tu arriveras le 31 décembre si tu continues comme depuis le 1er janvier.</p>' +
            '<div class="wf-su-jauges">' + OBJECTIFS.map(function (def) {
                var fait = def.compte(a.s);
                var projete = Math.round(fait / a.ecoule * a.duree);
                var but = o[def.cle] || 0;
                var pc = but ? Math.min(100, fait / but * 100) : 0;
                var pcRythme = but ? Math.min(100, projete / but * 100) : 0;
                var verdict = !but ? 'À ce rythme : ' + nombre(projete) + ' d’ici la fin de l’année'
                    : fait >= but ? 'Objectif atteint !'
                        : projete >= but ? 'En avance : ' + nombre(projete) + ' prévus fin décembre'
                            : 'En retard : ' + nombre(projete) + ' prévus fin décembre (il en faudrait ' + nombre(Math.ceil((but - fait) / Math.max(1, (a.duree - a.ecoule) / 7))) + ' par semaine)';
                return '<div class="wf-su-jauge' + (but && fait >= but ? ' wf-su-atteint' : '') + '">' +
                    '<div class="wf-su-jauge-tete"><b>' + def.texte + '</b><span>' + nombre(fait) + (but ? ' / ' + nombre(but) : '') + '</span></div>' +
                    '<div class="wf-su-barre wf-su-barre-grande"><span class="wf-su-rythme" style="width:' + (but ? pcRythme : 100) + '%"></span>' +
                    (but ? '<span style="width:' + pc + '%"></span>' : '') + '</div>' +
                    '<small>' + verdict + '</small>' +
                    '<label class="wf-su-but">Objectif <input type="number" min="0" step="1" data-cle="' + def.cle + '" value="' + (but || '') + '" placeholder="aucun"></label>' +
                    '</div>';
            }).join('') + '</div>' +
            '<button type="button" class="wf-btn wf-btn-pri wf-su-enregistrer"><span class="material-icons save" aria-hidden="true"></span> Enregistrer les objectifs</button>';
    }

    /* ---------- Bilan en image ---------- */
    function bilan() {
        var p = periode(etat.vue, etat.ref);
        var liste = dans(retenues(), p);
        var s = stats(liste);
        var c = document.createElement('canvas');
        c.width = 1080;
        c.height = 1350;
        var x = c.getContext('2d');
        var fond = x.createRadialGradient(540, -100, 50, 540, 300, 1100);
        fond.addColorStop(0, '#3a0d13');
        fond.addColorStop(1, '#0A0A0C');
        x.fillStyle = fond;
        x.fillRect(0, 0, 1080, 1350);
        x.strokeStyle = 'rgba(199,52,65,.6)';
        x.lineWidth = 3;
        x.strokeRect(40, 40, 1000, 1270);
        x.textAlign = 'center';
        x.fillStyle = '#C73441';
        x.font = '600 30px Georgia, serif';
        x.fillText('W O L F F L I X', 540, 120);
        x.fillStyle = '#E9E6E1';
        x.font = '72px Georgia, serif';
        x.fillText('Mon bilan', 540, 215);
        x.font = 'italic 38px Georgia, serif';
        x.fillStyle = '#A7B0BA';
        x.fillText(p.titre, 540, 270);
        var cases = [
            [s.film, s.film > 1 ? 'films' : 'film'], [s.episode, s.episode > 1 ? 'épisodes' : 'épisode'], [heures(s.minutes), 'à l’écran'],
            [s.livre, s.livre > 1 ? 'livres' : 'livre'], [s.chapitre, s.chapitre > 1 ? 'chapitres' : 'chapitre'], [s.audio, 'livres audio']
        ];
        cases.forEach(function (k, n) {
            var cx = 220 + (n % 3) * 320;
            var cy = 400 + Math.floor(n / 3) * 190;
            x.fillStyle = '#E9E6E1';
            x.font = 'bold 76px Georgia, serif';
            x.fillText(String(k[0]), cx, cy);
            x.fillStyle = '#A7B0BA';
            x.font = '30px Georgia, serif';
            x.fillText(k[1], cx, cy + 50);
        });
        // Séries les plus suivies et derniers films
        var parSerie = {};
        liste.forEach(function (l) { if (l.t === 'episode' && l.s) parSerie[l.s] = (parSerie[l.s] || 0) + 1; });
        var series = Object.keys(parSerie).sort(function (a, b) { return parSerie[b] - parSerie[a]; }).slice(0, 5);
        var films = liste.filter(function (l) { return l.t === 'film'; }).sort(function (a, b) { return b.date - a.date; }).slice(0, 5);
        function colonne(titre, lignes, cx) {
            x.textAlign = 'left';
            x.fillStyle = '#C73441';
            x.font = '600 32px Georgia, serif';
            x.fillText(titre, cx, 830);
            x.fillStyle = '#E9E6E1';
            x.font = '28px Georgia, serif';
            if (!lignes.length) {
                x.fillStyle = '#6b7178';
                x.fillText('—', cx, 885);
            }
            lignes.forEach(function (t, n) {
                var texte = t;
                while (x.measureText(texte).width > 420 && texte.length > 3) texte = texte.slice(0, -2);
                if (texte !== t) texte = texte.trim() + '…';
                x.fillText(texte, cx, 885 + n * 52);
            });
        }
        colonne('Séries les plus suivies', series.map(function (t) { return t + ' (' + parSerie[t] + ')'; }), 90);
        colonne('Derniers films', films.map(function (l) { return l.n; }), 580);
        x.textAlign = 'center';
        x.fillStyle = '#6b7178';
        x.font = 'italic 24px Georgia, serif';
        x.fillText('Généré le ' + new Date().toLocaleDateString('fr-FR'), 540, 1270);
        c.toBlob(function (b) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'wolfflix-bilan-' + p.titre.replace(/[^\w\d]+/g, '-').toLowerCase() + '.png';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        }, 'image/png');
    }

    /* ---------- Page ---------- */
    function afficher(el) {
        var corps = el.querySelector('.wf-su-corps');
        el.querySelectorAll('[data-onglet]').forEach(function (b) { b.classList.toggle('wf-btn-pri', b.getAttribute('data-onglet') === etat.onglet); });
        if (!etat.lectures) return;
        var a = anneeEnCours();
        el.querySelector('.wf-page-compte').textContent = a.s.total + ' titre' + (a.s.total > 1 ? 's' : '') + ' terminé' + (a.s.total > 1 ? 's' : '') + ' en ' + a.p.titre;
        if (etat.onglet === 'historique') historique(corps);
        else if (etat.onglet === 'progression') vueProgression(corps);
        else vueObjectifs(corps);
    }
    function charger(el) {
        return json('WolfFlix/Suivi').then(function (d) {
            etat.lectures = (d.lectures || []).map(function (l) { l.date = new Date(l.d); return l; });
            etat.objectifs = d.objectifs || {};
            if (el.isConnected) afficher(el);
        }, function () {
            el.querySelector('.wf-su-corps').innerHTML = '<p class="wf-vide">Le suivi demande l’extension WolfFlix 0.5 ou plus récente (Tableau de bord → Extensions).</p>';
        });
    }
    function page() {
        var ouvert = /^#\/home\?(?:[^#]*&)?wf=suivi/.test(location.hash || '');
        var el = document.getElementById('wf-page');
        if (!ouvert) {
            if (el && el.getAttribute('data-type') === 'suivi') {
                el.remove();
                html.classList.remove('wf-page-ouverte');
            }
            return;
        }
        if (el && el.getAttribute('data-type') === 'suivi') {
            el.style.setProperty('--wf-haut', hautEntete());
            return;
        }
        if (el) el.remove();   // page d'un autre module : élément neuf, sans ses écouteurs
        {
            el = document.createElement('div');
            el.id = 'wf-page';
            document.body.appendChild(el);
        }
        progression = null;
        el.setAttribute('data-type', 'suivi');
        el.style.setProperty('--wf-haut', hautEntete());
        html.classList.add('wf-page-ouverte');
        el.innerHTML = '<div class="wf-page-entete padded-left padded-right">' +
            '<div><p class="wf-page-surtitre">WolfFlix</p><h1 class="wf-page-titre">Mon suivi</h1><p class="wf-page-compte">Chargement…</p></div>' +
            '<div class="wf-page-outils">' +
            '<div class="wf-av-onglets" role="tablist">' +
            '<button type="button" class="wf-btn" data-onglet="historique">Historique</button>' +
            '<button type="button" class="wf-btn" data-onglet="progression">Progression</button>' +
            '<button type="button" class="wf-btn" data-onglet="objectifs">Objectifs</button></div>' +
            '<button type="button" class="wf-btn wf-su-bilan" title="Image de la période affichée dans l’historique"><span class="material-icons download" aria-hidden="true"></span> Bilan en image</button>' +
            '<label class="wf-av-voir"><input type="checkbox" class="wf-su-opt-main"' + (etat.main ? ' checked' : '') + '> Compter les « vu » mis à la main</label>' +
            '<label class="wf-av-voir"><input type="checkbox" class="wf-su-opt-import"' + (etat.importees ? ' checked' : '') + '> Compter l’historique repris</label>' +
            '</div></div>' +
            '<div class="wf-su-corps padded-left padded-right"><p class="wf-vide">Chargement…</p></div>';

        el.addEventListener('click', function (e) {
            var o = e.target.closest('[data-onglet]');
            if (o) { etat.onglet = o.getAttribute('data-onglet'); afficher(el); return; }
            var v = e.target.closest('[data-vue]');
            if (v) { etat.vue = v.getAttribute('data-vue'); afficher(el); return; }
            var s = e.target.closest('[data-sens]');
            if (s && !s.disabled) { etat.ref = decaler(etat.vue, etat.ref, +s.getAttribute('data-sens')); afficher(el); return; }
            if (e.target.closest('.wf-su-bilan')) { bilan(); return; }
            var r = e.target.closest('.wf-su-retirer');
            if (r) {
                r.disabled = true;
                api().ajax({ type: 'DELETE', url: api().getUrl('WolfFlix/Suivi/Lecture', { item: r.getAttribute('data-i'), date: r.getAttribute('data-d') }) })
                    .then(function () { return charger(el); }, function () { r.disabled = false; });
                return;
            }
            var en = e.target.closest('.wf-su-enregistrer');
            if (en) {
                var corpsObj = {};
                el.querySelectorAll('.wf-su-but input').forEach(function (i) { corpsObj[i.getAttribute('data-cle')] = Math.max(0, parseInt(i.value, 10) || 0); });
                en.disabled = true;
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/Suivi/Objectifs'), data: JSON.stringify(corpsObj), contentType: 'application/json', dataType: 'json' })
                    .then(function (d) { etat.objectifs = d || corpsObj; afficher(el); }, function () { en.disabled = false; });
            }
        });
        el.querySelector('.wf-su-opt-main').addEventListener('change', function (e) { etat.main = e.target.checked; ecrireOption('main', etat.main); afficher(el); });
        el.querySelector('.wf-su-opt-import').addEventListener('change', function (e) { etat.importees = e.target.checked; ecrireOption('import', etat.importees); afficher(el); });
        charger(el);
    }

    window.addEventListener('resize', function () {
        var el = document.getElementById('wf-page');
        if (el && el.getAttribute('data-type') === 'suivi') el.style.setProperty('--wf-haut', hautEntete());
    }, { passive: true });
    window.addEventListener('wf-route', page);
    window.addEventListener('hashchange', page);
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(page);
    page();
})();
