(function () {
  const mode = sessionStorage.getItem('mode');
  if (!mode) {
    sessionStorage.setItem('mode', 'dark');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const toc = document.getElementById('toc');
  if (!toc) return;

  // TOC 내부 스크롤 강제 조정 차단
  toc.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      e.stopPropagation();
    }
  }, true);
});
