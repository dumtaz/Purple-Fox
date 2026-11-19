/* Purple Fox: planning, AI writing (Google Gemini, free key), character and Supabase sync */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const P = () => window.PF;
const esc = s => P().esc(s);
const ROTATION = ["skit","money","work","hacks","skit","money","hacks"]; // Sun..Sat
const PILL = {money:"Money", work:"Work life", hacks:"Life hacks", skit:"Skit"};
const LOCAL = k => { try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(_){ return null; } };
const LOCALSET = (k,v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} };
const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const parseD = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const today0 = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };

/* ---------------- character ---------------- */
const CHAR_DEFAULT = {
  name:"Purple Fox",
  bio:"A young Singaporean working in HR & Finance, figuring out adulting one payslip at a time. Loves bubble tea, travel, budgeting and foxes. Goal: financial freedom and a happy life.",
  look:"young man drawn chibi anime-style with purple fox ears (white inner fur) and a big fluffy purple fox tail fading to a white tip, messy dark brown-black hair, round black glasses, big violet eyes, rosy cheeks, purple hoodie with white drawstrings, a small white fox-face logo on the chest and a white paw print on the back, sometimes wearing purple headphones with a fox logo, often with bubble tea or a fox mug and a small purple fox plushie",
  pers:"Chill, smart, curious and kind. Gets stressed about money, then figures it out. Talks in English with 华语 punchlines and light Singlish (lah, leh, sia).",
  cast:"Mama: warm Singaporean auntie in a floral blouse, short permed hair, reading glasses on a chain. Jess: confident colleague, high ponytail, oversized blazer.",
  style:"cute chibi anime-style 2D illustration, soft pastel lavender palette, clean outlines, soft shading, rounded proportions, Singapore setting details",
  neg:"no watermark, no extra fingers, no photorealism, no distorted text"
};
const OLD_LOOK = "young man drawn chibi anime-style with purple fox ears (white inner fur) and a fluffy purple fox tail with a white tip, messy dark brown-black hair, round black glasses, big violet eyes, rosy cheeks, purple hoodie with white drawstrings and a small fox logo on the chest, often holding bubble tea";
const CH = () => { const c=P().state.char; for(const k in CHAR_DEFAULT) if(c[k]==null) c[k]=CHAR_DEFAULT[k]; if(c.look===OLD_LOOK) c.look=CHAR_DEFAULT.look; return c; };
const CF = {cName:"name", cBio:"bio", cLook:"look", cPers:"pers", cCast:"cast", cStyle:"style", cNeg:"neg"};
function renderCharacter(){
  const c=CH();
  for(const id in CF) $(id).value=c[CF[id]]||"";
  $('sheetP').textContent=`Character turnaround sheet of ${c.name}: ${c.bio} Look: ${c.look}. Front view, side view, back view, plus 4 facial expressions (happy, shocked, confused, confident) and 2 poses (thumbs up, facepalm), plain light background, ${c.style}. ${c.neg}`;
}
for(const id in CF) $(id).addEventListener("input", ()=>{ CH()[CF[id]]=$(id).value; P().save(); });

