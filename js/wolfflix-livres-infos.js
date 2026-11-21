/* =====================================================================
   WolfFlix — Module « Infos des livres » (chargé par wolfflix-core.js)
   Bouton « Infos en ligne » (administrateurs) sur la fiche d'un livre
   ou d'un dossier de livres (série de webtoons, de mangas…).
   Cherche dans plusieurs sources gratuites, montre les résultats avec
   leur couverture, puis applique en un clic ce que tu choisis :
   résumé, genres, année, auteurs, éditeur, couverture, image de fond.
   Sources : Google Books (beaucoup de livres français), OpenLibrary,
   AniList (manga, manhwa, webtoons), MangaDex (résumés en français,
   quand le site répond).
   Les images sont téléchargées par le serveur Jellyfin lui-même.
   Désactiver : WolfFlixConfig.livresInfos = false.
   ===================================================================== */
(function () {
    'use strict';

    if (window.__wfLivresInfos) return;
    window.__wfLivresInfos = true;

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
    function texteBrut(h) {
        var d = document.createElement('div');
        d.innerHTML = String(h || '').replace(/<br\s*\/?>/gi, '\n');
        return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    }
    function toast(texte, erreur) {
        var t = document.createElement('div');
        t.className = 'wf-toast' + (erreur ? ' wf-toast-erreur' : '');
        t.textContent = texte;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('wf-toast-sortie'); }, 2800);
        setTimeout(function () { t.remove(); }, 3300);
    }
    function avecDelai(u, ms, init) {
        var ctrl = window.AbortController ? new AbortController() : null;
        var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 8000);
        return fetch(u, Object.assign({ signal: ctrl ? ctrl.signal : undefined }, init || {})).then(function (r) {
            clearTimeout(t);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }, function (e) { clearTimeout(t); throw e; });
    }
    // Nom « propre » pour la recherche : sans extension, numéro de tome/chapitre, crochets…
    function nomRecherche(nom) {
        return String(nom || '')
            .replace(/\.[a-z0-9]{2,4}$/i, '')
            .replace(/[[(][^\])]*[\])]/g, ' ')
            .replace(/\b(t(ome)?|vol(ume)?|v|chap(itre|ter)?|ch|c|ep(isode)?|part(ie)?|livre|book|#)\.?\s*\d+.*$/i, ' ')
            .replace(/[_.]+/g, ' ')
            .replace(/\s+-\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ---------- Sources ---------- */
    var SOURCES = {
        google: {
            nom: 'Google Books',
            chercher: function (q) {
                return avecDelai('https://www.googleapis.com/books/v1/volumes?maxResults=15&printType=books&langRestrict=fr&q=' + encodeURIComponent(q))
                    .then(function (r) {
                        return (r.items || []).map(function (it) {
                            var v = it.volumeInfo || {};
                            var img = v.imageLinks || {};
                            var couv = (img.extraLarge || img.large || img.medium || img.thumbnail || img.smallThumbnail || '')
                                .replace(/^http:/, 'https:').replace(/&edge=curl/, '');
                            if (couv) couv = couv.replace(/zoom=\d/, 'zoom=0');
                            return {
                                source: 'Google Books', titre: v.title + (v.subtitle ? ' — ' + v.subtitle : ''),
                                auteurs: v.authors || [], annee: (v.publishedDate || '').slice(0, 4), date: v.publishedDate || '',
                                resume: texteBrut(v.description), genres: (v.categories || []).slice(0, 6),
                                editeur: v.publisher || '', couverture: couv, fond: '', isbn: ((v.industryIdentifiers || []).filter(function (x) { return x.type === 'ISBN_13'; })[0] || {}).identifier || ''
                            };
                        });
                    });
            }
        },
        openlibrary: {
            nom: 'OpenLibrary',
            chercher: function (q) {
                return avecDelai('https://openlibrary.org/search.json?limit=15&fields=key,title,author_name,first_publish_year,cover_i,subject,publisher&q=' + encodeURIComponent(q))
                    .then(function (r) {
                        return (r.docs || []).map(function (d) {
                            return {
                                source: 'OpenLibrary', titre: d.title, auteurs: d.author_name || [], annee: d.first_publish_year ? String(d.first_publish_year) : '',
                                resume: '', resumeUrl: d.key ? 'https://openlibrary.org' + d.key + '.json' : '',
                                genres: (d.subject || []).slice(0, 6), editeur: (d.publisher || [])[0] || '',
                                couverture: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg' : '', fond: ''
                            };
                        });
                    });
            }
        },
        anilist: {
            nom: 'AniList (manga / webtoon)',
            chercher: function (q) {
                var requete = 'query($s:String){Page(perPage:15){media(search:$s,type:MANGA,sort:SEARCH_MATCH){title{romaji english native userPreferred} ' +
                    'description(asHtml:false) coverImage{extraLarge large} bannerImage genres startDate{year month day} countryOfOrigin format ' +
                    'staff(perPage:4,sort:RELEVANCE){edges{role node{name{full}}}}}}}';
                return avecDelai('https://graphql.anilist.co', 9000, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ query: requete, variables: { s: q } })
                }).then(function (r) {
                    var l = (((r || {}).data || {}).Page || {}).media || [];
                    return l.map(function (m) {
                        var t = m.title || {};
                        var type = m.countryOfOrigin === 'KR' ? 'Manhwa / webtoon' : m.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga';
                        var sd = m.startDate || {};
                        return {
                            source: 'AniList', titre: t.userPreferred || t.romaji || t.english, autreTitre: t.english && t.english !== t.userPreferred ? t.english : '',
                            auteurs: ((m.staff || {}).edges || []).filter(function (e) { return /story|art|original/i.test(e.role || ''); }).map(function (e) { return e.node.name.full; }),
                            annee: sd.year ? String(sd.year) : '', date: sd.year ? sd.year + '-' + String(sd.month || 1).padStart(2, '0') + '-' + String(sd.day || 1).padStart(2, '0') : '',
                            resume: texteBrut(m.description), genres: (m.genres || []).concat([type]), editeur: '',
                            couverture: (m.coverImage || {}).extraLarge || (m.coverImage || {}).large || '', fond: m.bannerImage || ''
                        };
                    });
                });
            }
        },
        mangadex: {
            nom: 'MangaDex (résumés FR)',
            chercher: function (q) {
                return avecDelai('https://api.mangadex.org/manga?limit=12&includes[]=cover_art&includes[]=author&title=' + encodeURIComponent(q))
                    .then(function (r) {
                        return (r.data || []).map(function (m) {
                            var a = m.attributes || {};
                            var titres = a.title || {};
                            var couv = (m.relationships || []).filter(function (x) { return x.type === 'cover_art'; })[0];
                            var fichier = couv && couv.attributes && couv.attributes.fileName;
                            return {
                                source: 'MangaDex', titre: titres.fr || titres.en || titres['ja-ro'] || Object.values(titres)[0] || '',
                                auteurs: (m.relationships || []).filter(function (x) { return x.type === 'author' && x.attributes; }).map(function (x) { return x.attributes.name; }),
                                annee: a.year ? String(a.year) : '',
                                resume: texteBrut((a.description || {}).fr || (a.description || {}).en || ''),
                                genres: (a.tags || []).filter(function (t) { return t.attributes && t.attributes.group === 'genre'; }).map(function (t) { return (t.attributes.name || {}).en; }).slice(0, 6),
                                editeur: '', couverture: fichier ? 'https://uploads.mangadex.org/covers/' + m.id + '/' + fichier : '', fond: ''
                            };
                        });
                    });
            }
        }
    };

    /* ---------- Bouton sur les fiches ---------- */
    var memo = {};
    function estAdmin() {
        if (!memo.admin) {
            var u = window.WolfFlix && window.WolfFlix.utilisateur ? window.WolfFlix.utilisateur() : api().getCurrentUser();
            memo.admin = u.then(function (x) { return !!(x && x.Policy && x.Policy.IsAdministrator); });
            memo.admin.catch(function () { delete memo.admin; });
        }
        return memo.admin;
    }
    function contientLivres(id) {
        var cle = 'livres-' + id;
        if (!memo[cle]) {
            memo[cle] = json('Users/' + uid() + '/Items', { ParentId: id, IncludeItemTypes: 'Book', Recursive: true, Limit: 1, EnableImages: false })
                .then(function (r) { return (r.TotalRecordCount || (r.Items || []).length) > 0; });
            memo[cle].catch(function () { delete memo[cle]; });
        }
        return memo[cle];
    }

    function fiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || !api()) return;
        var id = m[1];
        var page = document.querySelector('#itemDetailPage:not(.hide)');
        var boutons = page && page.querySelector('.mainDetailButtons');
        if (!boutons || boutons.offsetParent === null) return;
        var deja = boutons.querySelector('.wf-btn-infos');
        if (deja && deja.getAttribute('data-id') === id) return;
        if (deja) deja.remove();
        if (memo['fait-' + id]) return;
        memo['fait-' + id] = true;
        var el = window.WolfFlix && window.WolfFlix.element ? window.WolfFlix.element(id) : api().getItem(uid(), id);
        Promise.all([estAdmin(), el]).then(function (r) {
            var item = r[1];
            if (!r[0] || !item) return null;
            if (item.Type === 'Book') return item;
            if (item.Type === 'Folder') return contientLivres(id).then(function (ok) { return ok ? item : null; });
            return null;
        }).then(function (item) {
            delete memo['fait-' + id];
            if (!item) { memo['fait-' + id] = true; return; }
            var p = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons');
            if (!p || p.querySelector('.wf-btn-infos[data-id="' + id + '"]')) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'wf-btn-infos';
            b.setAttribute('data-id', id);
            b.title = 'Chercher de meilleures infos et images en ligne';
            b.innerHTML = '<span class="material-icons travel_explore" aria-hidden="true"></span><span class="wf-btn-infos-texte">Infos en ligne</span>';
            b.addEventListener('click', function () { dialogue(item); });
            p.appendChild(b);
        }).catch(function () { delete memo['fait-' + id]; });
    }

    /* ---------- Dialogue de recherche ---------- */
    function dialogue(item) {
        var estDossier = item.Type === 'Folder';
        var sourceActive = estDossier ? 'anilist' : 'google';
        var resultats = [];
        var fond = document.createElement('div');
        fond.className = 'wf-editeur-fond';
        fond.innerHTML = '<div class="wf-editeur wf-infos" role="dialog" aria-modal="true" aria-label="Infos en ligne">' +
            '<header><p class="wf-page-surtitre">' + (estDossier ? 'Série / dossier' : 'Livre') + '</p><h2>' + esc(item.Name) + '</h2>' +
            '<p class="wf-aide">Choisis une source, vérifie le titre cherché, puis clique sur le bon résultat.</p>' +
            '<div class="wf-infos-sources" role="tablist">' + Object.keys(SOURCES).map(function (k) {
                return '<button type="button" role="tab" data-source="' + k + '" aria-selected="' + (k === sourceActive) + '">' + esc(SOURCES[k].nom) + '</button>';
            }).join('') + '</div>' +
            '<form class="wf-infos-recherche"><label class="wf-champ"><span class="material-icons search" aria-hidden="true"></span>' +
            '<input type="search" value="' + esc(nomRecherche(item.Name)) + '" aria-label="Titre à chercher"></label>' +
            '<button type="submit" class="wf-btn wf-btn-pri">Chercher</button></form></header>' +
            '<div class="wf-infos-resultats"></div>' +
            '<footer><span class="wf-editeur-etat"></span><button type="button" class="wf-btn wf-btn-sec" data-act="fermer">Fermer</button></footer></div>';
        document.body.appendChild(fond);
        html.classList.add('wf-modale-ouverte');
        var zone = fond.querySelector('.wf-infos-resultats');
        var champ = fond.querySelector('input');

        function fermer() {
            fond.remove();
            html.classList.remove('wf-modale-ouverte');
        }
        fond.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } });
        fond.addEventListener('click', function (e) {
            if (e.target === fond || e.target.closest('[data-act="fermer"]')) { fermer(); return; }
            var s = e.target.closest('[data-source]');
            if (s) {
                sourceActive = s.getAttribute('data-source');
                fond.querySelectorAll('[data-source]').forEach(function (x) { x.setAttribute('aria-selected', String(x === s)); });
                chercher();
                return;
            }
            var r = e.target.closest('[data-resultat]');
            if (r) apercu(resultats[+r.getAttribute('data-resultat')]);
        });
        fond.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); chercher(); });

        function chercher() {
            var q = champ.value.trim();
            if (q.length < 2) return;
            zone.innerHTML = '<div class="wf-attente"><span class="wf-attente-loup"></span><span>Recherche…</span></div>';
            SOURCES[sourceActive].chercher(q).then(function (l) {
                resultats = l.filter(function (x) { return x.titre; });
                if (!resultats.length) { zone.innerHTML = '<p class="wf-vide">Aucun résultat. Essaie un titre plus court, ou une autre source.</p>'; return; }
                zone.innerHTML = '<div class="wf-infos-grille">' + resultats.map(function (x, n) {
                    return '<button type="button" class="wf-infos-carte" data-resultat="' + n + '">' +
                        '<span class="wf-infos-couv"' + (x.couverture ? ' style="background-image:url(\'' + esc(x.couverture) + '\')"' : '') + '></span>' +
                        '<span class="wf-infos-texte"><strong>' + esc(x.titre) + '</strong>' +
                        (x.autreTitre ? '<small>' + esc(x.autreTitre) + '</small>' : '') +
                        '<small>' + esc([x.auteurs.slice(0, 2).join(', '), x.annee].filter(Boolean).join(' · ')) + '</small>' +
                        (x.resume ? '<span class="wf-infos-extrait">' + esc(x.resume.slice(0, 180)) + (x.resume.length > 180 ? '…' : '') + '</span>' : '') +
                        '</span></button>';
                }).join('') + '</div>';
            }).catch(function () {
                zone.innerHTML = '<p class="wf-vide">' + esc(SOURCES[sourceActive].nom) + ' ne répond pas pour l\'instant. Essaie une autre source.</p>';
            });
        }

        function apercu(x) {
            if (!x) return;
            var p = x.resumeUrl && !x.resume ? avecDelai(x.resumeUrl).then(function (w) {
                var d = w && w.description;
                x.resume = texteBrut(typeof d === 'string' ? d : (d && d.value) || '');
            }).catch(function () { /* rien */ }) : Promise.resolve();
            p.then(function () {
                var enfants = estDossier ? '<label class="wf-infos-option"><input type="checkbox" data-champ="enfants"> Appliquer aussi la couverture et les genres à tous les livres du dossier</label>' : '';
                zone.innerHTML = '<div class="wf-infos-apercu">' +
                    '<div class="wf-infos-apercu-couv"' + (x.couverture ? ' style="background-image:url(\'' + esc(x.couverture) + '\')"' : '') + '></div>' +
                    '<div class="wf-infos-apercu-texte"><h3>' + esc(x.titre) + '</h3><p class="wf-aide">Source : ' + esc(x.source) + '</p>' +
                    option('resume', 'Résumé', x.resume ? x.resume.slice(0, 400) + (x.resume.length > 400 ? '…' : '') : '', true) +
                    option('genres', 'Genres', x.genres.join(', '), true) +
                    option('annee', 'Année', x.annee, true) +
                    option('auteurs', 'Auteurs', x.auteurs.join(', '), true) +
                    option('editeur', 'Éditeur', x.editeur, true) +
                    option('couverture', 'Couverture', x.couverture ? 'nouvelle image' : '', true) +
                    option('fond', 'Image de fond', x.fond ? 'bannière' : '', true) +
                    option('titre', 'Remplacer le titre par « ' + x.titre + ' »', 'oui', false) +
                    enfants +
                    '<label class="wf-infos-option"><input type="checkbox" data-champ="verrou" checked> Verrouiller ces infos (une actualisation de Jellyfin ne les écrasera pas)</label>' +
                    '<div class="wf-infos-actions"><button type="button" class="wf-btn wf-btn-sec" data-act="retour">Retour aux résultats</button>' +
                    '<button type="button" class="wf-btn wf-btn-pri" data-act="appliquer">Appliquer</button></div></div></div>';
                zone.querySelector('[data-act="retour"]').addEventListener('click', function () { chercherRendu(); });
                zone.querySelector('[data-act="appliquer"]').addEventListener('click', function () {
                    var choix = {};
                    zone.querySelectorAll('[data-champ]').forEach(function (c) { choix[c.getAttribute('data-champ')] = c.checked; });
                    appliquer(item, x, choix, fond.querySelector('.wf-editeur-etat')).then(function () {
                        fermer();
                        toast('Infos mises à jour');
                        if (window.WolfFlix && window.WolfFlix.oublierElement) window.WolfFlix.oublierElement(item.Id);
                        setTimeout(function () { location.reload(); }, 900);
                    }).catch(function (e) {
                        toast('Échec : ' + ((e && e.message) || 'erreur'), true);
                    });
                });
            });
        }
        function chercherRendu() { chercher(); }
        function option(cle, libelle, valeur, coche) {
            if (!valeur) return '';
            return '<label class="wf-infos-option"><input type="checkbox" data-champ="' + cle + '"' + (coche ? ' checked' : '') + '> <strong>' + esc(libelle) + '</strong>' +
                (cle !== 'titre' ? ' <span>' + esc(valeur) + '</span>' : '') + '</label>';
        }

        chercher();
    }

    /* ---------- Application ---------- */
    function telechargerImage(id, type, lien) {
        return api().ajax({ type: 'POST', url: url('Items/' + id + '/RemoteImages/Download', { type: type, imageUrl: lien }) });
    }
    function appliquer(item, x, choix, etatTexte) {
        var a = api();
        etatTexte.textContent = 'Enregistrement…';
        return json('Items/' + item.Id, { userId: uid(), _: Date.now() }).catch(function () { return a.getItem(uid(), item.Id); }).then(function (it) {
            if (choix.titre) it.Name = x.titre;
            if (choix.resume && x.resume) it.Overview = x.resume;
            if (choix.genres && x.genres.length) it.Genres = x.genres;
            if (choix.annee && x.annee) {
                it.ProductionYear = +x.annee;
                if (x.date) it.PremiereDate = new Date(x.date + (x.date.length <= 7 ? '-01' : '')).toISOString();
            }
            if (choix.auteurs && x.auteurs.length) {
                var autres = (it.People || []).filter(function (p) { return p.Type !== 'Author' && p.Type !== 'Writer'; });
                it.People = autres.concat(x.auteurs.map(function (n) { return { Name: n, Type: 'Author' }; }));
            }
            if (choix.editeur && x.editeur) it.Studios = [{ Name: x.editeur }];
            if (choix.verrou) it.LockData = true;
            return a.updateItem(it);
        }).then(function () {
            var etapes = [];
            if (choix.couverture && x.couverture) etapes.push(function () { etatTexte.textContent = 'Couverture…'; return telechargerImage(item.Id, 'Primary', x.couverture); });
            if (choix.fond && x.fond) etapes.push(function () { etatTexte.textContent = 'Image de fond…'; return telechargerImage(item.Id, 'Backdrop', x.fond); });
            if (choix.enfants) {
                etapes.push(function () {
                    etatTexte.textContent = 'Livres du dossier…';
                    return json('Users/' + uid() + '/Items', { ParentId: item.Id, IncludeItemTypes: 'Book', Recursive: true, EnableImages: false }).then(function (r) {
                        var livres = r.Items || [];
                        var n = 0;
                        return livres.reduce(function (p, l) {
                            return p.then(function () {
                                n++;
                                etatTexte.textContent = 'Livres du dossier… ' + n + ' / ' + livres.length;
                                var suite = Promise.resolve();
                                if (choix.genres && x.genres.length) {
                                    suite = a.getItem(uid(), l.Id).then(function (li) { li.Genres = x.genres; return a.updateItem(li); });
                                }
                                if (choix.couverture && x.couverture) suite = suite.then(function () { return telechargerImage(l.Id, 'Primary', x.couverture); });
                                return suite.catch(function () { /* on continue */ });
                            });
                        }, Promise.resolve());
                    });
                });
            }
            return etapes.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
        });
    }

    /* ---------- Orchestration ---------- */
    var prevu = false;
    function passer() {
        if (window.WolfFlix && window.WolfFlix.planifier) { window.WolfFlix.planifier(); return; }
        if (prevu) return;
        prevu = true;
        requestAnimationFrame(function () { prevu = false; fiche(); });
    }
    window.addEventListener('wf-route', function () { Object.keys(memo).forEach(function (k) { if (k.indexOf('fait-') === 0) delete memo[k]; }); passer(); });
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(fiche);
    else new MutationObserver(passer).observe(document.body, { childList: true, subtree: true });
    passer();
})();
