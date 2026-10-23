const { supabaseUrl, supabaseAnonKey } = window.TAROT_CONFIG;
const db = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
const $ = (id) => document.getElementById(id);
const msg = (s) => ($("notice").textContent = s);
let rewards = [];
async function check() {
  const {
    data: { user },
  } = await db.auth.getUser();
  let allowed = false;
  if (user) {
    const { data } = await db
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!data;
  }
  $("login").classList.toggle("hidden", allowed);
  $("dashboard").classList.toggle("hidden", !allowed);
  if (allowed) await refresh();
  else if (user) msg("This account is not authorized as an admin.");
}
$("signin").onclick = async () => {
  const { error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });
  if (error) msg(error.message);
  else {
    msg("Signed in.");
    await check();
  }
};
$("signout").onclick = async () => {
  await db.auth.signOut();
  await check();
  msg("Signed out.");
};
async function upload(file) {
  if (!file) return null;
  if (file.type !== "image/png" || file.size > 5 * 1024 * 1024)
    throw Error("Choose a PNG under 5 MB.");
  const path = `${crypto.randomUUID()}.png`;
  const { error } = await db.storage
    .from("tarot-rewards")
    .upload(path, file, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return path;
}
$("add").onclick = async () => {
  try {
    const name = $("rewardName").value.trim(),
      amount = Number($("amount").value),
      weight = Number($("weight").value);
    if (
      !name ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      !Number.isInteger(weight) ||
      weight < 0 ||
      weight > 100000
    )
      throw Error("Check reward name, amount and weight.");
    msg("Saving…");
    const image_path = await upload($("image").files[0]);
    const { error } = await db
      .from("rewards")
      .insert({ name, amount, weight, image_path });
    if (error) throw error;
    $("rewardName").value = "";
    $("image").value = "";
    msg("Reward added!");
    await refresh();
  } catch (e) {
    msg(e.message);
  }
};
async function refresh() {
  const [rr, dd] = await Promise.all([
    db.from("rewards").select("*").order("created_at", { ascending: false }),
    db
      .from("draws")
      .select("browser_id,username,draw_day,reward_name,reward_amount")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (rr.error || dd.error) {
    msg(rr.error?.message || dd.error?.message);
    return;
  }
  rewards = rr.data;
  const today = new Date().toISOString().slice(0, 10);
  $("stats").textContent = `Recent records shown: ${ dd.data.length } (max 100) · Today among these: ${ dd.data.filter((d) => d.draw_day === today).length }`;
  const tbody = $("history");
  tbody.replaceChildren();
  dd.data.forEach((d) => {
    const tr = document.createElement("tr");
    [
      d.browser_id ? d.browser_id.slice(0, 8) + "…" : d.username || "Legacy",
      d.draw_day,
      d.reward_name,
      d.reward_amount,
    ].forEach((v) => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    });
    tbody.append(tr);
  });
  const list = $("rewards");
  list.replaceChildren();
  const total = rewards
    .filter((r) => r.active)
    .reduce((n, r) => n + r.weight, 0);
  rewards.forEach((r) => {
    const wrap = document.createElement("div");
    wrap.className = "reward-row";
    const title = document.createElement("strong");
    title.textContent = `${r.name} · ${r.amount} Tarot · ${ total && r.active ? ((100 * r.weight) / total).toFixed(1) : 0 }%`;
    const fields = document.createElement("div");
    fields.className = "edit-fields";
    const weight = document.createElement("input");
    weight.type = "number";
    weight.min = "0";
    weight.max = "100000";
    weight.value = r.weight;
    weight.setAttribute("aria-label", `Weight for ${r.name}`);
    const active = document.createElement("input");
    active.type = "checkbox";
    active.checked = r.active;
    active.setAttribute("aria-label", `Active ${r.name}`);
    const save = document.createElement("button");
    save.textContent = "Save weight / active";
    save.onclick = async () => {
      const n = Number(weight.value);
      if (!Number.isInteger(n) || n < 0 || n > 100000) {
        msg("Invalid weight");
        return;
      }
      const { error } = await db
        .from("rewards")
        .update({ weight: n, active: active.checked })
        .eq("id", r.id);
      if (error) msg(error.message);
      else {
        msg("Saved");
        await refresh();
      }
    };
    const imageInput = document.createElement("input");
    imageInput.type = "file";
    imageInput.accept = "image/png";
    imageInput.setAttribute("aria-label", `Replace image for ${r.name}`);
    const replace = document.createElement("button");
    replace.textContent = "Upload PNG";
    replace.onclick = async () => {
      try {
        if (!imageInput.files[0]) throw Error("Choose a PNG first.");
        const path = await upload(imageInput.files[0]);
        const { error } = await db
          .from("rewards")
          .update({ image_path: path })
          .eq("id", r.id);
        if (error) throw error;
        msg("Image updated");
        await refresh();
      } catch (e) {
        msg(e.message);
      }
    };
    fields.append(weight, active, save, imageInput, replace);
    wrap.append(title, fields);
    list.append(wrap);
  });
}
check();
