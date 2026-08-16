/**
 * Build rich blog HTML using Resell article CSS classes (resell-blog.css).
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {{ label: string, items: string[] }} block */
export function takeaways({ label, items }) {
  const lis = items.map((t) => `<li>${t}</li>`).join("");
  return `<div class="resell-article__takeaways"><p class="resell-article__takeaways-label">${esc(label)}</p><ul>${lis}</ul></div>`;
}

/** @param {"tip"|"auth"|"warning"} variant @param {string} text */
export function callout(variant, text) {
  const labels = { tip: "Conseil", auth: "Authenticité", warning: "Attention" };
  return `<div class="resell-article__callout resell-article__callout--${variant}"><p class="resell-article__callout-label">${labels[variant] || "Note"}</p><p>${text}</p></div>`;
}

/** @param {{ src: string, alt: string, caption?: string }} fig */
export function figure({ src, alt, caption }) {
  const cap = caption
    ? `<figcaption class="resell-article__figure-caption">${esc(caption)}</figcaption>`
    : "";
  return `<figure class="resell-article__figure"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" width="1200" height="800">${cap}</figure>`;
}

/**
 * @param {{ title: string, url: string, products: Array<{ title: string, url: string, image: string, alt: string, price: string }> }} opts
 */
export function productStrip({ title, url, products }) {
  const items = products
    .map(
      (p) => `<a class="resell-article__product-strip-item" href="${esc(p.url)}">
  <span class="resell-article__product-strip-media"><img src="${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy" width="400" height="400"></span>
  <span class="resell-article__product-strip-name">${esc(p.title)}</span>
  <span class="resell-article__product-strip-price">${esc(p.price)}</span>
</a>`,
    )
    .join("");
  return `<div class="resell-article__product-strip">
  <div class="resell-article__product-strip-head">
    <p class="resell-article__product-strip-label">${esc(title)}</p>
    <a class="resell-article__product-strip-all" href="${esc(url)}">Voir toute la collection →</a>
  </div>
  <div class="resell-article__product-strip-grid">${items}</div>
</div>`;
}

/** @param {Array<{ q: string, a: string }>} items */
export function faqBlock(items) {
  return items
    .map(
      (f) => `<h3>${esc(f.q)}</h3>
<p>${f.a}</p>`,
    )
    .join("\n");
}

/**
 * Adidas Handball Spezial — first P0 blog (Ahrefs CH: adidas spezial ~7100 vol, KD 0).
 * @param {object} ctx
 * @param {Array<{ title: string, url: string, image: string, alt: string, price: string }>} ctx.products
 */
