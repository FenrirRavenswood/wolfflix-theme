/* WolfFlix — « Santé du serveur » (#/home?wf=sante), administrateurs seulement.
   Données : extension WolfFlix 0.7+ (bilan toutes les 6 heures, ou à la demande).
     · alertes : dossiers disparus des bibliothèques (avec la date) ;
     · place sur chaque disque ;
     · à réencoder en priorité (gros fichiers non HEVC) et gain estimé ;
     · affiches manquantes, titres non identifiés, doublons, films sans VF ;
     · journal d'activité (0.8+) : lectures en cours et passées, qui transcode et pourquoi. */
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


    /* ---------- Journal d'activité ---------- */
    // Raisons de transcodage de Jellyfin → français, avec la piste à suivre
    var RAISONS = {
        ContainerNotSupported: ['Conteneur non lu par l\'appareil', 'Souvent l\'AVI ou le MKV sur un navigateur : le MKV passe mieux dans l\'application Jellyfin.'],
        VideoCodecNotSupported: ['Codec vidéo non lu par l\'appareil', 'HEVC / AV1 sur un appareil ou un navigateur qui ne le décode pas.'],
        AudioCodecNotSupported: ['Codec audio non lu par l\'appareil', 'DTS, TrueHD ou E-AC3 : seul l\'audio est converti, c\'est léger.'],
        SubtitleCodecNotSupported: ['Sous-titres à incruster dans l\'image', 'PGS / VobSub (images) ou ASS : choisir une piste SRT ou couper les sous-titres évite de recoder la vidéo.'],
        AudioIsExternal: ['Piste audio externe', 'Un fichier audio à côté de la vidéo doit être fusionné.'],
        SecondaryAudioNotSupported: ['Piste audio secondaire refusée', 'L\'appareil ne sait lire que la première piste audio.'],
        VideoProfileNotSupported: ['Profil vidéo non pris en charge', 'Ex. HEVC Main 10 sur un appareil limité au Main.'],
        VideoLevelNotSupported: ['Niveau vidéo trop élevé pour l\'appareil', ''],
        VideoResolutionNotSupported: ['Résolution trop haute pour l\'appareil', '4K sur un écran ou un appareil qui ne la gère pas.'],
        VideoBitDepthNotSupported: ['Vidéo 10 bits non gérée', ''],
        VideoFramerateNotSupported: ['Fréquence d\'images non gérée', ''],
        RefFramesNotSupported: ['Trop d\'images de référence', ''],
        AnamorphicVideoNotSupported: ['Vidéo anamorphique', ''],
        InterlacedVideoNotSupported: ['Vidéo entrelacée', ''],
        AudioChannelsNotSupported: ['Trop de canaux audio', '5.1 / 7.1 ramené en stéréo pour l\'appareil.'],
        AudioProfileNotSupported: ['Profil audio non pris en charge', ''],
        AudioSampleRateNotSupported: ['Fréquence audio non gérée', ''],
        AudioBitDepthNotSupported: ['Profondeur audio non gérée', ''],
        ContainerBitrateExceedsLimit: ['Débit au-dessus de la limite', 'Qualité réglée trop bas dans le lecteur, ou limite de débit à distance de l\'utilisateur (Tableau de bord › Utilisateurs / Lecture › Streaming).'],
        VideoBitrateNotSupported: ['Débit vidéo trop élevé pour l\'appareil', ''],
        AudioBitrateNotSupported: ['Débit audio trop élevé pour l\'appareil', ''],
        UnknownVideoStreamInfo: ['Flux vidéo mal identifié', 'Relancer l\'analyse du fichier peut aider.'],
        UnknownAudioStreamInfo: ['Flux audio mal identifié', ''],
        DirectPlayError: ['Échec de la lecture directe', 'L\'appareil a essayé puis abandonné : Jellyfin a basculé sur le transcodage.'],
        VideoRangeTypeNotSupported: ['HDR / Dolby Vision non géré', 'Converti en SDR (tone mapping), c\'est le plus gourmand.'],
        VideoCodecTagNotSupported: ['Variante du codec vidéo non gérée', 'Ex. Dolby Vision profil 5 ou HEVC « hev1 ».'],
        StreamCountExceedsLimit: ['Trop de pistes dans le fichier', '']
    };
    var METHODES = { DirectPlay: ['Lecture directe', 'wf-sa-direct'], DirectStream: ['Direct (remballé)', 'wf-sa-remballe'], Transcode: ['Transcodé', 'wf-sa-transcode'] };
    function raisons(v) {
        if (!v) return [];
        if (typeof v === 'string') v = v.split(',');
        return v.map(function (x) { return String(x).trim(); }).filter(function (x) { return x && x !== '0'; });
    }
    function raisonFr(r) { return (RAISONS[r] || [r])[0]; }
    function pastilleMethode(m) {
        var x = METHODES[m] || [m || '?', ''];
        return '<span class="wf-sa-methode ' + x[1] + '">' + esc(x[0]) + '</span>';
    }
    function debit(b) { return b ? (b / 1e6).toFixed(1).replace('.', ',') + ' Mb/s' : ''; }
    function duree(min) { return min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') : min + ' min'; }
    function quand(d) {
        var t = new Date(d), auj = new Date();
        var h = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (t.toDateString() === auj.toDateString()) return 'Aujourd\'hui ' + h;
        auj.setDate(auj.getDate() - 1);
        if (t.toDateString() === auj.toDateString()) return 'Hier ' + h;
        return t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + h;
    }

    // Lectures en cours (sessions Jellyfin, rafraîchies toutes les 10 s)
    function enCours(el) {
        var zone = el.querySelector('.wf-sa-direct-live');
        if (!zone) return;
        json('Sessions', { ActiveWithinSeconds: 960 }).then(function (ss) {
            var lect = (ss || []).filter(function (s) { return s.NowPlayingItem; });
            if (!lect.length) { zone.innerHTML = '<p class="wf-vide">Personne ne regarde quoi que ce soit en ce moment.</p>'; return; }
            zone.innerHTML = lect.map(function (s) {
                var i = s.NowPlayingItem, t = s.TranscodingInfo, ps = s.PlayState || {};
                var trans = t && (t.IsVideoDirect === false || t.IsAudioDirect === false);
                var m = trans ? 'Transcode' : ps.PlayMethod;
                var titre = i.Type === 'Episode' ? (i.SeriesName || '') + ' — S' + String(i.ParentIndexNumber || 0).padStart(2, '0') + 'E' + String(i.IndexNumber || 0).padStart(2, '0') : i.Name;
                var pc = i.RunTimeTicks ? Math.round((ps.PositionTicks || 0) / i.RunTimeTicks * 100) : 0;
                var rs = trans ? raisons(t.TranscodeReasons) : [];
                return '<div class="wf-sa-live' + (trans ? ' wf-sa-live-trans' : '') + '">' +
                    '<div class="wf-sa-live-tete"><b>' + esc(s.UserName || '?') + '</b>' + pastilleMethode(m) + (ps.IsPaused ? '<span class="wf-sa-pause">en pause</span>' : '') + '</div>' +
                    '<a href="' + lien(i.Id) + '">' + esc(titre) + '</a>' +
                    '<small>' + esc([s.Client, s.DeviceName, s.RemoteEndPoint].filter(Boolean).join(' · ')) + '</small>' +
                    (trans ? '<small class="wf-sa-flux">' + esc([t.IsVideoDirect ? 'vidéo directe' : 'vidéo → ' + (t.VideoCodec || '?').toUpperCase() + (t.Height ? ' ' + t.Height + 'p' : ''),
                        t.IsAudioDirect ? 'audio direct' : 'audio → ' + (t.AudioCodec || '?').toUpperCase() + (t.AudioChannels ? ' ' + t.AudioChannels + ' can.' : ''),
                        debit(t.Bitrate), !t.IsVideoDirect ? (t.HardwareAccelerationType && t.HardwareAccelerationType !== 'none' ? 'GPU ' + t.HardwareAccelerationType : 'processeur') : ''].filter(Boolean).join(' · ')) + '</small>' : '') +
                    (rs.length ? '<ul class="wf-sa-raisons">' + rs.map(function (r) { return '<li>' + esc(raisonFr(r)) + '</li>'; }).join('') + '</ul>' : '') +
                    '<div class="wf-sa-jauge"><span style="width:' + pc + '%"></span></div></div>';
            }).join('');
        }, function () { zone.innerHTML = '<p class="wf-vide">Sessions indisponibles.</p>'; });
    }

    var filtre = { jours: 30, qui: '', trans: false };
    var journalCache = null;
    function rendreJournal(el) {
        var zone = el.querySelector('.wf-sa-histo');
        if (!zone || !journalCache) return;
        var tout = journalCache;
        var gens = {};
        tout.forEach(function (l) { gens[l.Utilisateur] = 1; });
        var sel = el.querySelector('[data-filtre="qui"]');
        if (sel) {
            sel.innerHTML = '<option value="">Tout le monde</option>' + Object.keys(gens).sort().map(function (g) {
                return '<option value="' + esc(g) + '"' + (g === filtre.qui ? ' selected' : '') + '>' + esc(g) + '</option>';
            }).join('');
        }
        var vues = tout.filter(function (l) { return !filtre.qui || l.Utilisateur === filtre.qui; });
        var trans = vues.filter(function (l) { return l.Methode === 'Transcode'; });
        // Résumé : part de transcodage, raisons les plus fréquentes, qui transcode le plus
        var parRaison = {}, parQui = {};
        trans.forEach(function (l) {
            (l.Raisons || []).forEach(function (r) { parRaison[r] = (parRaison[r] || 0) + 1; });
            parQui[l.Utilisateur + ' · ' + (l.Client || l.Appareil)] = (parQui[l.Utilisateur + ' · ' + (l.Client || l.Appareil)] || 0) + 1;
        });
        var top = Object.keys(parRaison).sort(function (a, b) { return parRaison[b] - parRaison[a]; }).slice(0, 5);
        var topQui = Object.keys(parQui).sort(function (a, b) { return parQui[b] - parQui[a]; }).slice(0, 4);
        var pc = vues.length ? Math.round(trans.length / vues.length * 100) : 0;
        var out = '<div class="wf-sa-resume">' +
            '<div><b>' + vues.length + '</b><span>lectures</span></div>' +
            '<div><b>' + trans.length + '</b><span>transcodées (' + pc + ' %)</span></div>' +
            '<div><b>' + duree(vues.reduce(function (s, l) { return s + (l.Minutes || 0); }, 0)) + '</b><span>de visionnage</span></div></div>';
        if (top.length) {
            out += '<div class="wf-sa-pourquoi"><h3>Pourquoi ça transcode</h3><ul>' + top.map(function (r) {
                var x = RAISONS[r] || [r, ''];
                return '<li><b>' + parRaison[r] + '×</b> ' + esc(x[0]) + (x[1] ? '<small>' + esc(x[1]) + '</small>' : '') + '</li>';
            }).join('') + '</ul>' +
                '<h3>Qui transcode le plus</h3><ul>' + topQui.map(function (q) { return '<li><b>' + parQui[q] + '×</b> ' + esc(q) + '</li>'; }).join('') + '</ul></div>';
        }
        var lignes = filtre.trans ? trans : vues;
        out += !lignes.length ? '<p class="wf-vide">Aucune lecture notée sur cette période.</p>' :
            '<ul class="wf-sa-journal">' + lignes.slice(0, 300).map(function (l) {
                var rs = l.Raisons || [];
                return '<li class="' + (l.Methode === 'Transcode' ? 'wf-sa-l-trans' : '') + '">' +
                    '<time>' + quand(l.Debut) + '</time>' +
                    '<div class="wf-sa-l-corps"><div class="wf-sa-l-tete"><b>' + esc(l.Utilisateur) + '</b>' + pastilleMethode(l.Methode) +
                    '<a href="' + lien(l.ItemId) + '">' + esc(l.Titre) + '</a></div>' +
                    '<small>' + esc([l.Client, l.Appareil, l.Ip, duree(l.Minutes || 0) + (l.Fini ? ' · terminé' : '')].filter(Boolean).join(' · ')) + '</small>' +
                    (l.Methode === 'Transcode' ? '<small class="wf-sa-flux">' + esc([l.Video && 'Vidéo : ' + l.Video, l.Audio && 'Audio : ' + l.Audio,
                        l.SousTitres && 'Sous-titres : ' + l.SousTitres, debit(l.Debit), l.Materiel].filter(Boolean).join(' · ')) + '</small>' : '') +
                    (rs.length ? '<ul class="wf-sa-raisons">' + rs.map(function (r) { return '<li>' + esc(raisonFr(r)) + '</li>'; }).join('') + '</ul>' : '') +
                    '</div></li>';
            }).join('') + '</ul>' + (lignes.length > 300 ? '<p class="wf-aide">300 plus récentes affichées sur ' + lignes.length + '.</p>' : '');
        zone.innerHTML = out;
    }
    function chargerJournal(el) {
        var zone = el.querySelector('.wf-sa-histo');
        if (!zone) return;
        json('WolfFlix/Journal', { jours: filtre.jours }).then(function (l) {
            journalCache = l || [];
            rendreJournal(el);
        }, function (x) {
            zone.innerHTML = '<p class="wf-vide">' + (x && x.status === 404 ? 'Le journal demande l\'extension WolfFlix 0.8 ou plus récente.' : 'Journal indisponible.') + '</p>';
        });
    }
    function sectionJournal() {
        return '<section class="wf-sa-jsection padded-left padded-right">' +
            '<h2 class="wf-sa-titre">En cours maintenant</h2><div class="wf-sa-direct-live"><p class="wf-vide">Chargement…</p></div>' +
            '<h2 class="wf-sa-titre">Journal d\'activité</h2>' +
            '<div class="wf-sa-filtres">' +
            '<select data-filtre="jours"><option value="1">24 heures</option><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="365">1 an</option></select>' +
            '<select data-filtre="qui"><option value="">Tout le monde</option></select>' +
            '<label><input type="checkbox" data-filtre="trans"> Seulement les transcodages</label></div>' +
            '<div class="wf-sa-histo"><p class="wf-vide">Chargement…</p></div>' +
            '<p class="wf-aide">Noté par l\'extension à la fin de chaque lecture (les aperçus de moins d\'une minute en lecture directe sont ignorés). Les 3000 dernières lectures sont gardées.</p></section>';
    }

    /* ---------- Page ---------- */
    var minuterie = null;
    var minuterieLive = null;
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
                clearInterval(minuterieLive);
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
            '<div class="wf-sa-corps padded-left padded-right"><p class="wf-vide">Chargement…</p></div>' + sectionJournal();
        el.addEventListener('change', function (e) {
            var f = e.target.getAttribute && e.target.getAttribute('data-filtre');
            if (f === 'jours') { filtre.jours = +e.target.value; chargerJournal(el); }
            else if (f === 'qui') { filtre.qui = e.target.value; rendreJournal(el); }
            else if (f === 'trans') { filtre.trans = e.target.checked; rendreJournal(el); }
        });
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'bilan') {
                b.disabled = true;
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/Sante/Calculer') }).catch(function () { /* rien */ }).then(function () {
                    setTimeout(function () { b.disabled = false; charger(el); chargerJournal(el); }, 1500);
                });
            } else if (act === 'lues') {
                api().ajax({ type: 'POST', url: api().getUrl('WolfFlix/Sante/AlertesLues') }).then(function () { charger(el); });
            }
        });
        charger(el);
        chargerJournal(el);
        clearInterval(minuterieLive);
        enCours(el);
        minuterieLive = setInterval(function () {
            if (!el.isConnected) { clearInterval(minuterieLive); return; }
            if (!document.hidden) enCours(el);
        }, 10000);
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
