(function () {
  const root = document.querySelector('.rl-sg');
  if (!root) return;

  const baseUrl = root.dataset.sizeGuideUrl || '/pages/guide-des-tailles';
  const pageTitle = root.dataset.title || 'Guide des tailles';
  const titleSep = root.dataset.titleSeparator || ' — ';
  const headerTitle = root.querySelector('.rl-sg__header h1');
  const introBlock = root.querySelector('.rl-sg__intro');

  const brands = [
    { id: 'size-nike',        slug: 'nike',        label: 'Nike' },
    { id: 'size-air-jordan',  slug: 'air-jordan',  label: 'Air Jordan' },
    { id: 'size-adidas',      slug: 'adidas',      label: 'Adidas' },
    { id: 'size-new-balance', slug: 'new-balance', label: 'New Balance' },
    { id: 'size-asics',       slug: 'asics',       label: 'Asics' },
    { id: 'size-yeezy',       slug: 'yeezy',       label: 'Yeezy' },
    { id: 'size-ugg',         slug: 'ugg',         label: 'UGG' },
    { id: 'size-converse',    slug: 'converse',    label: 'Converse' },
    { id: 'size-salomon',     slug: 'salomon',     label: 'Salomon' },
    { id: 'size-puma',        slug: 'puma',        label: 'Puma' },
    { id: 'size-veja',        slug: 'veja',        label: 'Veja' },
    { id: 'size-saucony',     slug: 'saucony',     label: 'Saucony' },
    { id: 'size-essentials',  slug: 'essentials',  label: 'Essentials' },
  ];

  function resolveBrand() {
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) return hash;
    const params = new URLSearchParams(window.location.search);
    const queryBrand = params.get('brand');
    if (queryBrand) {
      const match = brands.find(b => b.slug === queryBrand);
      if (match) return match.id;
    }
    return null;
  }

  function setBreadcrumb(brandLabel) {
    const pageItem = root.querySelector('.rl-sg__breadcrumb-page');
    const brandItem = root.querySelector('.rl-sg__breadcrumb-brand');
    if (!pageItem || !brandItem) return;
    if (!brandLabel) {
      pageItem.textContent = pageTitle;
      brandItem.hidden = true;
      brandItem.textContent = '';
      return;
    }
    pageItem.innerHTML = `<a class="breadcrumbs__link link" href="${baseUrl}">${pageTitle}</a><span class="breadcrumbs__separator" aria-hidden="true"> ›</span>`;
    brandItem.textContent = brandLabel;
    brandItem.hidden = false;
  }

  function applyBrand(brandId) {
    const brand = brands.find(b => b.id === brandId);
    const sections = root.querySelectorAll('.rl-sg__brand');
    const navLinks = root.querySelectorAll('.rl-sg__nav-btn');

    if (!brandId || !brand) {
      if (headerTitle) headerTitle.textContent = pageTitle;
      if (introBlock) introBlock.style.display = '';
      sections.forEach(s => s.classList.remove('is-hidden'));
      navLinks.forEach(l => l.classList.remove('is-active'));
      setBreadcrumb(null);
      return;
    }

    if (headerTitle) headerTitle.textContent = `${pageTitle}${titleSep}${brand.label}`;
    if (introBlock) introBlock.style.display = 'none';
    setBreadcrumb(brand.label);

    sections.forEach(s => s.classList.toggle('is-hidden', s.id !== brandId));
    navLinks.forEach(l => l.classList.toggle('is-active', l.dataset.brand === brand.slug));

    const activeSection = document.getElementById(brandId);
    if (activeSection) {
      window.requestAnimationFrame(() => {
        activeSection.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }

  root.querySelectorAll('.rl-sg__nav-btn').forEach(link => {
    link.addEventListener('click', e => {
      const slug = link.dataset.brand;
      if (!slug) return;
      e.preventDefault();
      const match = brands.find(b => b.slug === slug);
      if (!match) return;
      window.history.pushState({}, '', `${baseUrl}?brand=${slug}#${match.id}`);
      applyBrand(match.id);
    });
  });

  window.addEventListener('popstate', () => applyBrand(resolveBrand()));
  window.addEventListener('hashchange', () => applyBrand(resolveBrand()));

  applyBrand(resolveBrand());
})();
