const $ = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll(".tarot-card")];
const say = (s) => ($("notice").textContent = s);
let db,
  browserId,
  busy = false,
  finished = false;
function getBrowserId() {
  let id = localStorage.getItem("daily_tarot_browser_id_v2");
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    id = crypto.randomUUID();
    localStorage.setItem("daily_tarot_browser_id_v2", id);
  }
  return id;
}
function imgUrl(path) {
  return path
    ? db.storage.from("tarot-rewards").getPublicUrl(path).data.publicUrl
    : "";
}
function display(data, chosen) {
  finished = true;
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === chosen) b.classList.add("flipped");
  });
  const result = $("result");
  result.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = data.already_drawn
    ? "Todayâ€™s reward"
    : "Your reward!";
  result.append(heading);
  if (data.image_path) {
    const img = document.createElement("img");
    img.src = imgUrl(data.image_path);
    img.alt = data.reward_name;
    result.append(img);
  }
  const reward = document.createElement("p");
  reward.className = "reward";
  reward.textContent = `${data.reward_name} â€” ${data.amount} Tarot ðŸ‚¡`;
  result.append(reward);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = `Your next draw is after 00:00 UTC. Day: ${data.day}`;
  result.append(note);
}
async function draw(i) {
  if (busy || finished) return;
  busy = true;
  buttons.forEach((b) => (b.disabled = true));
  say("The cards are revealing your fateâ€¦");
  try {
    const { data, error } = await db.rpc("daily_tarot_draw", {
      p_browser_id: browserId,
    });
    if (error) throw error;
    display(data, i);
    say(
      data.already_drawn
        ? "You already drew today."
        : "Your reward has been saved!"
    );
  } catch (e) {
    say("Unable to draw: " + (e.message || "Try again."));
    buttons.forEach((b) => (b.disabled = false));
  } finally {
    busy = false;
  }
}
async function init() {
  buttons.forEach((b) => (b.disabled = true));
  try {
    const cfg = window.TAROT_CONFIG;
    if (
      !cfg ||
      cfg.supabaseUrl.includes("YOUR-PROJECT") ||
      cfg.supabaseAnonKey.includes("PASTE_")
    )
      throw Error(
        "First edit config.js with your Supabase URL and publishable key."
      );
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    browserId = getBrowserId();
    const { data, error } = await db.rpc("daily_tarot_status", {
      p_browser_id: browserId,
    });
    if (error) throw error;
    if (data.already_drawn) {
      display(data, -1);
      say("You have already drawn today. Come back after the UTC reset!");
    } else {
      buttons.forEach((b) => (b.disabled = false));
      say("Pick one card to reveal your reward!");
    }
  } catch (e) {
    say("Setup or connection error: " + (e.message || "Unknown error"));
  }
}
buttons.forEach((b, i) => b.addEventListener("click", () => draw(i)));
init();