/* ---------------- AI writing: Google Gemini ---------------- */
const MODELS = ["gemini-flash-latest","gemini-2.5-flash","gemini-flash-lite-latest","gemini-2.5-flash-lite"];
const aiCfg = () => Object.assign({key:"", model:"auto"}, LOCAL("pf-ai")||{});
function renderAI(){ const c=aiCfg(); $('gKey').value=c.key; $('gModel').value=c.model; aiButtons(); }
function aiButtons(){ const has=!!aiCfg().key; ["planAI","genAI","mTranslate"].forEach(id=>{ const b=$(id); if(b) b.hidden=!has; }); }
$('gKey').addEventListener("change", ()=>{ const c=aiCfg(); c.key=$('gKey').value.trim(); LOCALSET("pf-ai",c); aiButtons(); $('gMsg').textContent=c.key?"Key saved on this device.":"Key removed."; });
$('gModel').addEventListener("change", ()=>{ const c=aiCfg(); c.model=$('gModel').value; LOCALSET("pf-ai",c); });
async function askAI(prompt){
  const c=aiCfg();
  if(!c.key) throw new Error("Add your free Gemini API key in Settings first.");
  if(!navigator.onLine) throw new Error("You're offline. AI writing needs the internet; Quick template works offline.");
  const list = c.model==="auto" ? MODELS : [c.model];
  let last=null;
  for(const m of list){
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method:"POST", headers:{"Content-Type":"application/json","x-goog-api-key":c.key},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}], generationConfig:{responseMimeType:"application/json", temperature:0.9}})
    }).catch(()=>null);
    if(!r){ last=new Error("Couldn't reach Google. Check your internet and try again."); continue; }
    if(r.status===404){ last=new Error("That model isn't available for your key."); continue; }
    if(r.status===429){ throw new Error("Free limit reached for now. Wait a minute (or until tomorrow if it's the daily limit), then try again."); }
    if(r.status===400 || r.status===401 || r.status===403){ const t=await r.text(); throw new Error(/API key|API_KEY|permission/i.test(t) ? "Google rejected the API key. Copy it again from aistudio.google.com and paste it in Settings." : "Google couldn't process the request. Try again."); }
    if(!r.ok){ last=new Error("Google had a problem. Try again in a moment."); continue; }
    const j=await r.json();
    const text=((j.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("");
    if(!text){ last=new Error("The AI answer came back empty. Try again."); continue; }
    const a=text.indexOf("{"), b=text.lastIndexOf("}");
    try{ return JSON.parse(text.slice(a,b+1)); }catch(_){ last=new Error("The AI answer was cut off. Try again."); }
  }
  throw last || new Error("Something went wrong. Try again.");
}
$('gTest').addEventListener("click", async ()=>{
  $('gTest').disabled=true; $('gMsg').textContent="Testing…";
  try{ const r=await askAI('Reply with JSON only: {"ok":true,"line":"<a 6-word cheerful hello from a cartoon fox>"}'); $('gMsg').textContent = r && r.ok ? `Works! "${r.line||"Hello"}"` : "Got an unexpected answer, but the key works."; }
  catch(e){ $('gMsg').textContent=e.message; }
  finally{ $('gTest').disabled=false; }
});

/* ---------------- plan tab ---------------- */
function renderPlan(){
  const S=P().state, t=today0();
  const wkAgo=new Date(t); wkAgo.setDate(t.getDate()-6);
  const posted7=S.videos.filter(v=>v.status==="Posted" && v.date && parseD(v.date)>=wkAgo && parseD(v.date)<=t).length;
  const inProd=S.videos.filter(v=>!["Idea","Posted"].includes(v.status)).length;
  const ideas=S.videos.filter(v=>v.status==="Idea").length;
  let covered=0; for(let i=0;i<7;i++){ const d=new Date(t); d.setDate(t.getDate()+i); if(S.videos.some(v=>v.date===ymd(d))) covered++; }
  $('kpis').innerHTML=[["Posted in last 7 days",posted7,"/ 7",posted7/7],["Next 7 days planned",covered,"/ 7",covered/7],["In production",inProd,"",null],["Ideas waiting",ideas,"",null]]
    .map(([l,n,s,p])=>`<div class="card kpi"><div class="n">${n} <small>${s}</small></div><div class="l">${l}</div>${p!=null?`<div class="bar"><i style="width:${Math.round(Math.min(1,p)*100)}%"></i></div>`:""}</div>`).join("");
  let wk="";
  for(let i=0;i<7;i++){
    const d=new Date(t); d.setDate(t.getDate()+i); const s=ymd(d), p=ROTATION[d.getDay()];
    const vids=S.videos.filter(v=>v.date===s);
    wk+=`<div class="day${i===0?" today":""}"><div class="dh"><span>${d.toLocaleDateString("en-SG",{weekday:"short"})}</span><span>${d.getDate()} ${d.toLocaleDateString("en-SG",{month:"short"})}</span></div><span class="pchip p-${p}">${PILL[p]}</span>
      ${vids.length ? vids.map(v=>`<button class="vt" data-write="${v.id}">${esc(v.title||"Untitled")}</button><span class="ds">${esc(v.status)}</span>`).join("") : `<span class="empty">Nothing planned</span><button class="btn small" data-addday="${s}">Add</button>`}</div>`;
  }
  $('week').innerHTML=wk;
}
document.addEventListener("click", e=>{
  const a=e.target.closest("[data-addday]"); if(a){ P().newVideo({date:a.dataset.addday}); openWrite(); return; }
  const w=e.target.closest("[data-write]"); if(w){ P().state.sel=w.dataset.write; P().save({quiet:true}); openWrite(); return; }
  const u=e.target.closest("[data-useidea]");
  if(u){ const x=ideasCache[+u.dataset.useidea]; P().newVideo({title:x.title, date:x.date, pillar:x.pillar, storyboard:x.storyboard, status:"Storyboard"}); u.disabled=true; u.textContent="Added"; P().state.sel=null; P().save(); P().renderList(); return; }
});

