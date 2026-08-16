/**
 * @namespace ThemeEvents
 * @description Une collection d'événements spécifiques au thème qui peuvent être utilisés pour déclencher et écouter des changements partout dans le thème.
 * @example
 * document.dispatchEvent(new VariantUpdatedEvent(variant, sectionId, { html }));
 * document.addEventListener(ThemeEvents.variantUpdated, (e) => { console.log(e.detail.variant) });
 */

export class ThemeEvents {
  static cartUpdated = 'cart:updated'; // Quand le panier est mis à jour
  static cartOpen = 'cart:open'; // Ouvre le panier
  static cartClose = 'cart:close'; // Ferme le panier
  static variantSelected = 'variant:selected'; // Quand une variante est sélectionnée
  static variantUpdated = 'variant:updated'; // Quand une variante est mise à jour
  static filtersChanged = 'filters:changed'; // Quand les filtres ou le tri sont modifiés
  static filtersUpdated = 'filters:updated'; // Quand les filtres ou le tri sont mis à jour
  static toggleCrossSellsUpdated = 'toggle-cross-sells:updated'; // Quand les cross-sells sont mis à jour
  static quantityBreaksUpdated = 'quantity-breaks:updated'; // Quand les quantités sont mises à jour
  static subscriptionUpdated = 'subscription:updated'; // Quand l'abonnement est mis à jour
  static formUpdated = 'form:updated'; // Quand le formulaire produit a fini sa mise à jour
  static wishlistUpdated = 'wishlist:updated'; // Quand la wishlist est mise à jour
  static wishlistItemAdded = 'wishlist:item-added'; // Quand un item est ajouté à la wishlist
  static wishlistItemRemoved = 'wishlist:item-removed'; // Quand un item est retiré de la wishlist
}

// Événement déclenché quand le panier est mis à jour
export class CartUpdatedEvent extends Event {
  /**
   * Crée un nouveau CartUpdatedEvent
   * @param {Object} resource - Le nouvel objet panier
   * @param {Object} [data] - Données supplémentaires de l'événement
   * @param {boolean} [data.didError] - Indique si l'opération sur le panier a échoué
   * @param {string} [data.source] - La source de la mise à jour du panier
   * @param {string} [data.productId] - L'identifiant de la fiche produit mise à jour
   * @param {number} [data.itemCount] - Le nombre d'articles dans le panier
   * @param {string} [data.variantId] - L'identifiant de la variante du produit mise à jour
   * @param {Record<string, string>} [data.sections] - Les sections affectées par l'opération sur le panier
   */
  constructor(resource, data) {
    super(ThemeEvents.cartUpdated, { bubbles: true });
    this.detail = {
      resource,
      data: {
        ...data,
      },
    };
  }
}

// Événement déclenché quand une variante est sélectionnée
export class VariantSelectedEvent extends Event {
  /**
   * Crée un nouveau VariantSelectedEvent
   * @param {Object} resource - Le nouvel objet variante
   * @param {string} resource.id - L'identifiant de la variante
   */
  constructor(resource) {
    super(ThemeEvents.variantSelected, { bubbles: true });
    this.detail = {
      resource,
    };
  }
}

// Événement déclenché après la mise à jour d'une variante
export class VariantUpdatedEvent extends Event {
  /**
   * Crée un nouveau VariantUpdatedEvent
   * @param {Object} resource - Le nouvel objet variante
   * @param {string} resource.id - L'identifiant de la variante
   * @param {boolean} resource.available - Indique si la variante est disponible
   * @param {boolean} resource.inventory_management - Indique si la variante a une gestion des stocks
   * @param {Object} [resource.featured_media] - Le média principal de la variante
   * @param {string} [resource.featured_media.id] - L'identifiant du média principal
   * @param {Object} [resource.featured_media.preview_image] - L'image d'aperçu du média principal
   * @param {string} [resource.featured_media.preview_image.src] - L'URL de l'image d'aperçu
   * @param {string} sourceId - L'identifiant de l'élément depuis lequel l'action a été déclenchée
   * @param {Object} data - Données supplémentaires de l'événement
   * @param {Document} data.html - Le nouveau fragment de document pour la variante
   * @param {string} data.productId - L'identifiant du produit de la variante mise à jour, utilisé pour s'assurer que le bon formulaire produit est mis à jour
   */
  constructor(resource, sourceId, data) {
    super(ThemeEvents.variantUpdated, { bubbles: true });
    this.detail = {
      resource: resource || null,
      sourceId,
      data: {
        html: data.html,
        productId: data.productId,
      },
    };
  }
}

