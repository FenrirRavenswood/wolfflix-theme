/* WolfFlix — choix automatique des pistes audio et sous-titres
   Au lancement d'un film ou d'un épisode :
     · audio : VFF, sinon VFQ, sinon la VO (la piste par défaut du fichier) ;
     · sous-titres : les sous-titres FORCÉS français s'ils existent, sinon AUCUN
       (jamais une piste complète choisie à ta place).
   Les pistes sont reconnues par leur langue, leurs indicateurs ET leur nom
   (« VFF », « TrueFrench », « VFQ », « Québec », « Forcés », « Forced »…).
   Si tu changes toi-même de piste pendant la lecture, ton choix est respecté, et il est
   RETENU pour toute la série ou toute la saga (et seulement pour elle) : les épisodes ou
   films suivants le reprennent, jusqu'à la fin de la série ou de la saga, puis on revient
   aux règles de base.
   Fonctionne en modifiant la demande de lecture envoyée au serveur (PlaybackInfo) :
   le serveur prépare donc directement les bonnes pistes, même en transcodage. */
(function () {
    'use strict';
    if (window.__wfPistes) return;
    window.__wfPistes = true;

    /* ---------- Reconnaissance des pistes ---------- */
    function texte(s) {
        return ((s.Title || '') + ' ' + (s.DisplayTitle || '') + ' ' + (s.Comment || '')).toLowerCase();
    }
    var RE_VFQ = /\bvfq\b|\bvfc\b|qu[ée]b[ée]c|qu[ée]becois|canad|\bfr[-_ ]?ca\b|\(ca\)/i;
    var RE_VFF = /\bvff\b|\bvf2\b|\bvfi\b|truefrench|\bfrance\b|\bfr[-_ ]?fr\b|\(fr\)/i;
    var RE_FR = /fran[cç]ais|french|\bvf\b|\bvff\b|\bvfq\b|truefrench/i;
    var RE_COMMENTAIRE = /comment|audio[- ]?desc|\bad\b|malvoyant|visually/i;
    var RE_FORCE = /forc[ée]s?\b|forced|\bff\b|\bsigns?\b|panneaux|\bnarratif|\bpartiels?\b/i;
    var RE_SDH = /\bsdh\b|\bcc\b|malentendant|sourds|hearing|\bhi\b/i;

    function estFrancais(s) {
        var l = (s.Language || '').toLowerCase();
        return l === 'fre' || l === 'fra' || l === 'fr' || l.indexOf('fr-') === 0 || RE_FR.test(texte(s));
    }
    function variante(s) {
        // 'vfq', 'vff' (indiqué), ou 'fr' (français sans précision)
        var t = texte(s), l = (s.Language || '').toLowerCase();
        if (RE_VFQ.test(t) || l === 'fr-ca') return 'vfq';
        if (RE_VFF.test(t) || l === 'fr-fr') return 'vff';
        return 'fr';
    }

    function choisirAudio(pistes) {
        var audio = pistes.filter(function (s) { return s.Type === 'Audio'; });
        var fr = audio.filter(function (s) { return estFrancais(s) && !RE_COMMENTAIRE.test(texte(s)); });
        if (!fr.length) return null; // pas de français : on laisse la VO choisie par le serveur
        function score(s) {
            var v = variante(s);
            // VFF indiquée > français sans précision > VFQ
            var base = v === 'vff' ? 300 : v === 'fr' ? 200 : 100;
            return base + Math.min(s.Channels || 2, 8) * 2 + (s.IsDefault ? 1 : 0);
        }
        fr.sort(function (a, b) { return score(b) - score(a); });
        return fr[0];
    }

    function choisirSousTitres(pistes, audio, analyse) {
        analyse = analyse || {};
        var st = pistes.filter(function (s) { return s.Type === 'Subtitle' && estFrancais(s) && !RE_SDH.test(texte(s)); });
        var forces = st.filter(function (s) {
            // L'analyse de l'extension WolfFlix (nombre de répliques) passe avant le nom de la piste
            var a = analyse[String(s.Index)];
            if (a) return a.classe === 'force';
            return s.IsForced || RE_FORCE.test(texte(s));
        });
        if (!forces.length) return null; // aucun forcé : aucun sous-titre
        var va = audio ? variante(audio) : 'vff';
        function score(s) {
            var v = variante(s);
            // même variante que l'audio en priorité, puis France, puis le reste
            return (v === va ? 20 : 0) + (v !== 'vfq' ? 10 : 0) + (s.IsForced ? 2 : 0) + (s.IsExternal ? 0 : 1);
        }
        forces.sort(function (a, b) { return score(b) - score(a); });
        return forces[0];
    }

    /* ---------- Mémoire par série / saga ---------- */
    // Une piste décrite de façon transposable d'un fichier à l'autre : langue, variante, type de sous-titre
    function langue(s) {
        var l = (s.Language || '').toLowerCase();
        if (estFrancais(s)) return 'fr';
        return l.slice(0, 3) || 'und';
    }
    function decrireAudio(s) { return s ? { l: langue(s), v: langue(s) === 'fr' ? variante(s) : '' } : null; }
    function classeSt(s, analyse) {
        var a = analyse && analyse[String(s.Index)];
        if (a) return a.classe;
        if (RE_SDH.test(texte(s))) return 'sdh';
        return s.IsForced || RE_FORCE.test(texte(s)) ? 'force' : 'complet';
    }
    function decrireSt(s, analyse) { return s ? { l: langue(s), c: classeSt(s, analyse), v: langue(s) === 'fr' ? variante(s) : '' } : { aucun: true }; }

    function retrouverAudio(pistes, d) {
        var a = pistes.filter(function (s) { return s.Type === 'Audio' && !RE_COMMENTAIRE.test(texte(s)) && langue(s) === d.l; });
        if (!a.length) return undefined;
        var memeV = a.filter(function (s) { return !d.v || variante(s) === d.v; });
        var l = memeV.length ? memeV : a;
        l.sort(function (x, y) { return (y.Channels || 2) - (x.Channels || 2); });
        return l[0];
    }
    function retrouverSt(pistes, d, analyse) {
        if (d.aucun) return null;
        var st = pistes.filter(function (s) { return s.Type === 'Subtitle' && langue(s) === d.l && classeSt(s, analyse) === d.c; });
        if (!st.length) return undefined;
        var memeV = st.filter(function (s) { return !d.v || variante(s) === d.v; });
        return (memeV.length ? memeV : st)[0];
    }

    function cleMemoire() { var a = api(); return 'wf-pistes-groupes-' + (a ? a.getCurrentUserId() : ''); }
    function memoire() { try { return JSON.parse(localStorage.getItem(cleMemoire())) || {}; } catch (e) { return {}; } }
    function ecrireMemoire(m, depuisServeur) {
        if (!depuisServeur) m._d = Date.now();
        try { localStorage.setItem(cleMemoire(), JSON.stringify(m)); } catch (e) { /* plein */ }
        if (!depuisServeur) envoyerMemoire(m);
    }
    // Synchronisation entre appareils : la mémoire est aussi rangée sur le serveur (préférences d'affichage de l'utilisateur)
    var PREF = 'wolfflix-pistes', CLIENT_PREF = 'wolfflix';
    var minuterieEnvoi = null;
    function envoyerMemoire(m) {
        clearTimeout(minuterieEnvoi);
        minuterieEnvoi = setTimeout(function () {
            var a = api();
            if (!a) return;
            var corps = {
                Id: PREF, Client: CLIENT_PREF, SortBy: 'SortName', SortOrder: 'Ascending', RememberIndexing: false, RememberSorting: false,
                ScrollDirection: 'Horizontal', ShowBackdrop: false, ShowSidebar: false, PrimaryImageHeight: 250, PrimaryImageWidth: 250,
                CustomPrefs: { memoire: JSON.stringify(m) }
            };
            a.ajax({ type: 'POST', contentType: 'application/json', data: JSON.stringify(corps), url: a.getUrl('DisplayPreferences/' + PREF, { userId: a.getCurrentUserId(), client: CLIENT_PREF }) })
                .catch(function () { /* reste locale */ });
        }, 1500);
    }
    var synchroFaite = '';
    function synchroniser() {
        var a = api();
        if (!a || synchroFaite === a.getCurrentUserId()) return;
        synchroFaite = a.getCurrentUserId();
        a.getJSON(a.getUrl('DisplayPreferences/' + PREF, { userId: a.getCurrentUserId(), client: CLIENT_PREF })).then(function (d) {
            var serveur = null;
            try { serveur = d && d.CustomPrefs && d.CustomPrefs.memoire ? JSON.parse(d.CustomPrefs.memoire) : null; } catch (e) { serveur = null; }
            var local = memoire();
            if (serveur && (serveur._d || 0) > (local._d || 0)) ecrireMemoire(serveur, true);
            else if (local._d && (!serveur || (local._d || 0) > (serveur._d || 0))) envoyerMemoire(local);
        }).catch(function () { synchroFaite = ''; });
    }

    // Groupe d'une vidéo : sa série, ou la saga (collection) qui contient le film
    var groupes = {};
    function groupeDe(item) {
        if (!item) return Promise.resolve(null);
        if (groupes[item.Id]) return groupes[item.Id];
        var p;
        if (item.Type === 'Episode' && item.SeriesId) {
            p = Promise.resolve({ id: String(item.SeriesId).replace(/-/g, ''), type: 'serie' });
        } else if (item.Type === 'Movie' && window.WolfFlix && window.WolfFlix.sagaDe) {
            p = window.WolfFlix.sagaDe(item.Id).then(function (s) { return s ? { id: s.id, type: 'saga', ids: s.ids } : null; }, function () { return null; });
        } else {
            p = Promise.resolve(null);
        }
        groupes[item.Id] = p;
        return p;
    }

    function choisir(source, analyse, prefere) {
        if (prefere) {
            var pistes0 = (source && source.MediaStreams) || [];
            var a0 = prefere.audio ? retrouverAudio(pistes0, prefere.audio) : undefined;
            var s0 = prefere.st ? retrouverSt(pistes0, prefere.st, analyse) : undefined;
            var base = choisir(source, analyse, null);
            return {
                audio: a0 ? a0.Index : base.audio,
                sousTitres: s0 === null ? -1 : s0 ? s0.Index : base.sousTitres,
                memoire: true
            };
        }
        return choisirBase(source, analyse);
    }

    function choisirBase(source, analyse) {
        var pistes = (source && source.MediaStreams) || [];
        var a = choisirAudio(pistes);
        var s = choisirSousTitres(pistes, a, analyse);
        return { audio: a ? a.Index : null, sousTitres: s ? s.Index : -1 };
    }

    /* ---------- Une lecture à la fois : le premier choix seulement ---------- */
    var enCours = {}; // itemId → true tant que la lecture n'est pas arrêtée
    function idDepuisUrl(u) {
        var m = /\/Items\/([0-9a-f]{32})\/PlaybackInfo/i.exec(u || '');
        return m ? m[1].toLowerCase() : null;
    }
    function estArret(u) { return /\/Sessions\/Playing\/Stopped/i.test(u || ''); }

    function noterArret(corps) {
        try {
            var o = typeof corps === 'string' ? JSON.parse(corps) : corps;
            if (o && o.ItemId) delete enCours[String(o.ItemId).replace(/-/g, '').toLowerCase()];
        } catch (e) { /* rien */ }
        suivreLecture(corps, true);
    }

    function api() { return window.ApiClient; }

    // Pistes du fichier demandé (version choisie si plusieurs)
    var cacheItems = {};
    function itemDe(id) {
        if (cacheItems[id]) return cacheItems[id];
        var a = api();
        cacheItems[id] = a.getJSON(a.getUrl('Users/' + a.getCurrentUserId() + '/Items/' + id)).then(function (it) {
            setTimeout(function () { delete cacheItems[id]; }, 60000);
            return it || null;
        }, function () { delete cacheItems[id]; return null; });
        return cacheItems[id];
    }
    function sourcesDe(id) {
        return itemDe(id).then(function (it) { return (it && it.MediaSources) || []; });
    }

    /* ---------- Changements faits à la main pendant la lecture ---------- */
    var lectures = {}; // itemId → { source, analyse, groupe, audio, sousTitres } (choix au lancement)
    function suivreLecture(corps, arret) {
        var o;
        try { o = typeof corps === 'string' ? JSON.parse(corps) : corps; } catch (e) { return; }
        if (!o || !o.ItemId) return;
        var id = String(o.ItemId).replace(/-/g, '').toLowerCase();
        var l = lectures[id];
        if (!l) return;
        var a = o.AudioStreamIndex, st = o.SubtitleStreamIndex;
        if (st === undefined || st === null) st = -1;
        if (!l.base) {
            // Premier rapport du lecteur : c'est le point de départ, pas un changement
            l.base = true;
            if (a !== undefined && a !== null) l.audio = a;
            l.sousTitres = st;
            if (arret) delete lectures[id];
            return;
        }
        var change = (a !== undefined && a !== null && a !== l.audio) || st !== l.sousTitres;
        if (change && l.groupe) {
            // Choix fait à la main : retenu pour toute la série / saga
            var pistes = l.source.MediaStreams || [];
            var sa = pistes.filter(function (s) { return s.Type === 'Audio' && s.Index === a; })[0];
            var ss = st >= 0 ? pistes.filter(function (s) { return s.Type === 'Subtitle' && s.Index === st; })[0] : null;
            var m = memoire();
            m[l.groupe.id] = { audio: decrireAudio(sa) || (m[l.groupe.id] || {}).audio || null, st: decrireSt(ss, l.analyse), t: Date.now() };
            ecrireMemoire(m);
            l.audio = a;
            l.sousTitres = st;
        }
        if (arret) {
            finDeGroupe(id, l, o.PositionTicks);
            delete lectures[id];
        }
    }

    // Dernier épisode de la série (ou dernier film de la saga) regardé jusqu'au bout : on oublie le choix
    function finDeGroupe(id, l, position) {
        if (!l.groupe) return;
        itemDe(id).then(function (it) {
            if (!it || !it.RunTimeTicks || !(position >= it.RunTimeTicks * 0.9)) return null;
            if (l.groupe.type === 'saga') return l.groupe.ids[l.groupe.ids.length - 1] === it.Id;
            var a = api();
            return a.getJSON(a.getUrl('Shows/' + l.groupe.id + '/Episodes', { UserId: a.getCurrentUserId(), Fields: 'Id', EnableImages: false, EnableUserData: false }))
                .then(function (r) {
                    var eps = (r.Items || []).filter(function (e) { return e.ParentIndexNumber > 0; });
                    return eps.length > 0 && eps[eps.length - 1].Id === it.Id;
                });
        }).then(function (dernier) {
            if (!dernier) return;
            var m = memoire();
            delete m[l.groupe.id];
            ecrireMemoire(m);
        }).catch(function () { /* rien */ });
    }
    function estSuivi(u) { return /\/Sessions\/Playing(\/Progress)?(\?|$)/i.test(u || '') && !/Stopped/i.test(u || ''); }

    // Analyse « forcé / complet » de l'extension WolfFlix, si elle est installée (1,5 s au plus)
    function analyseDe(id) {
        var a = api();
        var demande = a.getJSON(a.getUrl('WolfFlix/Pistes/' + id)).then(function (r) { return r || {}; }, function () { return {}; });
        var delai = new Promise(function (ok) { setTimeout(function () { ok({}); }, 1500); });
        return Promise.race([demande, delai]);
    }

    // Modifie l'adresse et le corps de la demande avec nos choix
    function appliquer(url, corps, id) {
        var q = /[?&]MediaSourceId=([^&]+)/i.exec(url);
        var voulu = q ? decodeURIComponent(q[1]).replace(/-/g, '').toLowerCase() : null;
        return Promise.all([sourcesDe(id), analyseDe(id), itemDe(id).then(groupeDe)]).then(function (r) {
            var sources = r[0];
            var src = sources.filter(function (s) { return voulu && String(s.Id).replace(/-/g, '').toLowerCase() === voulu; })[0] || sources[0];
            if (!src || !(src.MediaStreams || []).some(function (x) { return x.Type === 'Video'; })) return null; // pas une vidéo
            var g = r[2];
            var prefere = g ? memoire()[g.id] : null;
            var c = choisir(src, r[1], prefere);
            lectures[id] = { source: src, analyse: r[1], groupe: g, audio: c.audio, sousTitres: c.sousTitres };
            function poser(u, cle, val) {
                var re = new RegExp('([?&])' + cle + '=[^&]*', 'i');
                if (re.test(u)) return u.replace(re, '$1' + cle + '=' + val);
                return u + (u.indexOf('?') === -1 ? '?' : '&') + cle + '=' + val;
            }
            var u2 = url;
            if (c.audio !== null) u2 = poser(u2, 'AudioStreamIndex', c.audio);
            u2 = poser(u2, 'SubtitleStreamIndex', c.sousTitres);
            var b2 = corps;
            try {
                if (typeof corps === 'string' && corps.charAt(0) === '{') {
                    var o = JSON.parse(corps);
                    if (c.audio !== null) o.AudioStreamIndex = c.audio;
                    o.SubtitleStreamIndex = c.sousTitres;
                    b2 = JSON.stringify(o);
                }
            } catch (e) { /* corps laissé tel quel */ }
            return { url: u2, corps: b2, choix: c };
        });
    }

    // La réponse indique aussi les pistes par défaut au lecteur (lecture directe)
    function corrigerReponse(txt, choix) {
        try {
            var o = JSON.parse(txt);
            (o.MediaSources || []).forEach(function (m) {
                if (choix.audio !== null) m.DefaultAudioStreamIndex = choix.audio;
                m.DefaultSubtitleStreamIndex = choix.sousTitres;
            });
            return JSON.stringify(o);
        } catch (e) { return txt; }
    }

    /* ---------- Interception : fetch ---------- */
    if (window.fetch) {
        var fetchOrig = window.fetch.bind(window);
        window.fetch = function (entree, init) {
            var u = typeof entree === 'string' ? entree : (entree && entree.url) || '';
            if (estArret(u) && init && init.body) noterArret(init.body);
            else if (estSuivi(u) && init && init.body) suivreLecture(init.body, false);
            var id = idDepuisUrl(u);
            if (!id || typeof entree !== 'string' || enCours[id]) return fetchOrig(entree, init);
            enCours[id] = true;
            return appliquer(u, init && init.body, id).then(function (r) {
                if (!r) { delete enCours[id]; return fetchOrig(entree, init); }
                var init2 = Object.assign({}, init || {});
                if (r.corps !== undefined && init && init.body !== undefined) init2.body = r.corps;
                return fetchOrig(r.url, init2).then(function (rep) {
                    if (!rep.ok) return rep;
                    return rep.text().then(function (t) {
                        return new Response(corrigerReponse(t, r.choix), { status: rep.status, statusText: rep.statusText, headers: rep.headers });
                    });
                });
            }, function () { return fetchOrig(entree, init); });
        };
    }

    /* ---------- Interception : XMLHttpRequest (SDK / axios) ---------- */
    if (window.XMLHttpRequest) {
        var P = XMLHttpRequest.prototype, ouvrir = P.open, envoyer = P.send, entete = P.setRequestHeader;
        P.open = function (m, u) {
            var x = this;
            if (!x.__wf) {
                x.__wf = { args: Array.prototype.slice.call(arguments), entetes: [] };
                // Écouteur posé avant ceux de l'application : la réponse est corrigée avant qu'elle la lise
                if (idDepuisUrl(String(u || ''))) {
                    x.addEventListener('readystatechange', function () {
                        var c = x.__wf && x.__wf.choix;
                        if (!c || x.readyState !== 4 || x.status < 200 || x.status >= 300) return;
                        try {
                            if (x.responseType === 'json') {
                                var o = JSON.parse(corrigerReponse(JSON.stringify(x.response), c));
                                Object.defineProperty(x, 'response', { value: o, configurable: true });
                            } else if (!x.responseType || x.responseType === 'text') {
                                var t = corrigerReponse(x.responseText, c);
                                Object.defineProperty(x, 'responseText', { value: t, configurable: true });
                                Object.defineProperty(x, 'response', { value: t, configurable: true });
                            }
                        } catch (e) { /* réponse laissée telle quelle */ }
                    });
                }
            }
            return ouvrir.apply(this, arguments);
        };
        P.setRequestHeader = function (k, v) {
            if (this.__wf) this.__wf.entetes.push([k, v]);
            return entete.apply(this, arguments);
        };
        P.send = function (corps) {
            var x = this, w = x.__wf, u = w && String(w.args[1] || '');
            if (estArret(u)) noterArret(corps);
            else if (estSuivi(u)) suivreLecture(corps, false);
            var id = idDepuisUrl(u);
            if (!id || enCours[id]) return envoyer.apply(x, arguments);
            enCours[id] = true;
            appliquer(u, corps, id).then(function (r) {
                if (!r) { delete enCours[id]; envoyer.call(x, corps); return; }
                var args = w.args.slice();
                args[1] = r.url;
                w.choix = r.choix;
                ouvrir.apply(x, args);
                w.entetes.forEach(function (h) { entete.apply(x, h); });
                envoyer.call(x, r.corps);
            }, function () { envoyer.call(x, corps); });
        };
    }

    // Pour les tests et les autres modules
    window.WolfFlix = window.WolfFlix || {};
    window.WolfFlix.choisirPistes = choisir;
    synchroniser();
    window.addEventListener('wf-route', synchroniser);
    window.addEventListener('focus', function () { synchroFaite = ''; synchroniser(); });
})();