let ideasCache=[];
$('planAI').addEventListener("click", async ()=>{
  const b=$('planAI'); b.disabled=true; b.textContent="Planning…"; $('planMsg').textContent="Writing 7 ideas with storyboards…";
  const S=P().state, t=today0(), slots=[];
  for(let i=0;i<21 && slots.length<7;i++){ const d=new Date(t); d.setDate(t.getDate()+i); const s=ymd(d); if(!S.videos.some(v=>v.date===s)) slots.push({date:s, pillar:ROTATION[d.getDay()]}); }
  const c=CH();
  const prompt=`You plan content for a faceless YouTube Shorts + TikTok channel about adulting life in Singapore for 20-35 year olds. Host: cartoon character ${c.name} (${c.bio}). Supporting cast: ${c.cast}. Voiceover mixes English and Mandarin (华语).
Existing video titles (do not repeat): ${S.videos.map(v=>v.title).filter(Boolean).join("; ")||"none"}.
Write one video idea for each slot below, matching the slot's pillar (money = CPF, BTO, budgeting, salary; work = office life, career, bosses, MC, OT; hacks = daily life hacks, hawker food, errands, transport; skit = relatable comedy). Each idea: a catchy title (under 60 characters) and a 4-scene storyboard of 30 seconds, one line per scene, starting "Scene 1:". Keep Singapore facts accurate.
Slots: ${JSON.stringify(slots)}
Return ONLY JSON: {"ideas":[{"date":"YYYY-MM-DD","pillar":"money|work|hacks|skit","title":"","storyboard":"Scene 1: ...\\nScene 2: ...\\nScene 3: ...\\nScene 4: ..."}]}`;
  try{
    const r=await askAI(prompt); ideasCache=(r&&r.ideas)||[];
    if(!ideasCache.length) throw new Error("No ideas came back. Try again.");
    $('ideaOut').innerHTML=ideasCache.map((x,i)=>`<div class="idea"><div class="row between"><span class="ds">${esc(P().fmtD(x.date))}</span><span class="pchip p-${esc(x.pillar)}">${esc(PILL[x.pillar]||x.pillar)}</span></div><b>${esc(x.title)}</b><div class="sbtxt">${esc(x.storyboard)}</div><button class="btn small" data-useidea="${i}">Add to plan</button></div>`).join("");
    $('planMsg').textContent="Pick the ideas you like. Each one goes into your plan on its date.";
  }catch(e){ $('planMsg').textContent=e.message; }
  finally{ b.disabled=false; b.textContent="Plan 7 ideas with AI"; }
});