// Événement déclenché quand les filtres ou le tri sont modifiés
export class FiltersChangedEvent extends Event {
  /**
   * Crée un nouveau FiltersChangedEvent
   * @param {string} filter_params - Les paramètres de filtre
   * @param {string} sorting_params - Les paramètres de tri
   */
  constructor(filter_params, sorting_params) {
    super(ThemeEvents.filtersChanged, { bubbles: true });
    this.detail = {
      filter_params,
      sorting_params,
    };
  }
}

// Événement déclenché après la mise à jour des filtres ou du tri
export class FiltersUpdatedEvent extends Event {
  // Crée un nouveau FiltersUpdatedEvent
  constructor() {
    super(ThemeEvents.filtersUpdated, { bubbles: true });
  }
}

// Événement déclenché après la mise à jour des cross-sells à activer
export class ToggleCrossSellsUpdatedEvent extends Event {
  // Crée un nouveau ToggleCrossSellsUpdatedEvent
  constructor() {
    super(ThemeEvents.toggleCrossSellsUpdated, { bubbles: true });
  }
}

// Événement déclenché après la mise à jour du composant Réductions par quantité
export class QuantityBreaksUpdatedEvent extends Event {
  // Crée un nouveau QuantityBreaksUpdatedEvent
  constructor() {
    super(ThemeEvents.quantityBreaksUpdated, { bubbles: true });
  }
}

// Événement déclenché après la mise à jour du composant Abonnement
export class SubscriptionUpdatedEvent extends Event {
  // Crée un nouveau SubscriptionUpdatedEvent
  constructor() {
    super(ThemeEvents.subscriptionUpdated, { bubbles: true });
  }
}

// Événement déclenché après la mise à jour complète du formulaire produit (prix calculés)
export class FormUpdatedEvent extends Event {
  /**
   * Crée un nouveau FormUpdatedEvent
   * @param {Object} prices - Les prix calculés du formulaire
   * @param {number} prices.price - Le prix total
   * @param {number} prices.compare_at_price - Le prix barré total
   * @param {number} prices.difference_price - La différence de prix
   */
  constructor(prices) {
    super(ThemeEvents.formUpdated, { bubbles: true });
    this.detail = { prices };
  }
}

// Événement déclenché quand la wishlist est mise à jour
export class WishlistUpdatedEvent extends Event {
  /**
   * Crée un nouveau WishlistUpdatedEvent
   * @param {Array} items - Le tableau des items de la wishlist
   * @param {number} count - Le nombre d'items dans la wishlist
   */
  constructor(items, count) {
    super(ThemeEvents.wishlistUpdated, { bubbles: true });
    this.detail = {
      items,
      count,
    };
  }
}

// Événement déclenché quand un item est ajouté à la wishlist
export class WishlistItemAddedEvent extends Event {
  /**
   * Crée un nouveau WishlistItemAddedEvent
   * @param {Object} item - L'item ajouté à la wishlist
   * @param {string} item.productId - L'identifiant du produit
   * @param {string} item.title - Le titre du produit
   * @param {string} [item.handle] - Le handle du produit
   * @param {string} [item.url] - L'URL du produit
   * @param {string} [item.imageUrl] - L'URL de l'image du produit
   */
  constructor(item) {
    super(ThemeEvents.wishlistItemAdded, { bubbles: true });
    this.detail = {
      item,
    };
  }
}

// Événement déclenché quand un item est retiré de la wishlist
export class WishlistItemRemovedEvent extends Event {
  /**
   * Crée un nouveau WishlistItemRemovedEvent
   * @param {string} productId - L'identifiant du produit retiré
   */
  constructor(productId) {
    super(ThemeEvents.wishlistItemRemoved, { bubbles: true });
    this.detail = {
      productId,
    };
  }
}

export default ThemeEvents;
