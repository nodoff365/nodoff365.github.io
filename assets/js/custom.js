(function () {
  const mode = sessionStorage.getItem('mode');
  if (!mode) {
    sessionStorage.setItem('mode', 'dark');
  }
})();
