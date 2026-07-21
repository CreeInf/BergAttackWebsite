import { SJNA } from "../assets/lib/sjna.js";

const newsGrid = document.getElementById("newsGrid");
if (!newsGrid) {
  throw new Error("News grid element not found: #newsGrid");
}

async function loadNews() {
  const newsUrl = new URL("../assets/news.sjna", import.meta.url);
  const response = await fetch(newsUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to load news.sjna: ${response.status} ${response.statusText}`
    );
  }

  const content = await response.text();
  const doc = SJNA.parse(content);
  const config = SJNA.asConfig(doc);
  const newsKeys = config.getKeys();

  newsGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          obs.unobserve(entry.target);
        }
      }
    },
    {
      threshold: 0.1,
    }
  );

  function getString(path, fallback = "") {
    try {
      return config.getString(path, fallback);
    } catch {
      return fallback;
    }
  }

  newsKeys.forEach((title, index) => {
    const type = getString(`${title}.Type`, "");
    const body = getString(`${title}.Text`, "");
    let link = getString(`${title}.Link`, "").trim();
    if (link.toLowerCase() === "null") {
      link = "";
    }
    if (link && !/^(https?:\/\/|mailto:|tel:|\/)/i.test(link)) {
      link = `https://${link}`;
    }

    const card = document.createElement("div");
    card.className = "news-card reveal";
    card.style.transitionDelay = `${index * 0.1}s`;

    const chip = document.createElement("span");
    chip.className = "news-chip";
    chip.textContent = type || "✉️ News";

    const titleElement = document.createElement("div");
    titleElement.className = "news-card-title";
    titleElement.textContent = title;

    const bodyElement = document.createElement("div");
    bodyElement.className = "news-card-body";
    bodyElement.textContent = body;

    card.append(chip, titleElement, bodyElement);

    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.className = "news-card-link";
      anchor.appendChild(card);
      fragment.appendChild(anchor);
    } else {
      fragment.appendChild(card);
    }

    observer.observe(card);
  });

  newsGrid.appendChild(fragment);
}

loadNews().catch((error) => {
  console.error(error);

  newsGrid.textContent = "News konnten nicht geladen werden.";
});