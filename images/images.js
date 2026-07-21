import { SJNA } from "../assets/lib/sjna.js";

const galleryGrid = document.getElementById("galleryGrid");
const tagFilterBar = document.getElementById("tagFilterBar");

if (!galleryGrid) {
  throw new Error("Gallery container not found: #galleryGrid");
}

let imageData = []; // Speichert alle Bilder
let selectedTags = new Set(); // Speichert ausgewählte Filter-Tags
let currentLightboxIndex = 0; // Index des aktuell angezeigten Bildes im Lightbox

async function loadImages() {
  const manifestUrl = "../assets/pictures/manifest.sjna";
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error("Could not load image manifest");
  }

  const text = await response.text();
  const doc = SJNA.parse(text);
  const config = SJNA.asConfig(doc);

  const imageList = config.getKeys().reverse();

  if (!imageList || imageList.length === 0) {
    galleryGrid.innerHTML = '<div class="gallery-empty">Noch keine Bilder vorhanden.</div>';
    return;
  }

  // Alle Bilder und Tags sammeln
  const allTags = new Set();
  imageData = [];

  imageList.forEach((imageKey) => {
    const tags = config.getList(imageKey + ".tags") || [];
    tags.forEach((tag) => allTags.add(tag));

    imageData.push({
      key: imageKey,
      title: config.getString(imageKey + ".title", ""),
      file: config.getString(imageKey + ".file", ""),
      date: config.getString(imageKey + ".date", ""),
      tags: tags,
      width: config.getNumber(imageKey + ".width", null),
      height: config.getNumber(imageKey + ".height", null)
    });
  });

  // Tag-Filter-Buttons erstellen
  if (tagFilterBar && allTags.size > 0) {
    const filterDiv = document.createElement("div");
    filterDiv.className = "tag-filter-buttons";
    filterDiv.innerHTML = '<button class="tag-btn tag-btn-all active" data-tag="all">Alle</button>';

    allTags.forEach((tag) => {
      const btn = document.createElement("button");
      btn.className = "tag-btn";
      btn.textContent = tag;
      btn.setAttribute("data-tag", tag);
      btn.addEventListener("click", () => {
        toggleTagFilter(tag, btn);
      });
      filterDiv.appendChild(btn);
    });

    tagFilterBar.appendChild(filterDiv);

    // "Alle" Button Handler
    document.querySelector(".tag-btn-all").addEventListener("click", function () {
      selectedTags.clear();
      document.querySelectorAll(".tag-btn").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      renderGallery();
    });
  }

  // Lightbox erstellen
  createLightbox();

  // Galerie rendern
  renderGallery();
}

function toggleTagFilter(tag, button) {
  // Entferne "Alle" Button Aktiv-Status beim Filtern
  document.querySelector(".tag-btn-all")?.classList.remove("active");

  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
    button.classList.remove("active");
  } else {
    selectedTags.add(tag);
    button.classList.add("active");
  }

  if (selectedTags.size === 0) {
    document.querySelector(".tag-btn-all")?.classList.add("active");
  }

  renderGallery();
}

function createLightbox() {
  // Prüfe ob Lightbox bereits existiert
  if (document.getElementById("lightbox")) return;

  const lightbox = document.createElement("div");
  lightbox.id = "lightbox";
  lightbox.className = "lightbox";
  lightbox.innerHTML = `
    <div class="lightbox-content">
      <button class="lightbox-close">&times;</button>
      <button class="lightbox-prev">&#10094;</button>
      <img class="lightbox-image" src="" alt="" />
      <button class="lightbox-next">&#10095;</button>
      <div class="lightbox-info">
        <div class="lightbox-title"></div>
        <div class="lightbox-date"></div>
        <div class="lightbox-tags"></div>
      </div>
    </div>
  `;
  document.body.appendChild(lightbox);

  // Event Listener für Lightbox
  const closeBtn = lightbox.querySelector(".lightbox-close");
  const prevBtn = lightbox.querySelector(".lightbox-prev");
  const nextBtn = lightbox.querySelector(".lightbox-next");

  closeBtn.addEventListener("click", closeLightbox);
  prevBtn.addEventListener("click", showPrevImage);
  nextBtn.addEventListener("click", showNextImage);

  // Lightbox schließen wenn außen geklickt wird
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  // ESC-Taste zum Schließen
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("active")) {
      closeLightbox();
    }
    if (e.key === "ArrowLeft" && lightbox.classList.contains("active")) {
      showPrevImage();
    }
    if (e.key === "ArrowRight" && lightbox.classList.contains("active")) {
      showNextImage();
    }
  });
}