/* ---------------- write tab ---------------- */
const MIX = {
  "en-led":"Mostly Singapore English with light Singlish (lah, leh, sia, can or not). Switch to Mandarin (华语, simplified Chinese characters) for punchlines and emotional reactions, about 20% of words.",
  "half":"About half Singapore English and half Mandarin (华语, simplified Chinese characters), switching naturally mid-sentence the way young Singaporeans talk.",
  "zh-led":"Mostly Mandarin (华语, simplified Chinese characters), keeping Singapore terms in English (CPF, BTO, MC, HDB, Grab, OT) and light Singlish particles.",
  "en":"All in natural Singapore English with light Singlish (lah, leh, sia). No Chinese characters at all.",
  "zh":"All in natural Mandarin (华语, simplified Chinese characters), the way young Singaporeans speak. Write Singapore terms in Chinese where natural (公积金 for CPF, 组屋 for HDB, 预购组屋 for BTO, 病假 for MC)."
};
function openWrite(){ P().showTab("write"); }
function loadWrite(){
  const v=P().cur();
  $('writeEmpty').hidden=!!v; $('writeBody').hidden=!v; if(!v) return;
  $('wTitle').value=v.title||""; $('wDate').value=v.date||""; $('wPillar').value=v.pillar||"money"; $('wLen').value=v.len||"30"; $('wMix').value=v.mix||"en-led"; $('sb').value=v.storyboard||"";
  $('genStatus').textContent = v.output.scenes.length ? `This video already has ${v.output.scenes.length} scenes. Writing again replaces them.` : "";
}
function syncWrite(){
  const v=P().cur(); if(!v) return;
  v.title=$('wTitle').value.trim(); v.date=$('wDate').value; v.pillar=$('wPillar').value; v.len=$('wLen').value; v.mix=$('wMix').value; v.storyboard=$('sb').value;
  if(v.storyboard.trim() && v.status==="Idea") v.status="Storyboard";
  P().save(); P().renderList();
}
["wTitle","wDate","wPillar","wLen","wMix","sb"].forEach(id=>$(id).addEventListener("change", syncWrite));
function buildPrompt(v){
  const c=CH();
  return `You are the head writer for a new faceless YouTube Shorts + TikTok channel about adulting life in Singapore (money: CPF, BTO, budgeting; work life and career; daily life hacks, hawker food, errands; relatable comedy skits). Audience: Singaporeans aged 20-35. Videos are vertical 9:16. The app animates the host over simple Singapore backgrounds and reads each voiceover line with text-to-speech.

HOST CHARACTER (cartoon, same in every scene):
Name: ${c.name}
Who: ${c.bio}
Look: ${c.look}
Personality: ${c.pers}
Supporting cast: ${c.cast}
Art style: ${c.style}
Avoid: ${c.neg}

LANGUAGE FOR VOICEOVER: ${MIX[v.mix]||MIX["en-led"]}

VIDEO: "${v.title||"Untitled"}" · pillar: ${PILL[v.pillar]||v.pillar} · target length ${v.len} seconds total.

STORYBOARD FROM THE CREATOR:
${v.storyboard.trim()}

TASK: Turn the storyboard into production-ready scenes. Keep the creator's scenes and order. Scene durations must add up to about ${v.len} seconds; each scene 3-10 seconds. The first line must hook within 2 seconds. Keep facts about Singapore accurate (for example CPF employee contribution is 20% for workers 55 and below); if unsure of a figure, leave it out.

For every scene give:
- shot: short scene label in English that names the setting (office, pantry, HDB, hawker centre, MRT, video call, home)
- dur: seconds (integer)
- vo: the exact voiceover line, natural to speak, about 2.5 words per second. Prefix with a name and colon only when someone other than the host speaks.
- dir: voice direction: who speaks, emotion, pace
- ost: short on-screen text (max 8 words, may use one emoji)
- img: a complete standalone image prompt for Google Gemini that restates the host's full look, action, expression, Singapore setting, framing and art style, ending with: vertical 9:16 composition.
- vid: an image-to-video prompt starting "Image-to-video, N s, 9:16." with character motion, background motion, camera move, and "Keep character design unchanged."
- sfx: sound effect and music cue
- en: the voiceover line rewritten fully in natural Singapore English (for English voice or subtitles)
- zh: the voiceover line rewritten fully in natural Mandarin, simplified Chinese characters (for 中文 voice or subtitles)

Also give: title, hook (first spoken line), yt_title (under 70 characters, may use one emoji), caption (TikTok caption under 150 characters with 1-2 hashtags), desc (2-sentence YouTube description), tags (8-10 hashtags mixing English and 中文, Singapore-specific), thumb (thumbnail prompt with big readable text), post (suggested posting time in SGT with a one-line reason).

Return ONLY valid JSON: {"title":"","hook":"","scenes":[{"shot":"","dur":0,"vo":"","dir":"","ost":"","img":"","vid":"","sfx":"","en":"","zh":""}],"yt_title":"","caption":"","desc":"","tags":[""],"thumb":"","post":""}`;
}
function applyOutput(v,o){
  v.output={title:o.title||v.title, hook:o.hook||"", scenes:(o.scenes||[]).map(s=>({sid:P().uid(), shot:s.shot||"", dur:Math.max(2,Math.min(20,+s.dur||6)), vo:s.vo||"", dir:s.dir||"", ost:s.ost||"", img:s.img||"", vid:s.vid||"", sfx:s.sfx||"", sub_en:s.en||"", sub_zh:s.zh||""})),
    yt_title:o.yt_title||v.title, caption:o.caption||"", desc:o.desc||"", tags:o.tags||[], thumb:o.thumb||"", post:o.post||""};
  if(!v.title && o.title) v.title=o.title;
  const S=P().STATUSES; if(S.indexOf(v.status)<S.indexOf("Prompts ready")) v.status="Prompts ready";
  P().save(); P().renderList(); P().openMake(); P().showTab("make");
}
$('genAI').addEventListener("click", async ()=>{
  syncWrite(); const v=P().cur(); if(!v) return;
  if(!v.storyboard.trim()){ $('genStatus').textContent="Type a storyboard first, one scene per line."; return; }
  const b=$('genAI'); b.disabled=true; b.textContent="Writing…"; $('genStatus').textContent="Writing the scenes, voiceover lines and post pack. About 20 seconds.";
  try{ const o=await askAI(buildPrompt(v)); if(!o || !Array.isArray(o.scenes) || !o.scenes.length) throw new Error("The answer came back incomplete. Try again."); applyOutput(v,o); P().toast("Scenes written. Check the lines, then Make video."); }
  catch(e){ $('genStatus').textContent=e.message; }
  finally{ b.disabled=false; b.textContent="Write scenes with AI"; }
});
$('genLocal').addEventListener("click", ()=>{
  syncWrite(); const v=P().cur(); if(!v) return;
  const lines=v.storyboard.split(/\n+/).map(l=>l.replace(/^\s*(scene\s*\d+\s*[:.\-–]|\d+[.)]|[-*•])\s*/i,"").trim()).filter(Boolean);
  if(!lines.length){ $('genStatus').textContent="Type a storyboard first, one scene per line."; return; }
  const len=+v.len||30, base=Math.max(3,Math.floor(len/lines.length));
  applyOutput(v,{title:v.title, hook:lines[0], scenes:lines.map((l,i)=>({shot:l.slice(0,60), dur:base, vo:l, ost:l.split(/\s+/).slice(0,6).join(" ")})),
    yt_title:v.title||"Adulting in Singapore", caption:(v.title||"")+" #adultingsg #singapore", desc:"Adulting in Singapore, one small lesson at a time. Follow for daily tips.", tags:["#adultingsg","#singapore","#sgtiktok","#sglife","#打工人"], post:"Weekday 7:30pm to 9pm SGT, after the commute home."});
  P().toast("Template made from your storyboard. The voice reads each line as you typed it.");
});

