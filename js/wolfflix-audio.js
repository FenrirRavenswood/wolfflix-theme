/* WolfFlix — Livres audio
   · Fiche d'un livre : bouton « Écouter » quand le livre audio du même titre existe ;
     fiche d'un livre audio : bouton « Lire le livre » vers le livre (et le lecteur WolfFlix).
   · Lecteur audio WolfFlix : barre en bas de l'écran qui reste ouverte d'une page à l'autre
     et continue écran éteint ou onglet en arrière-plan (commandes sur l'écran verrouillé).
     Reprise là où tu t'étais arrêté, vitesse, minuterie de sommeil, chapitres, pistes suivantes.
   · La position est envoyée à Jellyfin : « Continuer l'écoute », « vu » et « Mon suivi » fonctionnent.
   Les films et séries gardent le lecteur de Jellyfin. */
(function () {
    'use strict';
    if (window.__wfAudio) return;
    window.__wfAudio = true;

    var html = document.documentElement;
    var TICKS = 10000000;
    var CLE_ETAT = 'wf-audio-etat';
    var CLE_VITESSE = 'wf-audio-vitesse';

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
    function element(id) {
        return window.WolfFlix && window.WolfFlix.element ? window.WolfFlix.element(id) : api().getItem(uid(), id);
    }
    function lireLocal(cle, defaut) {
        try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; }
    }
    function ecrireLocal(cle, v) {
        try { if (v == null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* rien */ }
    }
    function duree(s) {
        s = Math.max(0, Math.floor(s || 0));
        var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
    }
    function toast(texte) {
        var t = document.createElement('div');
        t.className = 'wf-toast';
        t.textContent = texte;
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 3200);
    }

    /* ================= Livres ↔ livres audio ================= */
    function normaliser(t) {
        return String(t || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\((?:[^)]*(?:audio|lu par|narr|abridged|integral)[^)]*)\)|\[[^\]]*\]/g, ' ')
            .replace(/\b(livre audio|audiobook|audio book|version audio|lu par .*$|narre par .*$)\b/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    var index = null;   // promesse : { oeuvres: [ { cle, nom, n, pistes: [id], image: {id, tag} } ] }
    function indexAudio() {
        if (index) return index;
        index = json('Users/' + uid() + '/Items', {
            IncludeItemTypes: 'AudioBook', Recursive: true, Fields: 'ParentId,SortName', SortBy: 'SortName',
            EnableUserData: false, ImageTypeLimit: 1, EnableImageTypes: 'Primary'
        }).then(function (r) {
            var items = r.Items || [];
            var parDossier = {};
            items.forEach(function (i) { (parDossier[i.ParentId] = parDossier[i.ParentId] || []).push(i); });
            var dossiers = Object.keys(parDossier).filter(function (p) { return parDossier[p].length > 1; });
            var noms = dossiers.length ? json('Users/' + uid() + '/Items', { Ids: dossiers.join(','), EnableUserData: false, ImageTypeLimit: 1, EnableImageTypes: 'Primary' })
                .then(function (d) { return d.Items || []; }).catch(function () { return []; }) : Promise.resolve([]);
            return noms.then(function (ds) {
                var infos = {};
                ds.forEach(function (d) { infos[d.Id] = d; });
                var oeuvres = [];
                Object.keys(parDossier).forEach(function (p) {
                    var l = parDossier[p];
                    if (l.length > 1) {
                        var d = infos[p] || { Name: l[0].Name };
                        oeuvres.push({
                            cle: p, nom: d.Name, n: normaliser(d.Name), pistes: l.map(function (i) { return i.Id; }),
                            image: d.ImageTags && d.ImageTags.Primary ? { id: p, tag: d.ImageTags.Primary } : (l[0].ImageTags && l[0].ImageTags.Primary ? { id: l[0].Id, tag: l[0].ImageTags.Primary } : null)
                        });
                    } else {
                        oeuvres.push({ cle: l[0].Id, nom: l[0].Name, n: normaliser(l[0].Name), pistes: [l[0].Id], image: l[0].ImageTags && l[0].ImageTags.Primary ? { id: l[0].Id, tag: l[0].ImageTags.Primary } : null });
                    }
                });
                return { oeuvres: oeuvres };
            });
        });
        index.catch(function () { index = null; });
        setTimeout(function () { index = null; }, 600000);
        return index;
    }
    function correspond(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        var court = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
        return court.length >= 8 && (long.indexOf(court + ' ') === 0 || long.indexOf(' ' + court) === long.length - court.length - 1);
    }
    function audioDuLivre(livre) {
        var n = normaliser(livre.Name);
        return indexAudio().then(function (ix) {
            return ix.oeuvres.filter(function (o) { return correspond(o.n, n); })[0] || null;
        });
    }
    var livresParNom = {};
    function livreDeAudio(nom) {
        var n = normaliser(nom);
        if (!livresParNom[n]) {
            livresParNom[n] = json('Users/' + uid() + '/Items', {
                IncludeItemTypes: 'Book', Recursive: true, searchTerm: nom.replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 60), Limit: 20, EnableUserData: false, EnableImages: false
            }).then(function (r) {
                return (r.Items || []).filter(function (b) { return correspond(normaliser(b.Name), n); })[0] || null;
            }).catch(function () { return null; });
        }
        return livresParNom[n];
    }
    function oeuvreDe(item) {
        // L'œuvre (fichier seul ou dossier de pistes) d'un livre audio ou d'un dossier
        return indexAudio().then(function (ix) {
            return ix.oeuvres.filter(function (o) { return o.cle === item.Id || o.pistes.indexOf(item.Id) !== -1; })[0] || null;
        });
    }

    /* ================= Boutons sur les fiches ================= */
    function bouton(cls, icone, texte, titre) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wf-btn-infos ' + cls;
        b.title = titre;
        b.innerHTML = '<span class="material-icons ' + icone + '" aria-hidden="true"></span><span class="wf-btn-infos-texte">' + esc(texte) + '</span>';
        return b;
    }
    // Jellyfin redessine parfois les boutons de la fiche : on remet le nôtre tant qu'il manque
    var faits = {};        // id → 'en-cours' | fonction qui crée le bouton | null (rien à ajouter)
    function fiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || !api()) return;
        var id = m[1];
        var p = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons');
        if (!p || p.offsetParent === null) return;
        var deja = p.querySelector('.wf-btn-ecouter, .wf-btn-lire-livre');
        if (deja && deja.getAttribute('data-id') === id) return;
        if (deja) deja.remove();
        if (faits[id] === 'en-cours' || faits[id] === null) return;
        if (typeof faits[id] === 'function') { poser(p, faits[id](), id); return; }
        faits[id] = 'en-cours';
        element(id).then(function (item) {
            if (item.Type === 'Book') {
                return audioDuLivre(item).then(function (o) {
                    if (!o) return null;
                    return function () {
                        var b = bouton('wf-btn-ecouter', 'headphones', 'Écouter', 'Écouter le livre audio');
                        b.addEventListener('click', function () { ecouterOeuvre(o, item.Id); });
                        return b;
                    };
                });
            }
            if (item.Type === 'AudioBook' || item.Type === 'Folder') {
                return oeuvreDe(item).then(function (o) {
                    if (!o) return null;
                    return livreDeAudio(o.nom).then(function (livre) {
                        if (!livre) return null;
                        return function () {
                            var b = bouton('wf-btn-lire-livre', 'menu_book', 'Lire le livre', 'Ouvrir le livre « ' + livre.Name + ' »');
                            b.addEventListener('click', function () {
                                if (window.WolfFlix && window.WolfFlix.lire) {
                                    window.WolfFlix.lire(livre.Id).then(function (ok) { if (!ok) location.hash = '#/details?id=' + livre.Id; });
                                } else location.hash = '#/details?id=' + livre.Id;
                            });
                            return b;
                        };
                    });
                });
            }
            return null;
        }).then(function (f) {
            faits[id] = f || null;
            var p2 = document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons');
            if (f && p2) poser(p2, f(), id);
        }).catch(function () { delete faits[id]; });
    }
    function poser(p, b, id) {
        b.setAttribute('data-id', id);
        var ref = p.querySelector('.wf-btn-infos:not(.wf-btn-ecouter):not(.wf-btn-lire-livre)');
        if (ref) p.insertBefore(b, ref); else p.appendChild(b);
    }

    /* ================= Lecteur ================= */
    var L = {
        audio: null, barre: null, pistes: [], i: 0, item: null, livre: null, session: '',
        dernierEnvoi: 0, minuterie: null, finMinuterie: 0, modeMinuterie: '', demarre: false
    };
    function source(id) {
        var a = api();
        return url('Audio/' + id + '/universal', {
            UserId: uid(), DeviceId: a.deviceId ? a.deviceId() : 'wolfflix', MaxStreamingBitrate: 140000000,
            Container: 'mp3,m4a,m4b,aac,flac,ogg,oga,opus,webma,webm,wav', TranscodingContainer: 'mp3', TranscodingProtocol: 'http',
            AudioCodec: 'mp3', PlaySessionId: L.session, api_key: a.accessToken ? a.accessToken() : '', EnableRedirection: true, EnableRemoteMedia: false
        });
    }
    function envoyer(chemin, corps) {
        var a = api();
        if (!a) return;
        a.ajax({ type: 'POST', url: url(chemin), data: JSON.stringify(corps), contentType: 'application/json' }).catch(function () { /* sans gravité */ });
    }
    function rapport(type) {
        if (!L.item || !L.audio) return;
        var pos = Math.round((L.audio.currentTime || 0) * TICKS);
        var corps = {
            ItemId: L.item.Id, MediaSourceId: L.item.Id, PlaySessionId: L.session, PositionTicks: pos,
            IsPaused: L.audio.paused, CanSeek: true, PlayMethod: 'DirectPlay', PlaybackRate: L.audio.playbackRate
        };
        if (type === 'debut') envoyer('Sessions/Playing', corps);
        else if (type === 'fin') envoyer('Sessions/Playing/Stopped', corps);
        else envoyer('Sessions/Playing/Progress', corps);
        L.dernierEnvoi = Date.now();
        memoriser();
    }
    function memoriser() {
        if (!L.item) return;
        ecrireLocal(CLE_ETAT, { u: uid(), pistes: L.pistes, i: L.i, pos: L.audio ? L.audio.currentTime : 0, livre: L.livre });
    }
    function image(o) {
        return o ? url('Items/' + o.id + '/Images/Primary', { tag: o.tag, maxHeight: 300, quality: 90 }) : '';
    }

    function construireBarre() {
        if (L.barre) return;
        var b = document.createElement('div');
        b.id = 'wf-audio';
        b.innerHTML =
            '<div class="wf-au-progres"><input type="range" min="0" max="1000" value="0" aria-label="Position"></div>' +
            '<div class="wf-au-ligne">' +
            '<span class="wf-au-image"></span>' +
            '<div class="wf-au-infos"><b class="wf-au-titre"></b><small class="wf-au-sous"></small><small class="wf-au-temps">0:00 / 0:00</small></div>' +
            '<div class="wf-au-commandes">' +
            '<button type="button" data-a="prec" aria-label="Piste ou chapitre précédent"><span class="material-icons skip_previous"></span></button>' +
            '<button type="button" data-a="moins" aria-label="Reculer de 15 secondes"><span class="material-icons replay_10"></span></button>' +
            '<button type="button" data-a="lecture" class="wf-au-principal" aria-label="Lecture / pause"><span class="material-icons play_arrow"></span></button>' +
            '<button type="button" data-a="plus" aria-label="Avancer de 30 secondes"><span class="material-icons forward_30"></span></button>' +
            '<button type="button" data-a="suiv" aria-label="Piste ou chapitre suivant"><span class="material-icons skip_next"></span></button>' +
            '</div>' +
            '<div class="wf-au-options">' +
            '<select data-a="vitesse" aria-label="Vitesse">' + [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map(function (v) {
                return '<option value="' + v + '">' + String(v).replace('.', ',') + '×</option>';
            }).join('') + '</select>' +
            '<select data-a="sommeil" aria-label="Minuterie de sommeil"><option value="">Minuterie</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 h</option><option value="chapitre">Fin du chapitre</option><option value="piste">Fin de la piste</option></select>' +
            '<button type="button" data-a="chapitres" aria-label="Chapitres" hidden><span class="material-icons list"></span></button>' +
            '<button type="button" data-a="livre" aria-label="Lire le livre" hidden><span class="material-icons menu_book"></span></button>' +
            '<button type="button" data-a="fermer" aria-label="Fermer le lecteur audio"><span class="material-icons close"></span></button>' +
            '</div></div>' +
            '<div class="wf-au-liste" hidden></div>';
        document.body.appendChild(b);
        L.barre = b;
        var a = document.createElement('audio');
        a.preload = 'auto';
        a.setAttribute('playsinline', '');
        b.appendChild(a);
        L.audio = a;
        a.playbackRate = lireLocal(CLE_VITESSE, 1) || 1;
        b.querySelector('[data-a="vitesse"]').value = String(a.playbackRate);

        a.addEventListener('timeupdate', majTemps);
        a.addEventListener('loadedmetadata', majTemps);
        a.addEventListener('play', function () { icone(); if (!L.demarre) { L.demarre = true; rapport('debut'); } else rapport(); session(); });
        a.addEventListener('pause', function () { icone(); rapport(); });
        a.addEventListener('ended', function () {
            rapport('fin');
            L.demarre = false;
            if (L.modeMinuterie === 'piste') { arreterMinuterie(); return; }
            if (L.i < L.pistes.length - 1) charger(L.i + 1, 0, true);
            else { icone(); toast('Livre audio terminé'); ecrireLocal(CLE_ETAT, null); }
        });
        a.addEventListener('error', function () {
            if (a.getAttribute('src')) toast('Lecture audio impossible pour ce fichier');
        });
        a.addEventListener('ratechange', function () { ecrireLocal(CLE_VITESSE, a.playbackRate); session(); });

        var curseur = b.querySelector('.wf-au-progres input');
        curseur.addEventListener('input', function () {
            if (a.duration) a.currentTime = curseur.value / 1000 * a.duration;
        });
        b.addEventListener('click', function (e) {
            var x = e.target.closest('[data-a]');
            if (!x || x.tagName === 'SELECT') {
                var ch = e.target.closest('[data-chapitre]');
                if (ch) { a.currentTime = +ch.getAttribute('data-chapitre'); b.querySelector('.wf-au-liste').hidden = true; }
                return;
            }
            var act = x.getAttribute('data-a');
            if (act === 'lecture') { if (a.paused) a.play().catch(function () {}); else a.pause(); }
            else if (act === 'moins') a.currentTime = Math.max(0, a.currentTime - 15);
            else if (act === 'plus') a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 30);
            else if (act === 'suiv') suivant();
            else if (act === 'prec') precedent();
            else if (act === 'fermer') fermer();
            else if (act === 'chapitres') { var l = b.querySelector('.wf-au-liste'); l.hidden = !l.hidden; if (!l.hidden) listeChapitres(); }
            else if (act === 'livre' && L.livre) {
                if (window.WolfFlix && window.WolfFlix.lire) window.WolfFlix.lire(L.livre).then(function (ok) { if (!ok) location.hash = '#/details?id=' + L.livre; });
                else location.hash = '#/details?id=' + L.livre;
            }
        });
        b.querySelector('[data-a="vitesse"]').addEventListener('change', function (e) { a.playbackRate = +e.target.value || 1; });
        b.querySelector('[data-a="sommeil"]').addEventListener('change', function (e) { minuterie(e.target.value); });

        setInterval(function () {
            if (L.item && !a.paused && Date.now() - L.dernierEnvoi > 10000) rapport();
            if (L.finMinuterie && Date.now() >= L.finMinuterie) { a.pause(); arreterMinuterie(); }
            if (L.modeMinuterie === 'chapitre' && L.finChapitre != null && a.currentTime >= L.finChapitre) { a.pause(); arreterMinuterie(); }
        }, 1000);
        window.addEventListener('pagehide', function () { if (L.item) { rapport(a.paused ? 'progres' : 'progres'); memoriser(); } });

        if ('mediaSession' in navigator) {
            var ms = navigator.mediaSession;
            var gestion = {
                play: function () { a.play().catch(function () {}); },
                pause: function () { a.pause(); },
                seekbackward: function (d) { a.currentTime = Math.max(0, a.currentTime - ((d && d.seekOffset) || 15)); },
                seekforward: function (d) { a.currentTime = a.currentTime + ((d && d.seekOffset) || 30); },
                seekto: function (d) { if (d && d.seekTime != null) a.currentTime = d.seekTime; },
                previoustrack: precedent,
                nexttrack: suivant
            };
            Object.keys(gestion).forEach(function (k) { try { ms.setActionHandler(k, gestion[k]); } catch (e) { /* non géré */ } });
        }
    }
    function icone() {
        var i = L.barre && L.barre.querySelector('.wf-au-principal .material-icons');
        if (!i) return;
        var lecture = !L.audio.paused;
        i.className = 'material-icons ' + (lecture ? 'pause' : 'play_arrow');
        L.barre.classList.toggle('wf-au-joue', lecture);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = lecture ? 'playing' : 'paused';
    }
    function chapitres() { return (L.item && L.item.Chapters) || []; }
    function chapitreCourant() {
        var t = L.audio.currentTime, c = chapitres(), k = -1;
        for (var n = 0; n < c.length; n++) if (c[n].StartPositionTicks / TICKS <= t + 0.5) k = n;
        return k;
    }
    function majTemps() {
        var a = L.audio;
        var d = a.duration || (L.item && L.item.RunTimeTicks / TICKS) || 0;
        L.barre.querySelector('.wf-au-temps').textContent = duree(a.currentTime) + ' / ' + duree(d) +
            (a.playbackRate !== 1 && d ? ' · reste ' + duree((d - a.currentTime) / a.playbackRate) : '');
        var c = L.barre.querySelector('.wf-au-progres input');
        if (document.activeElement !== c) c.value = d ? Math.round(a.currentTime / d * 1000) : 0;
        var k = chapitreCourant();
        var sous = (L.pistes.length > 1 ? 'Piste ' + (L.i + 1) + '/' + L.pistes.length : '') +
            (k >= 0 && chapitres()[k].Name ? (L.pistes.length > 1 ? ' · ' : '') + chapitres()[k].Name : '');
        var s = L.barre.querySelector('.wf-au-sous');
        if (s.textContent !== sous) s.textContent = sous;
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d && isFinite(d)) {
            try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(a.currentTime, d), playbackRate: a.playbackRate }); } catch (e) { /* rien */ }
        }
    }
    function session() {
        if (!('mediaSession' in navigator) || !L.item) return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: L.titre || L.item.Name,
                artist: (L.item.AlbumArtist || (L.item.Artists || [])[0] || ''),
                album: L.pistes.length > 1 ? L.item.Name : '',
                artwork: L.image ? [{ src: L.image, sizes: '300x450' }] : []
            });
        } catch (e) { /* ancien navigateur */ }
    }
    function listeChapitres() {
        var l = L.barre.querySelector('.wf-au-liste');
        var c = chapitres(), k = chapitreCourant();
        l.innerHTML = c.map(function (x, n) {
            var t = x.StartPositionTicks / TICKS;
            return '<button type="button" data-chapitre="' + t + '"' + (n === k ? ' class="wf-actif"' : '') + '><span>' + esc(x.Name || 'Chapitre ' + (n + 1)) + '</span><small>' + duree(t) + '</small></button>';
        }).join('');
    }
    function suivant() {
        var c = chapitres(), k = chapitreCourant();
        if (c.length > 1 && k < c.length - 1) { L.audio.currentTime = c[k + 1].StartPositionTicks / TICKS; return; }
        if (L.i < L.pistes.length - 1) { rapport('fin'); L.demarre = false; charger(L.i + 1, 0, !L.audio.paused); }
    }
    function precedent() {
        var c = chapitres(), k = chapitreCourant();
        if (L.audio.currentTime > 5 && (c.length < 2 || L.audio.currentTime - c[Math.max(0, k)].StartPositionTicks / TICKS > 5)) {
            L.audio.currentTime = c.length > 1 && k >= 0 ? c[k].StartPositionTicks / TICKS : 0;
            return;
        }
        if (c.length > 1 && k > 0) { L.audio.currentTime = c[k - 1].StartPositionTicks / TICKS; return; }
        if (L.i > 0) { rapport('fin'); L.demarre = false; charger(L.i - 1, 0, !L.audio.paused); }
    }
    function minuterie(v) {
        arreterMinuterie(true);
        if (!v) return;
        L.modeMinuterie = v;
        if (/^\d+$/.test(v)) L.finMinuterie = Date.now() + v * 60000;
        else if (v === 'chapitre') {
            var c = chapitres(), k = chapitreCourant();
            L.finChapitre = c.length > 1 && k < c.length - 1 ? c[k + 1].StartPositionTicks / TICKS : (L.audio.duration || 1e9) - 0.3;
        }
        toast(v === 'chapitre' ? 'Arrêt à la fin du chapitre' : v === 'piste' ? 'Arrêt à la fin de la piste' : 'Arrêt dans ' + v + ' min');
    }
    function arreterMinuterie(silence) {
        L.finMinuterie = 0;
        L.finChapitre = null;
        L.modeMinuterie = '';
        if (L.barre) L.barre.querySelector('[data-a="sommeil"]').value = '';
        void silence;
    }

    function charger(i, position, jouer) {
        L.i = i;
        var id = L.pistes[i];
        return json('Users/' + uid() + '/Items/' + id, { Fields: 'Chapters' }).catch(function () { return element(id); }).then(function (item) {
            L.item = item;
            L.session = Math.random().toString(36).slice(2) + Date.now().toString(36);
            L.demarre = false;
            var pos = position;
            if (pos == null) {
                var ud = item.UserData || {};
                pos = !ud.Played && ud.PlaybackPositionTicks ? ud.PlaybackPositionTicks / TICKS : 0;
            }
            L.barre.querySelector('.wf-au-titre').textContent = L.titre || item.Name;
            var tag = item.ImageTags && item.ImageTags.Primary;
            if (tag) L.image = image({ id: item.Id, tag: tag });
            L.barre.querySelector('.wf-au-image').style.backgroundImage = L.image ? 'url("' + L.image + '")' : '';
            L.barre.querySelector('[data-a="chapitres"]').hidden = (item.Chapters || []).length < 2;
            L.barre.querySelector('.wf-au-liste').hidden = true;
            var a = L.audio;
            a.src = source(id);
            var poser = function () {
                a.removeEventListener('loadedmetadata', poser);
                if (pos > 1) { try { a.currentTime = pos; } catch (e) { /* flux transcodé : début */ } }
                majTemps();
            };
            a.addEventListener('loadedmetadata', poser);
            a.playbackRate = lireLocal(CLE_VITESSE, 1) || 1;
            session();
            memoriser();
            if (jouer) a.play().catch(function () { icone(); });
            icone();
        });
    }
    function ouvrir(pistes, depart, options) {
        options = options || {};
        if (!pistes.length || !api()) return;
        construireBarre();
        if (L.item && !L.audio.paused) rapport('fin');
        L.pistes = pistes;
        L.livre = options.livre || null;
        L.titre = options.titre || '';
        L.image = options.image || '';
        L.barre.querySelector('[data-a="livre"]').hidden = !L.livre;
        html.classList.add('wf-audio-ouvert');
        L.barre.hidden = false;
        return charger(depart || 0, options.position, options.jouer !== false);
    }
    function fermer() {
        if (L.item) { L.audio.pause(); rapport('fin'); }
        L.audio.removeAttribute('src');
        L.audio.load();
        L.item = null;
        L.barre.hidden = true;
        html.classList.remove('wf-audio-ouvert');
        ecrireLocal(CLE_ETAT, null);
        if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) { /* rien */ } }
    }

    // Une œuvre : on reprend à la première piste pas encore finie (ou entamée)
    function ecouterOeuvre(o, livreId) {
        json('Users/' + uid() + '/Items', { Ids: o.pistes.join(','), EnableUserData: true, EnableImages: false, SortBy: 'SortName' }).then(function (r) {
            var parId = {};
            (r.Items || []).forEach(function (i) { parId[i.Id] = i; });
            var depart = 0;
            for (var k = 0; k < o.pistes.length; k++) {
                var ud = (parId[o.pistes[k]] || {}).UserData || {};
                if (!ud.Played) { depart = k; break; }
                if (k === o.pistes.length - 1) depart = 0;
            }
            ouvrir(o.pistes, depart, { livre: livreId || null, titre: o.pistes.length > 1 ? o.nom : '', image: image(o.image) });
        });
    }
    function ecouterItem(id) {
        return element(id).then(function (item) {
            return oeuvreDe(item).then(function (o) {
                var pistes = o ? o.pistes : [id];
                return livreDeAudio(o ? o.nom : item.Name).then(function (livre) {
                    var depart = Math.max(0, pistes.indexOf(id));
                    ouvrir(pistes, depart, { livre: livre && livre.Id, titre: o && o.pistes.length > 1 ? o.nom : '', image: o ? image(o.image) : '' });
                    return true;
                });
            });
        }).catch(function () { return false; });
    }
    window.WolfFlix = window.WolfFlix || {};
    window.WolfFlix.ecouter = ecouterItem;

    /* ================= Interception de « Lecture » pour les livres audio ================= */
    var typesFiches = {};
    function memoriserFiche() {
        var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
        if (!m || typesFiches[m[1]] || !api()) return;
        typesFiches[m[1]] = 'en-cours';
        element(m[1]).then(function (it) {
            typesFiches[m[1]] = it.Type;
            if (it.Type === 'Folder') oeuvreDe(it).then(function (o) { if (o && o.cle === it.Id) typesFiches[m[1]] = 'DossierAudio'; });
        }).catch(function () { delete typesFiches[m[1]]; });
    }
    document.addEventListener('click', function (e) {
        if (!e.target.closest || !api()) return;
        var b = e.target.closest('.mainDetailButtons .btnPlay, .mainDetailButtons .btnResume, .mainDetailButtons .btnReplay');
        if (b) {
            var m = /^#\/details\?(?:[^#]*&)?id=([0-9a-f]{32})/i.exec(location.hash || '');
            var t = m && typesFiches[m[1]];
            if (t === 'AudioBook' || t === 'DossierAudio') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (t === 'DossierAudio') indexAudio().then(function (ix) {
                    var o = ix.oeuvres.filter(function (x) { return x.cle === m[1]; })[0];
                    if (o) livreDeAudio(o.nom).then(function (l) { ecouterOeuvre(o, l && l.Id); });
                });
                else ecouterItem(m[1]);
            }
            return;
        }
        var bc = e.target.closest('[data-action="play"], [data-action="resume"]');
        var carte = bc && bc.closest('[data-type="AudioBook"][data-id]');
        if (carte) {
            e.preventDefault();
            e.stopImmediatePropagation();
            ecouterItem(carte.getAttribute('data-id'));
        }
    }, true);

    /* ================= Reprise après rechargement de la page ================= */
    function reprendre() {
        var s = lireLocal(CLE_ETAT, null);
        if (!s || !s.pistes || !s.pistes.length || !api() || s.u !== uid()) return;
        indexAudio().then(function (ix) {
            var o = ix.oeuvres.filter(function (x) { return x.pistes.indexOf(s.pistes[0]) !== -1; })[0];
            ouvrir(s.pistes, s.i || 0, { livre: s.livre, titre: o && o.pistes.length > 1 ? o.nom : '', image: o ? image(o.image) : '', position: s.pos || 0, jouer: false });
        }).catch(function () { /* rien */ });
    }

    var repris = false;
    function passer() {
        if (!api()) return;
        if (!repris) { repris = true; reprendre(); }
        memoriserFiche();
        fiche();
    }
    window.addEventListener('wf-route', passer);
    if (window.WolfFlix && window.WolfFlix.abonner) window.WolfFlix.abonner(passer);
    passer();
})();