function openLightbox(index) {
  const lightbox = document.getElementById("lightbox");
  const filteredData = getFilteredImages();

  // Finde Index im gefilterten Array
  currentLightboxIndex = index;

  const image = filteredData[currentLightboxIndex];
  if (!image) return;

  const imgElement = lightbox.querySelector(".lightbox-image");
  const titleElement = lightbox.querySelector(".lightbox-title");
  const dateElement = lightbox.querySelector(".lightbox-date");
  const tagsElement = lightbox.querySelector(".lightbox-tags");

  imgElement.src = "../assets/pictures/" + image.file;
  imgElement.alt = image.title;
  titleElement.textContent = image.title;
  dateElement.textContent = image.date;

  if (image.tags.length > 0) {
    tagsElement.innerHTML = image.tags.map((t) => `<span class="tag">${t}</span>`).join("");
  } else {
    tagsElement.innerHTML = "";
  }

  lightbox.classList.add("active");
  document.body.style.overflow = "hidden"; // Verhindere Scrollen
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  lightbox.classList.remove("active");
  document.body.style.overflow = "auto";
}

function showNextImage() {
  const filteredData = getFilteredImages();
  currentLightboxIndex = (currentLightboxIndex + 1) % filteredData.length;
  openLightbox(currentLightboxIndex);
}

function showPrevImage() {
  const filteredData = getFilteredImages();
  currentLightboxIndex = (currentLightboxIndex - 1 + filteredData.length) % filteredData.length;
  openLightbox(currentLightboxIndex);
}

function getFilteredImages() {
  if (selectedTags.size === 0) {
    return imageData;
  }
  return imageData.filter((image) =>
    image.tags.some((tag) => selectedTags.has(tag))
  );
}

function renderGallery() {
  galleryGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const filteredData = getFilteredImages();

  filteredData.forEach((image, index) => {
    const card = document.createElement("div");
    card.className = "gallery-card";
    const file = "../assets/pictures/" + image.file;

    // Aspect Ratio berechnen
    let aspectRatioStyle = "";
    if (image.width && image.height) {
      const aspectRatio = image.width / image.height;
      aspectRatioStyle = `style="aspect-ratio: ${aspectRatio}"`;
    }

    // Tags HTML generieren
    let tagsHtml = "";
    if (image.tags.length > 0) {
      const tagSpans = image.tags.map((t) => `<span class="tag">${t}</span>`).join("");
      tagsHtml = `<div class="gallery-card-tags">${tagSpans}</div>`;
    }

    card.innerHTML = `
      <div class="gallery-image-container" ${aspectRatioStyle}>
        <img src="${encodeURI(file)}" alt="${image.title}" />
      </div>
      <div class="gallery-card-body">
        <div class="gallery-card-title">${image.title}</div>
        <div class="gallery-card-date">${image.date}</div>
        ${tagsHtml}
      </div>
    `;

    // Klick-Event zum Öffnen der Lightbox
    card.addEventListener("click", () => {
      openLightbox(index);
    });

    fragment.appendChild(card);
  });

  galleryGrid.appendChild(fragment);
}

// Bilder laden wenn Script ausgeführt wird
loadImages().catch((err) => {
  console.error("Error loading images:", err);
  galleryGrid.innerHTML = '<div class="gallery-empty">Fehler beim Laden der Bilder.</div>';
});