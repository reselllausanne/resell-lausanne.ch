class LocalizationFormComponent extends HTMLElement {
  constructor() {
    super();
    this.form = null;
    this.languageInput = null;
    this.countryInput = null;
    this.countryInputItems = null;
  }

  connectedCallback() {
    this.form = this.querySelector('form.localization-form');
    this.languageInput = this.querySelector('[data-ref="language-input"]');
    this.countryInput = this.querySelector('[data-ref="country-input"]');
    this.countryInputItems = this.querySelectorAll('[data-ref="country-input-item"]');

    // On écoute les changements de pays
    this.countryInputItems.forEach((countryInputItem) => {
      countryInputItem.addEventListener('click', (event) => {
        this.selectCountry(countryInputItem.dataset.value, event);
      });
    });

    // On écoute les changements de langue
    this.languageInput?.addEventListener('change', (event) => {
      this.changeLanguage(event);
    });
  }

  disconnectedCallback() {
    this.countryInputItems.forEach((countryInputItem) => {
      countryInputItem.removeEventListener('click', (event) => {
        this.selectCountry(countryInputItem.dataset.value, event);
      });
    });

    this.languageInput?.removeEventListener('change', (event) => {
      this.changeLanguage(event);
    });
  }

  selectCountry = (countryName, event) => {
    event.preventDefault();

    this.countryInput.value = countryName;
    this.form?.submit();
  };

  changeLanguage(event) {
    if (!(event.target instanceof HTMLSelectElement) || !this.form) {
      return;
    }

    this.form.submit();
  }
}

if (!customElements.get('localization-form-component')) {
  customElements.define('localization-form-component', LocalizationFormComponent);
}
