// Shared site chrome: skip link, top navigation, footer and the "Coming soon" page body
// (owned by the frontend-engineer agent). Importing this module touches no DOM; call mountNav() from a page.

import { SITE, FOOTER, COMING_SOON, COMING_SOON_COMMON } from "../content.js";

/** Top-level pages in nav order. `page` is the id a page passes to mountNav / <body data-page>. */
export const NAV_ITEMS = [
  { page: "dashboard", label: "Dashboard", href: "./" },
  { page: "policy", label: "Policy Lab", href: "policy.html" },
  { page: "quiz", label: "Quiz", href: "quiz.html" },
  { page: "present", label: "Class Mode", href: "present.html" },
  { page: "about", label: "About", href: "./#about" },
];

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Page id for a URL path: "/" and "/index.html" -> "dashboard", "/quiz" or "/quiz.html" -> "quiz". */
export function pageFromPath(pathname = "/") {
  const last = String(pathname).split("/").pop().replace(/\.html$/, "");
  if (!last || last === "index") return "dashboard";
  return NAV_ITEMS.some((i) => i.page === last) ? last : null;
}

/**
 * Markup for the top bar. Exactly one link (the current page) gets aria-current="page".
 * "About" is a section of the dashboard, so it is never the current page.
 */
export function navHTML(current) {
  const links = NAV_ITEMS.map((item) => {
    const cur = item.page === current && item.page !== "about" ? ' aria-current="page"' : "";
    return `<li><a href="${item.href}"${cur}>${escapeHTML(item.label)}</a></li>`;
  }).join("");
  return (
    `<div class="wrap topbar-inner">` +
    `<a class="brand" href="./">${escapeHTML(SITE.name)}</a>` +
    `<nav aria-label="Main"><ul class="nav-links">${links}</ul></nav>` +
    `</div>`
  );
}

/**
 * Insert the skip link + top bar before <main> and the footer after it.
 * @param {string} [page]  current page id; defaults to <body data-page> or the URL path
 * @param {Document} [doc]
 */
export function mountNav(page, doc = document) {
  const current = page ?? doc.body.dataset.page ?? pageFromPath(doc.location?.pathname);
  const main = doc.querySelector("main");
  if (main && !main.id) main.id = "main";

  if (!doc.querySelector(".skip-link")) {
    const skip = doc.createElement("a");
    skip.className = "skip-link";
    skip.href = `#${main?.id ?? "main"}`;
    skip.textContent = "Skip to content";
    doc.body.prepend(skip);
  }

  let header = doc.querySelector("header.topbar");
  if (!header) {
    header = doc.createElement("header");
    header.className = "topbar";
    doc.querySelector(".skip-link").after(header);
  }
  header.innerHTML = navHTML(current);

  if (!doc.querySelector("footer.site-foot")) {
    const footer = doc.createElement("footer");
    footer.className = "site-foot wrap";
    footer.textContent = FOOTER;
    (main ?? header).after(footer);
  }
}

/** Markup for a "Coming soon" stub page body. */
export function comingSoonHTML(page) {
  const c = COMING_SOON[page];
  if (!c) return "";
  const items = c.bullets.map((b) => `<li>${escapeHTML(b)}</li>`).join("");
  return (
    `<section class="coming-soon">` +
    `<p class="eyebrow">${escapeHTML(COMING_SOON_COMMON.eyebrow)}</p>` +
    `<h1>${escapeHTML(c.title)}</h1>` +
    `<p class="lead">${escapeHTML(c.lead)}</p>` +
    `<ul>${items}</ul>` +
    `<p>${escapeHTML(COMING_SOON_COMMON.back)} <a href="./">${escapeHTML(COMING_SOON_COMMON.backLink)}</a></p>` +
    `</section>`
  );
}

/** Mount nav + footer and fill <main> with the "Coming soon" body for `page`. */
export function mountComingSoon(page, doc = document) {
  const main = doc.querySelector("main");
  if (main) main.innerHTML = comingSoonHTML(page);
  mountNav(page, doc);
}
