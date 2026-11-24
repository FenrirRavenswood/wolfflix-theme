/* WolfFlix — choix automatique des pistes audio et sous-titres
   Au lancement d'un film ou d'un épisode :
     · audio : VFF, sinon VFQ, sinon la VO (la piste par défaut du fichier) ;
     · sous-titres : les sous-titres FORCÉS français s'ils existent, sinon AUCUN
       (jamais une piste complète choisie à ta place).
   Les pistes sont reconnues par leur langue, leurs indicateurs ET leur nom
   (« VFF », « TrueFrench », « VFQ », « Québec », « Forcés », « Forced »…).
   Si tu changes toi-même de piste pendant la lecture, ton choix est respecté.
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

    function choisir(source, analyse) {
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
    }

    function api() { return window.ApiClient; }

    // Pistes du fichier demandé (version choisie si plusieurs)
    var cacheSources = {};
    function sourcesDe(id) {
        if (cacheSources[id]) return cacheSources[id];
        var a = api();
        cacheSources[id] = a.getJSON(a.getUrl('Users/' + a.getCurrentUserId() + '/Items/' + id)).then(function (it) {
            setTimeout(function () { delete cacheSources[id]; }, 60000);
            return (it && it.MediaSources) || [];
        }, function () { delete cacheSources[id]; return []; });
        return cacheSources[id];
    }

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
        return Promise.all([sourcesDe(id), analyseDe(id)]).then(function (r) {
            var sources = r[0];
            var src = sources.filter(function (s) { return voulu && String(s.Id).replace(/-/g, '').toLowerCase() === voulu; })[0] || sources[0];
            if (!src || !(src.MediaStreams || []).some(function (x) { return x.Type === 'Video'; })) return null; // pas une vidéo
            var c = choisir(src, r[1]);
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
})();
