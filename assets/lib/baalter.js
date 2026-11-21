export function calc(aktuelles_bergattack, seasons_dabei, irl_alter) {
  const alle_bas = aktuelles_bergattack - 1;
  const erste_season = (aktuelles_bergattack - seasons_dabei) + 1;
  let addition = 0;

  console.log(`Erste Season: ${erste_season}`);

  let booster1 = false;

  if (seasons_dabei >= aktuelles_bergattack) {
    addition = addition * 2;
    booster1 = true;
    console.log("Boost 1");
  }

  if (erste_season < 6) {
    addition = addition + (alle_bas - erste_season);
    console.log("Boost 2");
  }

  let alter = 0;
  alter = alter + irl_alter;

  alter = alter + ((seasons_dabei / aktuelles_bergattack) * irl_alter);
  alter = alter + seasons_dabei;
  alter = alter + (addition / aktuelles_bergattack) * alter;


  if  (seasons_dabei <= 2) {
    alter = alter - 2;
  }
  let sum = alter + addition
  return Math.round(sum);
}

export const BALTER = { calc };

const aktuelles_bergattack = 6;
const seasons_dabei = 5;
const irl_alter = 14;

const baalter = calc(aktuelles_bergattack, seasons_dabei, irl_alter);
console.log(baalter);