/* ---------------- translate lines ---------------- */
async function translateVideo(v){
  const sc=v.output.scenes.filter(s=>s.vo);
  if(!sc.length) throw new Error("Add voiceover lines first.");
  const prompt=`Rewrite each voiceover line from a Singapore "adulting" YouTube Shorts video in two versions: "en" fully in natural Singapore English (light Singlish is fine, no Chinese characters) and "zh" fully in natural Mandarin with simplified Chinese characters, the way young Singaporeans speak (use 公积金 for CPF, 组屋 for HDB, 预购组屋 for BTO, 病假 for MC). Keep the meaning, tone and jokes, and keep each version about the same length as the original so it fits the same time. If a line starts with a speaker name and colon (like "Mama:"), keep that prefix in both versions.
Lines: ${JSON.stringify(sc.map(s=>s.vo))}
Return ONLY JSON: {"lines":[{"en":"","zh":""}]} with exactly ${sc.length} items in the same order.`;
  const r=await askAI(prompt); const L=(r&&r.lines)||[];
  if(L.length!==sc.length) throw new Error("The answer didn't match the number of lines. Try again.");
  sc.forEach((s,i)=>{ s.sub_en=L[i].en||s.sub_en||""; s.sub_zh=L[i].zh||s.sub_zh||""; });
  P().save();
}

