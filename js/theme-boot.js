// Aplica la paleta guardada antes de pintar la página, para que no parpadee con la de fábrica.
(function () {
  try {
    var t = localStorage.getItem('subnetpro:theme');
    if (t && /^[a-z]{3,12}$/.test(t) && t !== 'marino') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sin almacenamiento: se usa la paleta de fábrica */ }
})();
