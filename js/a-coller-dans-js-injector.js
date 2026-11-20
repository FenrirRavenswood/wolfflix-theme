/* WolfFlix — chargeur du module « cœur »
   À coller dans : Tableau de bord → JS Injector → Add Script (nom : WolfFlix — cœur)
   Pour changer de version, ne modifier que le numéro ci-dessous. */
(function () {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/FenrirRavenswood/wolfflix-theme@v0.3.1/js/wolfflix-core.js';
    s.defer = true;
    document.head.appendChild(s);
})();
