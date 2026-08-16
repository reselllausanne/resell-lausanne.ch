(function () {
  const root = document.querySelector('.rl-faq-page');
  if (!root) return;

  const faqBaseUrl = root.dataset.faqUrl || '/pages/faq';
  const headerTitle = root.querySelector('.rl-faq-page__header h1');
  const defaultTitle = headerTitle ? headerTitle.textContent.trim() : 'FAQ';

  const categories = [
    { id: 'faq-livraison', slug: 'livraison' },
    { id: 'faq-authenticite', slug: 'authenticite' },
    { id: 'faq-echanges-et-retours', slug: 'echanges-et-retours' },
    { id: 'faq-prix-et-reductions', slug: 'prix-et-reductions' },
    { id: 'faq-a-propos-de-nous', slug: 'a-propos-de-nous' },
    { id: 'faq-guide-des-tailles', slug: 'guide-des-tailles' },
    { id: 'faq-options-de-paiement', slug: 'options-de-paiement' },
  ];

  function resolveCategoryLabel(category) {
    if (!category) return 'FAQ';
    const sectionHeading = root.querySelector(`#${category.id} h2`);
    if (sectionHeading && sectionHeading.textContent.trim()) return sectionHeading.textContent.trim();
    const sidebarLink = root.querySelector(`.rl-faq-page__sidebar-link[data-category="${category.slug}"]`);
    if (sidebarLink && sidebarLink.textContent.trim()) return sidebarLink.textContent.trim();
    return category.slug || 'FAQ';
  }

  function resolveCategoryId() {
    const preset = root.dataset.activeCategory;
    if (preset) {
      const match = categories.find((c) => c.slug === preset);
      if (match) return match.id;
    }

    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) return hash;

    const params = new URLSearchParams(window.location.search);
    const queryCategory = params.get('category');
    if (queryCategory) {
      const match = categories.find((c) => c.slug === queryCategory);
      if (match) return match.id;
    }

    const path = window.location.pathname;
    if (path.includes('livraison')) return 'faq-livraison';

    return null;
  }

  function setBreadcrumbTrail(categoryLabel) {
    const faqItem = root.querySelector('.rl-faq-page__breadcrumb-faq');
    const categoryItem = root.querySelector('.rl-faq-page__breadcrumb-category');
    const faqLabel = defaultTitle && defaultTitle.trim() ? defaultTitle.trim() : 'FAQ';
    if (!faqItem || !categoryItem) return;

    if (!categoryLabel) {
      faqItem.textContent = faqLabel;
      categoryItem.hidden = true;
      categoryItem.textContent = '';
      return;
    }

    faqItem.innerHTML = `<a class="breadcrumbs__link link" href="${faqBaseUrl}">${faqLabel}</a>`;
    categoryItem.textContent = categoryLabel;
    categoryItem.hidden = false;
  }

  function applyCategory(categoryId) {
    const category = categories.find((c) => c.id === categoryId);
    const sections = root.querySelectorAll('.rl-faq-page__category');
    const navLinks = root.querySelectorAll('.rl-faq-page__sidebar-link');

    if (!categoryId || !category) {
      root.classList.remove('rl-faq-page--category-focus');
      if (headerTitle) headerTitle.textContent = defaultTitle;
      sections.forEach((section) => section.classList.remove('is-hidden'));
      navLinks.forEach((link) => link.classList.remove('is-active'));
      setBreadcrumbTrail(null);
      return;
    }

    const categoryLabel = resolveCategoryLabel(category);
    root.classList.add('rl-faq-page--category-focus');
    if (headerTitle) headerTitle.textContent = `${defaultTitle} — ${categoryLabel}`;
    setBreadcrumbTrail(categoryLabel);

    sections.forEach((section) => {
      section.classList.toggle('is-hidden', section.id !== categoryId);
    });

    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.category === category.slug);
    });

    const activeSection = document.getElementById(categoryId);
    if (activeSection) {
      window.requestAnimationFrame(() => {
        activeSection.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }

  root.querySelectorAll('.rl-faq-page__sidebar-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      const slug = link.dataset.category;
      if (!slug) return;
      event.preventDefault();
      const match = categories.find((c) => c.slug === slug);
      if (!match) return;
      const nextUrl = `${faqBaseUrl}?category=${slug}`;
      window.history.pushState({}, '', `${nextUrl}#${match.id}`);
      applyCategory(match.id);
    });
  });

  window.addEventListener('popstate', () => applyCategory(resolveCategoryId()));
  window.addEventListener('hashchange', () => applyCategory(resolveCategoryId()));

  applyCategory(resolveCategoryId());
})();