/* ---------------- Supabase sync ---------------- */
const SBV = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const sbCfg = () => Object.assign({url:"https://hwpegkfecginohkbzqbf.supabase.co", key:"sb_publishable_JeBDycRHr9QIL9Z6noub6g_NdnYlG42"}, LOCAL("pf-sync")||{});
let sb=null, sbSig="", user=null, pushT=null, syncing=false;
function syncChip(t, cls){ const c=$('syncChip'); c.textContent=t; c.className="sync "+(cls||""); }
async function client(){
  const c=sbCfg(); if(!c.url||!c.key) return null;
  if(sb && sbSig===c.url+c.key) return sb;
  if(window.__PF_SB_MOCK) { sb=window.__PF_SB_MOCK; sbSig=c.url+c.key; return sb; }
  const m=await import(SBV);
  sb=m.createClient(c.url,c.key,{auth:{persistSession:true, autoRefreshToken:true, storageKey:"pf-auth"}}); sbSig=c.url+c.key;
  sb.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_IN" && !user){ setTimeout(async()=>{ await refreshUser(); if(user){ $('sbMsg').textContent="Signed in. Syncing your plans…"; await pull(); $('sbMsg').textContent="Signed in. Plans sync automatically when you're online."; } },0); } });
  return sb;
}
async function refreshUser(){
  try{ const c=await client(); if(!c){ user=null; return null; } const {data}=await c.auth.getSession(); user=data && data.session ? data.session.user : null; }catch(_){ user=null; }
  if(user){ const l=$("login"); if(l) l.hidden=true; }
  renderSync(); return user;
}
function renderSync(){
  const c=sbCfg(); $('sbUrl').value=c.url; $('sbKey').value=c.key;
  $('sbOut').hidden=!!user; $('sbIn').hidden=!user;
  if(user) $('sbWho').textContent=`Signed in as ${user.email}.`;
  if(!c.url||!c.key) syncChip("Not syncing", "off");
  else if(!user) syncChip("Sign in to sync", "off");
}
const syncData = () => { const S=P().state; return {videos:S.videos, char:S.char, modAt:S.modAt||0}; };
async function pull(){
  if(!user || !navigator.onLine || syncing) return;
  syncing=true; syncChip("Syncing…");
  try{
    const c=await client();
    const {data,error}=await c.from("pf_state").select("data,updated_at").maybeSingle();
    if(error) throw error;
    const S=P().state;
    if(data && data.data && (data.data.modAt||0) > (S.modAt||0)){
      S.videos=(data.data.videos||[]).map(P().normVideo); S.char=Object.assign(S.char, data.data.char||{}); S.modAt=data.data.modAt;
      if(S.sel && !S.videos.some(v=>v.id===S.sel)) S.sel=null;
      await P().persist(); P().renderList(); P().loadImages(); renderCharacter();
      syncChip("Synced "+new Date().toLocaleTimeString("en-SG",{hour:"numeric",minute:"2-digit"}), "ok");
    } else if(!data || (S.modAt||0) > (data.data.modAt||0)) { syncing=false; await push(); return; }
    else syncChip("Synced "+new Date().toLocaleTimeString("en-SG",{hour:"numeric",minute:"2-digit"}), "ok");
  }catch(e){ syncChip("Sync failed", "bad"); $('sbMsg').textContent = /relation|pf_state|42P01|schema cache/i.test(e.message||"") ? "The pf_state table is missing. Run setup.sql in your Supabase SQL Editor." : "Sync failed: "+(e.message||"check your connection"); }
  finally{ syncing=false; }
}
async function push(){
  if(!user || !navigator.onLine) return;
  syncChip("Saving…");
  try{
    const c=await client();
    const {error}=await c.from("pf_state").upsert({user_id:user.id, data:syncData(), updated_at:new Date().toISOString()}, {onConflict:"user_id"});
    if(error) throw error;
    syncChip("Synced "+new Date().toLocaleTimeString("en-SG",{hour:"numeric",minute:"2-digit"}), "ok");
  }catch(e){ syncChip("Sync failed", "bad"); $('sbMsg').textContent = /relation|pf_state|42P01|schema cache/i.test(e.message||"") ? "The pf_state table is missing. Run setup.sql in your Supabase SQL Editor." : "Couldn't save to Supabase: "+(e.message||"check your connection"); }
}
function schedulePush(){ if(!user) return; clearTimeout(pushT); pushT=setTimeout(push, 2500); }
$('sbSave').addEventListener("click", async ()=>{
  const url=$('sbUrl').value.trim().replace(/\/+$/,""), key=$('sbKey').value.trim();
  if(url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)){ $('sbMsg').textContent="The Project URL should look like https://abcdefgh.supabase.co"; return; }
  LOCALSET("pf-sync",{url,key}); sb=null; $('sbMsg').textContent = url&&key ? "Saved. Now enter your email to get a sign-in link." : "Sync details removed from this device.";
  await refreshUser();
});
function redirectUrl(){ return location.origin + location.pathname; }
async function sendLink(){
  const email=$('sbEmail').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(email)){ $('sbMsg').textContent="Enter your email address first."; return; }
  const btn=$('sbLink'); btn.disabled=true;
  try{
    const c=await client(); if(!c){ $('sbMsg').textContent="Save your Project URL and key first."; return; }
    const {error}=await c.auth.signInWithOtp({email, options:{emailRedirectTo:redirectUrl(), shouldCreateUser:true}}); if(error) throw error;
    $('sbMsg').textContent="Check your email (and spam). Tap the link, or type the 6-digit code below.";
  }catch(e){ $('sbMsg').textContent = /rate limit|too many|seconds/i.test(e.message||"") ? "Please wait a minute before asking for another link." : (e.message||"Could not send the link."); }
  finally{ btn.disabled=false; }
}
async function verifyCode(){
  const email=$('sbEmail').value.trim(), token=$('sbCode').value.replace(/\s+/g,"");
  if(!email || !token){ $('sbMsg').textContent="Enter your email and the code from the email."; return; }
  try{
    const c=await client(); if(!c){ $('sbMsg').textContent="Save your Project URL and key first."; return; }
    const {error}=await c.auth.verifyOtp({email, token, type:"email"}); if(error) throw error;
    $('sbCode').value=""; await refreshUser(); $('sbMsg').textContent="Signed in. Syncing your plans…"; await pull(); $('sbMsg').textContent="Signed in. Plans sync automatically when you're online.";
  }catch(e){ $('sbMsg').textContent = /expired|invalid/i.test(e.message||"") ? "That code is wrong or expired. Ask for a new link." : (e.message||"Sign-in failed."); }
}
$('sbLink').addEventListener("click", sendLink);
$('sbVerify').addEventListener("click", verifyCode);
$('sbSignOut').addEventListener("click", async ()=>{ try{ const c=await client(); await c.auth.signOut(); }catch(_){} user=null; renderSync(); $("login").hidden=false; $('sbMsg').textContent="Signed out on this device. Your plans stay here and in Supabase."; });
$('sbNow').addEventListener("click", ()=>pull());
window.addEventListener("online", ()=>{ if(user) pull(); });

