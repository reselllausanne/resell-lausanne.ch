(() => {
  const RAIL_SELECTOR = '[data-ref="collection-plp-featured-rail"]';

  const syncFeaturedRailVisibility = () => {
    const rail = document.querySelector(RAIL_SELECTOR);
    if (!rail) return;
    const hasFilters = window.location.search.includes('filter.');
    rail.hidden = hasFilters;
  };

  document.addEventListener('filters:updated', syncFeaturedRailVisibility);
  window.addEventListener('popstate', syncFeaturedRailVisibility);
  document.addEventListener('DOMContentLoaded', syncFeaturedRailVisibility);
  document.addEventListener('rl:collection-results-updated', syncFeaturedRailVisibility);
})();