export function buildAdidasSpezialArticle(ctx) {
  const { products } = ctx;
  const collectionUrl = "https://www.resell-lausanne.ch/collections/adidas-spezial";
  const strip = products.slice(0, 4);
  const heroProduct = products[0];

  return `${takeaways({
    label: "À retenir",
    items: [
      "La Handball Spezial est une silhouette terrace / handball relancée par adidas Originals — très demandée en Suisse romande et alémanique.",
      "Fit proche de la Samba : plutôt fidèle à la pointure EU habituelle, semelle plate, pied large OK.",
      "Marché secondaire actif en CHF : coloris populaires entre ~120 et 260 CHF selon rareté.",
      "Acheter authentique = contrôle étiquette, nubuck, boîte et vendeur — Resell vérifie chaque paire avec certificat.",
    ],
  })}

<p>L'<strong>Adidas Handball Spezial</strong> est devenue l'une des sneakers les plus recherchées en Suisse en 2024–2026. Entre les coloris terrace, les relances nubuck et la hype autour des silhouettes rétro adidas, la Spezial cumule des milliers de recherches mensuelles — mais aussi beaucoup de contrefaçons sur les marketplaces. Ce guide t'explique l'histoire du modèle, les coloris qui performent en Suisse, le fit, et <strong>où acheter une paire authentique</strong> avec livraison en CHF.</p>

${callout("tip", "Tu hésites entre Spezial et Samba ? La Spezial a une forme légèrement plus longue et une semelle plus plate. Si tu es entre deux tailles en Samba, reste sur ta pointure EU en Spezial.")}

<h2>Origine : handball, terrace culture et Gary Aspden</h2>
<p>La Spezial n'est pas une « nouvelle » sneaker sortie du néant. C'est une <strong>silhouette handball des années 70–80</strong>, remise au goût du jour dans le cadre de la culture terrace et du travail de Gary Aspden sur les archives adidas Originals. Le nom « Handball Spezial » renvoie à la chaussure indoor portée sur les parquets — d'où la semelle plate, le suede (daim) résistant et la forme basse.</p>
<p>En Europe — et particulièrement en Suisse, entre influence allemande, british terrace et hype française — la Spezial s'est imposée comme alternative à la Samba et à la Gazelle : même ADN adidas, mais identité visuelle plus « chunk » et coloris souvent plus audacieux (Bleu Bliss, Marron, Vert, Rose).</p>

${figure({
  src: heroProduct.image,
  alt: heroProduct.alt,
  caption: `${heroProduct.title} — disponible sur Resell Lausanne, authentifiée et livrée en Suisse.`,
})}

<h2>Pourquoi la Spezial cartonne en Suisse</h2>
<p>Plusieurs facteurs expliquent la demande CH :</p>
<ul>
  <li><strong>Silhouette lifestyle polyvalente</strong> — bureau, week-end, soirée ; passe avec jean, cargo ou joggings.</li>
  <li><strong>Prix retail souvent sold out</strong> — le marché secondaire suisse (StockX, Vinted, boutiques) reste actif.</li>
  <li><strong>Frais d'import</strong> — acheter depuis l'étranger ajoute TVA + douane ; une boutique suisse avec prix final CHF simplifie l'achat.</li>
  <li><strong>Saisonnalité</strong> — le nubuck et les coloris earth tones (Earth Strata, Wonder Beige) matchent l'automne/hiver helvétique.</li>
</ul>

<h2>Coloris populaires en 2026</h2>
<p>Voici les familles de coloris les plus recherchées sur le marché suisse (données de demande catalogue + tendances search) :</p>
<table>
  <thead>
    <tr><th>Coloris / famille</th><th>Style</th><th>Fourchette marché CHF*</th></tr>
  </thead>
  <tbody>
    <tr><td>Earth Strata / Gum</td><td>Tons terre, semelle gomme</td><td>130 – 180</td></tr>
    <tr><td>Wonder White / Black</td><td>Classique blanc cassé</td><td>120 – 170</td></tr>
    <tr><td>Mineral Green / Collegiate Green</td><td>Vert terrace</td><td>140 – 200</td></tr>
    <tr><td>Clear Pink / Solar Orange</td><td>Accent femme / pop</td><td>110 – 160</td></tr>
    <tr><td>Aluminum / Wonder Beige</td><td>Neutre premium</td><td>150 – 220</td></tr>
  </tbody>
</table>
<p><em>*Fourchettes indicatives marché secondaire authentique en Suisse, variables selon taille et état.</em></p>

${productStrip({
  title: "Handball Spezial disponibles chez Resell",
  url: collectionUrl,
  products: strip,
})}

<h2>Spezial vs Samba vs Gazelle — lequel choisir ?</h2>
<table>
  <thead>
    <tr><th>Modèle</th><th>Forme</th><th>Semelle</th><th>Usage</th><th>Fit (EU)</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Handball Spezial</strong></td><td>Plus longue, large</td><td>Plate</td><td>Terrace / lifestyle</td><td>Fidèle</td></tr>
    <tr><td><strong>Samba</strong></td><td>Compacte</td><td>Plate</td><td>Icone lifestyle</td><td>Fidèle à -0.5 si pied fin</td></tr>
    <tr><td><strong>Gazelle</strong></td><td>Fine, basse</td><td>Plate</td><td>Rétro sport</td><td>Parfois étroit</td></tr>
  </tbody>
</table>
<p>Pour un premier achat adidas terrace en Suisse, la Spezial est idéale si tu veux un look plus « statement » que la Samba OG sans passer sur une collaboration hype.</p>

${products[1] ? figure({ src: products[1].image, alt: products[1].alt, caption: "Exemple de coloris clair — Wonder White / Black, très polyvalent." }) : ""}

<h2>Guide des tailles Spezial en Suisse</h2>
<p>La Handball Spezial taille en général <strong>fidèle à la pointure EU</strong> (Nike, New Balance EU). Quelques règles :</p>
<ul>
  <li><strong>Pied large</strong> : ta taille habituelle convient ; la toe box est généreuse.</li>
  <li><strong>Entre deux tailles</strong> : monte d'un demi-point si tu préfères les chaussettes épaisses.</li>
  <li><strong>Femme vs homme</strong> : certains coloris existent en women's sizing — vérifie l'étiquette EU à l'intérieur.</li>
</ul>
<p>Besoin d'aide ? Consulte notre <a href="https://www.resell-lausanne.ch/pages/guide-des-tailles">guide des tailles Resell</a> ou écris-nous avant commande.</p>

<h2>Où acheter authentique en Suisse</h2>
<p>Options principales pour un acheteur suisse :</p>
<ul>
  <li><strong>Boutique spécialisée suisse (Resell Lausanne)</strong> — prix final CHF, livraison 5–10 jours, contrôle authenticité, certificat, Twint / Powerpay / Alma.</li>
  <li><strong>Retail adidas CH</strong> — quand le coloris est en stock, prix retail sans marge revente.</li>
  <li><strong>Marketplaces internationales</strong> — StockX, GOAT : attention aux frais d'import, délais douane et retours compliqués.</li>
  <li><strong>Vinted / peer-to-peer</strong> — prix attractifs mais risque élevé de contrefaçon sans expertise.</li>
</ul>
${callout("auth", "Chez Resell, chaque paire Spezial passe par un contrôle en plusieurs étapes (étiquettes, coutures, boîte, odeur, comparaison batch). Tu reçois un certificat d'authenticité. <a href=\"https://www.resell-lausanne.ch/pages/notre-processus-d-authentification\">Voir notre processus →</a>")}

<h2>Reconnaître une fausse Spezial — 6 points rapides</h2>
<ol>
  <li><strong>Étiquette langue / code-barres</strong> — incohérences de pays, police floue, QR non aligné.</li>
  <li><strong>Nubuck / suede</strong> — toucher plastique, couleur uniforme sans profondeur.</li>
  <li><strong>Semelle gomme</strong> — teinte trop orange ou trop mate ; marquage adidas imprécis.</li>
  <li><strong>Forme du toe</strong> — contrefaçons souvent plus « gonflées » ou asymétriques.</li>
  <li><strong>Boîte</strong> — étiquette SKU qui ne correspond pas au coloris intérieur.</li>
  <li><strong>Prix trop bas</strong> — une Spezial neuve authentique à 60 CHF sur un site inconnu = red flag.</li>
</ol>

<h2>Entretien du nubuck en Suisse</h2>
<p>Humidité, sel de déneigement et boue — le quotidien suisse — abîment le daim. Brosse douce sèche après port, spray protecteur nubuck, évite le sèche-linge. Ne lave jamais en machine.</p>

<h2>FAQ — Adidas Spezial Suisse</h2>
${faqBlock([
  {
    q: "La Spezial est-elle vraie ou fausse sur Vinted ?",
    a: "Impossible de généraliser. Demande photos étiquette intérieure, boîte et semelle. En cas de doute, fais vérifier avant achat ou passe par un vendeur qui certifie l'authenticité.",
  },
  {
    q: "Quel délai de livraison en Suisse avec Resell ?",
    a: "Compte en général 5 à 10 jours ouvrés selon sourcing et contrôle qualité. Les délais exacts sont détaillés sur notre page livraison et FAQ.",
  },
  {
    q: "Peut-on payer en plusieurs fois ?",
    a: "Oui — Powerpay et Alma sont disponibles sur Resell Lausanne pour étaler le paiement en CHF.",
  },
  {
    q: "Spezial ou Samba pour un premier achat adidas ?",
    a: "Samba si tu veux l'icône minimaliste ; Spezial si tu préfères une forme plus large et des coloris terrace plus marqués.",
  },
  {
    q: "Proposez-vous des retours ?",
    a: "Les conditions de retour et échange sont expliquées dans notre FAQ — notamment pour les articles authentifiés et les tailles.",
  },
])}

<p>Découvre toutes nos <a href="${collectionUrl}">Adidas Handball Spezial authentiques</a>, ou parcours l'univers <a href="https://www.resell-lausanne.ch/collections/adidas">Adidas</a> sur Resell Lausanne. Questions ? <a href="https://www.resell-lausanne.ch/pages/faq">FAQ</a>.</p>`;
}