/* ---------------- sign-in screen ---------------- */
const lgMsg = t => { $('lgMsg').textContent=t; };
async function loginDone(){ await refreshUser(); if(user){ $('login').hidden=true; lgMsg(""); pull(); } }
$('lgIn').addEventListener("click", async ()=>{
  const email=$('lgEmail').value.trim(), password=$('lgPass').value;
  if(!email||!password){ lgMsg("Enter your email and password."); return; }
  const b=$('lgIn'); b.disabled=true; lgMsg("Signing in…");
  try{ const c=await client(); const {error}=await c.auth.signInWithPassword({email,password}); if(error) throw error; $('lgPass').value=""; await loginDone(); }
  catch(e){ lgMsg(/invalid login/i.test(e.message||"") ? "Wrong email or password. If you have no password yet, use the sign-in link below." : (e.message||"Couldn't sign in. Check your internet.")); }
  finally{ b.disabled=false; }
});
$('lgPass').addEventListener("keydown", e=>{ if(e.key==="Enter") $('lgIn').click(); });
$('lgLink').addEventListener("click", async ()=>{
  const email=$('lgEmail').value.trim(); if(!/^\S+@\S+\.\S+$/.test(email)){ lgMsg("Enter your email address first."); return; }
  const b=$('lgLink'); b.disabled=true;
  try{ const c=await client(); const {error}=await c.auth.signInWithOtp({email, options:{emailRedirectTo:redirectUrl(), shouldCreateUser:false}}); if(error) throw error; lgMsg("Check your email (and spam). Tap the link, or type the 6-digit code here."); }
  catch(e){ lgMsg(/rate limit|too many|seconds/i.test(e.message||"") ? "Please wait a minute before asking for another link." : (e.message||"Could not send the link.")); }
  finally{ b.disabled=false; }
});
$('lgVerify').addEventListener("click", async ()=>{
  const email=$('lgEmail').value.trim(), token=$('lgCode').value.replace(/\s+/g,"");
  if(!email||!token){ lgMsg("Enter your email and the code from the email."); return; }
  try{ const c=await client(); const {error}=await c.auth.verifyOtp({email,token,type:"email"}); if(error) throw error; $('lgCode').value=""; await loginDone(); }
  catch(e){ lgMsg(/expired|invalid/i.test(e.message||"") ? "That code is wrong or expired. Ask for a new link." : (e.message||"Sign-in failed.")); }
});
$('sbSetPass').addEventListener("click", async ()=>{
  const p=$('sbNewPass').value; if(p.length<8){ $('sbMsg').textContent="Use at least 8 characters for the password."; return; }
  try{ const c=await client(); const {error}=await c.auth.updateUser({password:p}); if(error) throw error; $('sbNewPass').value=""; $('sbMsg').textContent="Password saved. Next time, sign in with your email and password."; }
  catch(e){ $('sbMsg').textContent=e.message||"Couldn't save the password."; }
});

/* ---------------- hooks from app.js ---------------- */
Object.assign(window.PF, {
  afterList: renderPlan,
  translateVideo,
  afterSave: schedulePush,
  openWrite,
  onTab: t => { if(t==="write") loadWrite(); if(t==="character") renderCharacter(); if(t==="settings"){ renderAI(); renderSync(); } if(t==="videos") renderPlan(); },
  ready: async () => { CH(); renderPlan(); renderAI(); renderCharacter(); aiButtons(); if(await refreshUser()) pull(); else if(navigator.onLine) $("login").hidden=false; }
});
if(window.PF.booted) window.PF.ready();
})();
