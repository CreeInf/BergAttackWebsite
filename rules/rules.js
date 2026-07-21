import { SJNA } from "../assets/lib/sjna.js";

const sjnaUrl = new URL("../assets/rules.sjna", import.meta.url);
const response = await fetch(sjnaUrl);

if (!response.ok) {
  throw new Error(`Failed to load SJNA file: ${response.status} ${response.statusText}`);
}

const text = await response.text();
const doc = SJNA.parse(text);
const config = SJNA.asConfig(doc);

const ruleTopics = config.getKeys();
const rulesContainer = document.querySelector("#rulesContainer") ?? document.body;

for (const topic of ruleTopics) {
    let ruleCounter = 1;
    const topicCard = document.createElement("div");
    topicCard.classList.add("rule-topic");
    topicCard.innerHTML = `<h2>${topic.replace("_"," ")}</h2>`;

    const rules = config.getList(topic);

    for (const rule of rules) {
        const ruleDiv = document.createElement("div");
        ruleDiv.classList.add("rule");
        ruleDiv.innerHTML = `<p><span class="rule-number">§${ruleCounter++}</span>${rule.replace("//", "<br/>")}</p>`;
        topicCard.appendChild(ruleDiv);
    }

    rulesContainer.appendChild(topicCard);
}