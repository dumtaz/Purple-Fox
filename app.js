/* Purple Fox — offline video maker */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STATUSES = ["Idea","Storyboard","Prompts ready","Video made","Voice added","Scheduled","Posted"];
const PILLARS = {money:"Money", work:"Work life", hacks:"Life hacks", skit:"Skit"};
const uid = () => Math.random().toString(36).slice(2,9);

/* ---------------- storage (IndexedDB) ---------------- */
let dbp = null;
function db(){
  if(dbp) return dbp;
  dbp = new Promise((res,rej)=>{
    const r = indexedDB.open("purplefox",1);
    r.onupgradeneeded = () => { const d=r.result; d.createObjectStore("kv"); d.createObjectStore("clips"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(store, mode, fn){
  const d = await db();
  return new Promise((res,rej)=>{ const tx=d.transaction(store,mode); const st=tx.objectStore(store); const q=fn(st); tx.oncomplete=()=>res(q&&q.result); tx.onerror=()=>rej(tx.error); });
}
const kvGet = k => idb("kv","readonly",s=>s.get(k));
const kvSet = (k,v) => idb("kv","readwrite",s=>s.put(v,k));
const clipGet = k => idb("clips","readonly",s=>s.get(k));
const clipSet = (k,v) => idb("clips","readwrite",s=>s.put(v,k));
const clipDel = k => idb("clips","readwrite",s=>s.delete(k));

let state = {char:{name:"Purple Fox", image:null}, videos:[], sel:null};
let saveT = null;
function save(opts){ if(!(opts&&opts.quiet)) state.modAt=Date.now(); clearTimeout(saveT); saveT=setTimeout(()=>{ kvSet("state", state).catch(()=>toast("Couldn't save on this device.")); if(!(opts&&opts.quiet) && window.PF && PF.afterSave) PF.afterSave(); }, 400); }

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add("on"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("on"), 2600); }

/* ---------------- images ---------------- */
const EXK = ["normal","talking","happy","letsgo","thinking","shocked","stressed"];
const EXF = {normal:"normal",talking:"talking",happy:"happy",letsgo:"wink",thinking:"thinking",shocked:"shocked",stressed:"stressed"};
const POSES = ["desk","coffee","relax","back"];
const IM = {main:null, ex:{}, pose:{}, logo:null, sub:null};
function loadImg(src){ return new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.onerror=()=>r(null); i.src=src; }); }
async function loadImages(){
  IM.main = state.char.image ? await loadImg(state.char.image) : null;
  for(const k of POSES) IM.pose[k] = await loadImg(`assets/v2/pose-${k}.png`);
  for(const k of EXK) IM.ex[k] = await loadImg(`assets/v2/expr-${EXF[k]}.png`);
  IM.logo = await loadImg("assets/v2/logo.png"); IM.sub = await loadImg("assets/v2/subscribe.png");
  $('charImg').src = state.char.image || "assets/v2/pose-desk.png";
  still();
}

/* ---------------- audio ---------------- */
let AC = null;
function ac(){ if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); return AC; }
const decoded = new Map();
async function decode(blob, key){
  if(key && decoded.has(key) && decoded.get(key).blob===blob) return decoded.get(key).buf;
  const ab = await blob.arrayBuffer();
  const buf = await new Promise((res,rej)=>{ const p=ac().decodeAudioData(ab, res, rej); if(p && p.then) p.then(res,rej); });
  if(key) decoded.set(key,{blob,buf});
  return buf;
}

/* ---------------- drawing ---------------- */
function pickBg(s){
  const t=((s.shot||"")+" "+(s.vo||"")+" "+(s.ost||"")).toLowerCase();
  if(/video.?call|split screen|phone call|mama/.test(t)) return "call";
  if(/hawker|kopitiam|food court|zi char|chicken rice|food|makan/.test(t)) return "hawker";
  if(/mrt|train|bus|commute/.test(t)) return "mrt";
  if(/pantry|office|desk|cubicle|meeting|boss|colleague|work|payslip|salary|mc\b/.test(t)) return "office";
  if(/hdb|bto|home|flat|room|bed|window/.test(t)) return "hdb";
  return "plain";
}
function exprFor(s,i,n){
  const t=((s.shot||"")+" "+(s.vo||"")+" "+(s.ost||"")).toLowerCase();
  if(/stress|cry|sad|tired|sian|broke|no money|gone|panic|kan cheong|sob|why me/.test(t)) return "stressed";
  if(/shock|where did|去哪|what\?|!\?|\?!|huh|wah|cannot be|disappear|fly away|flies/.test(t)) return "shocked";
  if(/think|hmm|should i|how to|why|plan|decide|compare|calculate|can or not/.test(t)) return "thinking";
  if(i===n-1 || /follow|tip|so now|let'?s go|done|pay yourself|save|confident|thumbs|easy/.test(t)) return "letsgo";
  if(/rich|yay|happy|best|love|shiok|nice|win|开心|好/.test(t)) return "happy";
  if(/\?|\uff1f/.test(t)) return "talking";
  return i===0 ? "happy" : "talking";
}
function poseFor(s){
  const t=((s.shot||"")+" "+(s.vo||"")+" "+(s.ost||"")).toLowerCase();
  if(/\b(lazy|relax\w*|weekends?|sleep\w*|bed|rest|lie|lying|chill|tired|sian|sick|mc|holidays?|skit)\b|休息|睡/.test(t)) return "relax";
  if(/\b(coffee|kopi|teh|tea|breakfast|morning|hawker|food|eat\w*|makan|drinks?|cafe|home|mama|call)\b|咖啡|早餐|吃|妈妈/.test(t)) return "coffee";
  return "desk";
}
function rr(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function drawBg(c,W,H,kind){
  const g=c.createLinearGradient(0,0,0,H);
  const sky={office:["#efeaf8","#ddd3f2"],hdb:["#cfe6f7","#f4efe0"],hawker:["#fde9c8","#f6d5a7"],mrt:["#e6ecf4","#cdd8e6"],call:["#e9e4f7","#d7cdf0"],plain:["#ece6fb","#f7e6ee"]}[kind];
  g.addColorStop(0,sky[0]); g.addColorStop(1,sky[1]); c.fillStyle=g; c.fillRect(0,0,W,H);
  c.lineWidth=W*0.006; c.strokeStyle="#2e2648";
  if(kind==="hdb"){
    const cols=["#f6d8b8","#cfe3d4","#f3c9c9"];
    for(let i=0;i<3;i++){ const x=W*(0.02+i*0.34), w=W*0.3, y=H*(0.12+i%2*0.06), h=H*0.6;
      c.fillStyle=cols[i]; c.fillRect(x,y,w,h); c.strokeRect(x,y,w,h);
      c.fillStyle="#7fa6b8"; for(let r=0;r<9;r++) for(let k=0;k<3;k++) c.fillRect(x+w*(0.1+k*0.3),y+h*(0.05+r*0.1),w*0.2,h*0.05); }
    c.fillStyle="#9ccf9a"; c.fillRect(0,H*0.72,W,H*0.28);
  } else if(kind==="office"){
    c.fillStyle="#fbfaff"; c.fillRect(W*0.08,H*0.1,W*0.4,H*0.22); c.strokeRect(W*0.08,H*0.1,W*0.4,H*0.22);
    c.fillStyle="#bfe3f5"; c.fillRect(W*0.1,H*0.115,W*0.36,H*0.19);
    c.fillStyle="#d9c3a5"; c.fillRect(0,H*0.62,W,H*0.06); c.strokeRect(-2,H*0.62,W+4,H*0.06);
    c.fillStyle="#ffffff"; rr(c,W*0.74,H*0.38,W*0.16,H*0.24,10); c.fill(); c.stroke();
    c.fillStyle="#8cc7e8"; rr(c,W*0.77,H*0.33,W*0.1,H*0.06,8); c.fill(); c.stroke();
    c.fillStyle="#d9d0ee"; c.fillRect(0,H*0.68,W,H*0.32);
  } else if(kind==="hawker"){
    const sc=["#d6383f","#6a4cc2","#e3a94a"];
    for(let i=0;i<3;i++){ const x=W*(0.03+i*0.33), w=W*0.3;
      c.fillStyle=sc[i]; c.fillRect(x,H*0.12,w,H*0.07); c.strokeRect(x,H*0.12,w,H*0.07);
      c.fillStyle="#fff7e8"; c.fillRect(x,H*0.19,w,H*0.3); c.strokeRect(x,H*0.19,w,H*0.3); }
    c.fillStyle="#bfa58a"; c.fillRect(0,H*0.66,W,H*0.34);
  } else if(kind==="mrt"){
    c.fillStyle="#f5f7fa"; c.fillRect(0,H*0.08,W,H*0.6);
    c.fillStyle="#2e2648"; for(let i=0;i<2;i++) c.fillRect(W*(0.08+i*0.48),H*0.16,W*0.36,H*0.2);
    c.fillStyle="#9fc6e8"; for(let i=0;i<2;i++) c.fillRect(W*(0.1+i*0.48),H*0.175,W*0.32,H*0.17);
    c.fillStyle="#c7ccd3"; c.fillRect(W*0.47,H*0.08,W*0.03,H*0.7);
    c.fillStyle="#d6383f"; c.fillRect(0,H*0.4,W,H*0.025);
    c.fillStyle="#8a95a3"; c.fillRect(0,H*0.7,W,H*0.3);
  } else if(kind==="call"){
    c.fillStyle="#ffffff"; rr(c,W*0.06,H*0.08,W*0.88,H*0.66,W*0.06); c.fill(); c.stroke();
    c.fillStyle="#f3c9c9"; rr(c,W*0.1,H*0.11,W*0.8,H*0.28,W*0.04); c.fill();
    c.fillStyle="#2e2648"; c.font=`600 ${W*0.04}px sans-serif`; c.textAlign="center"; c.textBaseline="middle"; c.fillText("Video call",W*0.5,H*0.255);
  } else {
    c.fillStyle="rgba(106,76,194,.12)"; for(let i=0;i<40;i++){ c.beginPath(); c.arc((i*137)%W,(i*271)%H,W*0.02,0,7); c.fill(); }
  }
}
function wrapLines(c,text,maxW){
  const words = String(text||"").match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g)||[];
  const lines=[]; let line="";
  for(const w of words){ const test=line+w; if(c.measureText(test).width>maxW && line.trim()){ lines.push(line.trim()); line=w.trim(); } else line=test; }
  if(line.trim()) lines.push(line.trim()); return lines;
}
function drawFrame(c,W,H,scenes,durs,t,rec,v){
  const total=durs.reduce((a,b)=>a+b,0);
  let acc=0,i=0; for(;i<scenes.length;i++){ if(t<acc+durs[i]) break; acc+=durs[i]; }
  if(i>=scenes.length){ i=scenes.length-1; acc=total-durs[i]; }
  const s=scenes[i], lt=Math.max(0,t-acc), p=Math.min(1,lt/durs[i]);
  const z=1+0.06*p;
  c.save(); c.translate(W/2,H/2); c.scale(z,z); c.translate(-W/2,-H/2); drawBg(c,W,H,pickBg(s)); c.restore();
  const bob=Math.sin(lt*3)*H*0.006;
  const m=IM.main || IM.pose[poseFor(s)] || IM.pose.desk;
  if(m){ let ch=H*0.56, cw=ch*m.naturalWidth/m.naturalHeight; if(cw>W*0.96){ cw=W*0.96; ch=cw*m.naturalHeight/m.naturalWidth; }
    const x=(W-cw)/2, y=H*0.79-ch+bob;
    if(IM.main){ c.save(); rr(c,x,y,cw,ch,W*0.03); c.clip(); c.drawImage(m,x,y,cw,ch); c.restore(); } else c.drawImage(m,x,y,cw,ch); }
  const e=IM.ex[exprFor(s,i,scenes.length)];
  if(e){ const pop=Math.min(1,lt/0.35), sc=pop<1?(0.6+0.55*Math.sin(pop*Math.PI/2)):1;
    const r=W*0.15*Math.min(1.08,sc), cx=W*0.79, cy=H*0.31+Math.sin(lt*2.2)*H*0.004;
    c.save(); c.fillStyle="#fff"; c.beginPath(); c.arc(cx,cy,r+W*0.012,0,7); c.fill(); c.strokeStyle="#6a4cc2"; c.lineWidth=W*0.008; c.stroke();
    c.beginPath(); c.arc(cx,cy,r,0,7); c.clip(); const k=Math.max(2*r/e.naturalWidth,2*r/e.naturalHeight);
    c.drawImage(e,cx-e.naturalWidth*k/2,cy-r*0.92,e.naturalWidth*k,e.naturalHeight*k); c.restore(); }
  c.textAlign="center"; c.textBaseline="middle";
  c.font=`800 ${W*0.065}px "Segoe UI", -apple-system, "PingFang SC", sans-serif`;
  const ol=wrapLines(c,s.ost||"",W*0.8), lh=W*0.08;
  if(ol.length){ const bh=ol.length*lh+W*0.05; c.fillStyle="#fff"; c.strokeStyle="#1d1830"; c.lineWidth=W*0.008;
    rr(c,W*0.06,H*0.05,W*0.88,bh,W*0.03); c.fill(); c.stroke(); c.fillStyle="#1d1830"; ol.forEach((l,k)=>c.fillText(l,W/2,H*0.05+W*0.025+lh*(k+0.5))); }
  const blocks=subBlocks(v||{subs:"voice"}, s), rows=[];
  const two=blocks.length>1;
  blocks.forEach((b,bi)=>{ const fs=W*(b.big?(two?0.043:0.045):0.034); c.font=`${b.big?600:500} ${fs}px "Segoe UI", -apple-system, "PingFang SC", sans-serif`;
    wrapLines(c,b.text,W*0.84).slice(0,two?2:3).forEach(l=>rows.push({l, fs, w:b.big?600:500, col:b.big?"#ffffff":"#e3dbff"})); });
  if(rows.length){ const lhs=rows.map(r=>r.fs*1.3), bh=lhs.reduce((a,b)=>a+b,0)+W*0.04, top=H*0.86-bh/2;
    c.fillStyle="rgba(29,24,48,.84)"; rr(c,W*0.05,top,W*0.9,bh,W*0.025); c.fill();
    let y=top+W*0.02; rows.forEach((r,k)=>{ c.font=`${r.w} ${r.fs}px "Segoe UI", -apple-system, "PingFang SC", sans-serif`; c.fillStyle=r.col; c.fillText(r.l,W/2,y+lhs[k]/2); y+=lhs[k]; }); }
  const endIn=t-(total-2.5);
  if(endIn>0 && IM.logo){ const p=Math.min(1,endIn/0.4), e2=1-Math.pow(1-p,3);
    c.save(); c.globalAlpha=0.55*e2; c.fillStyle="#1d1830"; c.fillRect(0,0,W,H); c.restore();
    const lw=W*0.84, lh=lw*IM.logo.naturalHeight/IM.logo.naturalWidth, ly=H*0.30-(1-e2)*H*0.05;
    c.save(); c.globalAlpha=e2; c.drawImage(IM.logo,(W-lw)/2,ly,lw,lh);
    if(IM.sub){ const sw=W*0.66, sh2=sw*IM.sub.naturalHeight/IM.sub.naturalWidth, pulse=1+0.04*Math.sin(endIn*6); c.translate(W/2,ly+lh+H*0.09); c.scale(pulse,pulse); c.drawImage(IM.sub,-sw/2,-sh2/2,sw,sh2); }
    c.restore(); }
  if(!rec){ c.fillStyle="rgba(0,0,0,.15)"; c.fillRect(0,H-6,W,6); c.fillStyle="#d6383f"; c.fillRect(0,H-6,W*Math.min(1,t/total),6); }
}

/* ---------------- language ---------------- */
const stripName = t => String(t||"").replace(/^[^:\uff1a]{1,12}[:\uff1a]\s*/,"");
function spokenText(v,s){ const m=v&&v.speak; return m==="en" && s.sub_en ? s.sub_en : m==="zh" && s.sub_zh ? s.sub_zh : s.vo; }
function subBlocks(v,s){ // [{text, big}] stacked bottom subtitles
  const m=(v&&v.subs)||"voice";
  if(m==="en") return [{text:stripName(s.sub_en||spokenText(v,s)), big:true}];
  if(m==="zh") return [{text:stripName(s.sub_zh||spokenText(v,s)), big:true}];
  if(m==="both"){ const out=[]; if(s.sub_zh) out.push({text:stripName(s.sub_zh), big:true}); if(s.sub_en) out.push({text:stripName(s.sub_en), big:false}); return out.length?out:[{text:stripName(spokenText(v,s)),big:true}]; }
  if(m==="none") return [];
  return [{text:stripName(spokenText(v,s)), big:true}];
}

/* ---------------- videos ---------------- */
const cur = () => state.videos.find(v=>v.id===state.sel);
function normVideo(v){
  v.id = v.id || "v"+uid();
  v.output = v.output || {scenes:[]};
  v.output.scenes = (v.output.scenes||[]).map(s=>Object.assign({sid:uid(), shot:"", dur:6, vo:"", ost:""}, s));
  v.status = STATUSES.includes(v.status) ? v.status : "Prompts ready";
  v.voiceMode = v.voiceMode || "rec"; if(v.voiceMode==="ai" && !v.recMigrated) v.voiceMode="rec"; v.recMigrated=true; v.speak = v.speak || "vo"; v.subs = v.subs || "voice";
  v.len = v.len || "30"; v.mix = v.mix || "en-led"; v.storyboard = v.storyboard || ""; v.pillar = v.pillar || "";
  return v;
}
function today(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function fmtD(s){ if(!s) return "No date"; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-SG",{weekday:"short",day:"numeric",month:"short"}); }
function renderList(){
  const vids=[...state.videos].sort((a,b)=>(a.date||"9").localeCompare(b.date||"9"));
  $('list').innerHTML = vids.length ? vids.map(v=>`<div class="item"><span class="d">${esc(fmtD(v.date))}</span>
    <span><span class="t">${esc(v.title||"Untitled")}</span>${v.example?'<span class="chip">example</span>':''}<br><span class="s">${esc(PILLARS[v.pillar]||"")} · ${esc(v.status)} · ${v.output.scenes.length} scenes</span></span>
    <span class="row" style="gap:6px"><select class="ssel" data-status="${v.id}" aria-label="Status of ${esc(v.title)}">${STATUSES.map(s=>`<option${s===v.status?" selected":""}>${s}</option>`).join("")}</select><button class="btn small" data-write="${v.id}">Write</button><button class="btn small primary" data-open="${v.id}">Make</button><button class="btn small" data-del="${v.id}" aria-label="Delete ${esc(v.title)}">Delete</button></span></div>`).join("")
    : '<p class="hint">No videos yet. Press Plan 7 ideas, New video, or import a plan in Settings.</p>';
  if(window.PF && PF.afterList) PF.afterList();
}
$('list').addEventListener("change", e=>{ const sl=e.target.closest("[data-status]"); if(!sl) return; const v=state.videos.find(x=>x.id===sl.dataset.status); if(v){ v.status=sl.value; save(); renderList(); } });
$('list').addEventListener("click", async e=>{
  const o=e.target.closest("[data-open]"); if(o){ state.sel=o.dataset.open; save(); openMake(); showTab("make"); return; }
  const d=e.target.closest("[data-del]");
  if(d){ if(d.dataset.confirm!=="1"){ d.dataset.confirm="1"; d.textContent="Tap again to delete"; return; }
    const v=state.videos.find(x=>x.id===d.dataset.del);
    if(v){ for(const s of v.output.scenes) clipDel(v.id+"|"+s.sid).catch(()=>{}); clipDel(v.id+"|file").catch(()=>{}); clipDel(v.id+"|music").catch(()=>{}); }
    state.videos=state.videos.filter(x=>x.id!==d.dataset.del); if(state.sel===d.dataset.del) state.sel=null; save(); renderList(); }
});
function newVideo(extra){
  const v=normVideo(Object.assign({title:"", date:nextFreeDate(), status:"Idea", storyboard:"", output:{scenes:[]}}, extra||{}));
  if(!v.pillar) v.pillar=["skit","money","work","hacks","skit","money","hacks"][new Date(v.date+"T00:00").getDay()];
  state.videos.push(v); state.sel=v.id; save(); renderList(); return v;
}
function nextFreeDate(){ const used=new Set(state.videos.map(v=>v.date)); const d=new Date(); for(let i=0;i<60;i++){ const s=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); if(!used.has(s)) return s; d.setDate(d.getDate()+1); } return today(); }
$('newVid').addEventListener("click", ()=>{ newVideo(); if(window.PF && PF.openWrite) PF.openWrite(); });
const OLD_TEMPLATE = ()=>normVideo({title:"New video", date:today(), pillar:"money", status:"Storyboard", output:{scenes:[
    {shot:"Hook", dur:5, vo:"Type the first line here. Grab attention in 2 seconds.", ost:"BIG HOOK TEXT"},
    {shot:"The problem", dur:8, vo:"What goes wrong? Say it the way you'd tell a friend.", ost:"The problem"},
    {shot:"The twist", dur:8, vo:"What did you find out? 华语 punchline here.", ost:"Wait what?!"},
    {shot:"The tip", dur:7, vo:"So now I do this. Follow for more adulting tips!", ost:"Tip: ..."}]}});

/* import */
function importData(data){
  let vids = Array.isArray(data) ? data : data.videos ? data.videos : data.output ? [data] : null;
  if(!vids) throw new Error("This file doesn't look like a Purple Fox plan.");
  let added=0, updated=0;
  for(const raw of vids){
    if(!raw || !raw.output || !raw.output.scenes) continue;
    const old=state.videos.find(v=>v.id===raw.id);
    const v=normVideo(JSON.parse(JSON.stringify(raw)));
    if(old){ v.output.scenes.forEach((s,i)=>{ if(old.output.scenes[i]) s.sid=old.output.scenes[i].sid; }); v.voiceMode=old.voiceMode;
      Object.assign(old, {title:v.title,date:v.date,pillar:v.pillar,output:v.output}); updated++; }
    else { state.videos.push(v); added++; }
  }
  if(data.character && data.character.name) state.char.name=data.character.name;
  save(); renderList();
  return `Imported: ${added} new, ${updated} updated.`;
}
$('impFile').addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{ $('impMsg').textContent = importData(JSON.parse(await f.text())); }catch(err){ $('impMsg').textContent = err.message.startsWith("This file")?err.message:"Couldn't read that file. Export it again from Purple Fox Studio."; }
});
$('impPaste').addEventListener("click", ()=>{
  try{ $('impMsg').textContent = importData(JSON.parse($('impText').value)); $('impText').value=""; }catch(err){ $('impMsg').textContent="That text isn't a complete plan. Copy it again from Purple Fox Studio."; }
});

/* ---------------- make tab ---------------- */
function openMake(){
  const v=cur();
  $('makeEmpty').hidden=!!v; $('makeBody').hidden=!v;
  $('outRow').hidden=true; lastFile=null;
  if(!v) return;
  $('mTitle').value=v.title||""; $('mDate').value=v.date||"";
  $('mStatus').innerHTML=STATUSES.map(s=>`<option${s===v.status?" selected":""}>${s}</option>`).join("");
  $('mVoiceMode').value=v.voiceMode; $('mSpeak').value=v.speak; $('mSubs').value=v.subs; langNote();
  $('fileVoice').hidden = v.voiceMode!=="file"; $('liveHint').hidden = v.voiceMode!=="live";
  renderScenes(); renderPack(); fileInfo(); musicState(); still();
}
$('mTitle').addEventListener("input", ()=>{ const v=cur(); v.title=$('mTitle').value; save(); renderList(); renderPack(); });
$('mDate').addEventListener("change", ()=>{ const v=cur(); v.date=$('mDate').value; save(); renderList(); });
$('mStatus').addEventListener("change", ()=>{ const v=cur(); v.status=$('mStatus').value; save(); renderList(); });
function langNote(){ const v=cur(); if(!v) return; const sc=v.output.scenes, need=(v.speak!=="vo"||v.subs!=="voice"); const miss=sc.filter(s=>(!s.sub_en||!s.sub_zh) && s.vo).length;
  $('langMsg').textContent = need && miss ? `${miss} scene${miss===1?"":"s"} need English / 中文 versions. Press Make English & 中文 with AI, or type them into each scene.` : ""; }
$('mSpeak').addEventListener("change", ()=>{ const v=cur(); v.speak=$('mSpeak').value; save(); langNote(); still(); });
$('mSubs').addEventListener("change", ()=>{ const v=cur(); v.subs=$('mSubs').value; save(); langNote(); still(); });
$('mTranslate').addEventListener("click", async ()=>{ const v=cur(); if(!v || !(window.PF && PF.translateVideo)) return; const b=$('mTranslate'); b.disabled=true; $('langMsg').textContent="Writing English and 中文 versions…";
  try{ await PF.translateVideo(v); renderScenes(); langNote(); still(); toast("English and 中文 versions added."); }catch(e){ $('langMsg').textContent=e.message||"Couldn't translate. Try again."; } finally{ b.disabled=false; } });
$('mVoiceMode').addEventListener("change", ()=>{ const v=cur(); v.voiceMode=$('mVoiceMode').value; $('fileVoice').hidden=v.voiceMode!=="file"; $('liveHint').hidden=v.voiceMode!=="live"; save(); renderScenes(); });
async function fileInfo(){
  const v=cur(); if(!v) return; const f=await clipGet(v.id+"|file").catch(()=>null);
  $('mFileMsg').textContent = f ? `${f.name||"Voice file"} · ${f.dur.toFixed(1)} s. Scenes stretch to fit it.` : "No voice file loaded.";
}
$('mFile').addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value=""; const v=cur(); if(!f||!v) return;
  try{ const buf=await decode(f); await clipSet(v.id+"|file",{blob:f, dur:buf.duration, name:f.name}); fileInfo(); toast("Voice file saved on this device."); }
  catch(err){ toast("Couldn't read that audio file. Try an MP3 or M4A."); }
});

async function musicState(){
  const v=cur(); if(!v) return; const c=await clipGet(v.id+"|music").catch(()=>null);
  $('musMsg').textContent = c ? `${c.name||"Music"} · ${c.dur.toFixed(0)} s, repeats to fill the video` : "No music";
  $('musDel').hidden=!c; $('musVol').value = v.musicVol==null?18:v.musicVol;
}
$('musFile').addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value=""; const v=cur(); if(!f||!v) return;
  try{ const buf=await decode(f); await clipSet(v.id+"|music",{blob:f, dur:buf.duration, name:f.name}); musicState(); toast("Music saved on this device."); }
  catch(err){ toast("Couldn't read that audio file. Try an MP3 or M4A."); }
});
$('musVol').addEventListener("input",()=>{ const v=cur(); if(!v) return; v.musicVol=+$('musVol').value; save(); });
$('musDel').addEventListener("click", async ()=>{ const v=cur(); if(!v) return; await clipDel(v.id+"|music").catch(()=>{}); musicState(); });

function renderScenes(){
  const v=cur(); const sc=v.output.scenes;
  $('scenes').innerHTML = sc.map((s,i)=>`<div class="scene" data-sid="${s.sid}">
    <div class="hd"><span class="n">${i+1}</span><input type="text" data-k="shot" value="${esc(s.shot)}" aria-label="Scene ${i+1} name">
      <label class="hint">sec <input type="number" min="2" max="20" step="1" data-k="dur" value="${esc(s.dur)}" aria-label="Scene ${i+1} seconds"></label>
      <button class="btn small" data-delscene="${s.sid}" aria-label="Delete scene ${i+1}">Remove</button></div>
    <div class="bd">
      <label class="f full">Voiceover line <textarea rows="2" data-k="vo">${esc(s.vo)}</textarea></label>
      <label class="f full">On-screen text <input type="text" data-k="ost" value="${esc(s.ost)}"></label>
      <label class="f">English version <input type="text" data-k="sub_en" value="${esc(s.sub_en||"")}" placeholder="For English voice or subtitles"></label>
      <label class="f">中文版本 <input type="text" data-k="sub_zh" value="${esc(s.sub_zh||"")}" placeholder="用于中文配音或字幕"></label>
    </div>
    ${(s.img||s.vid||s.dir||s.sfx)?`<details class="prm"><summary>Prompts for image &amp; video tools</summary>${[["Image prompt",s.img],["Video prompt",s.vid],["Voice direction",s.dir],["Sound",s.sfx]].filter(x=>x[1]).map(([l,t])=>`<div class="pblk"><div class="row between"><b>${l}</b><button class="btn small" data-copytext="${esc(t)}">Copy</button></div><div class="ptxt">${esc(t)}</div></div>`).join("")}</details>`:""}
    ${(v.voiceMode==="scenes"||v.voiceMode==="rec")?`<div class="voice"><button class="btn small rec" data-rec="${s.sid}">Record voice</button>
      <span class="meter"><i id="m-${s.sid}"></i></span><span class="vs" id="vs-${s.sid}">…</span>
      <button class="btn small" data-playc="${s.sid}" hidden>Play</button><button class="btn small" data-delc="${s.sid}" hidden>Delete</button></div>`
    : v.voiceMode==="ai" ? `<div class="voice"><button class="btn small" data-aiplay="${s.sid}">Hear AI voice</button><span class="vs" id="vs-${s.sid}">AI voice is made when you make the video</span></div>` : ""}
  </div>`).join("");
  if(v.voiceMode==="scenes"||v.voiceMode==="rec") sc.forEach(s=>clipState(v,s.sid));
}
async function clipState(v,sid){
  const c=await clipGet(v.id+"|"+sid).catch(()=>null);
  const vs=$('vs-'+sid); if(!vs) return;
  vs.textContent = c ? `${c.dur.toFixed(1)} s recorded` : "No voice yet";
  document.querySelector(`[data-playc="${sid}"]`).hidden=!c;
  document.querySelector(`[data-delc="${sid}"]`).hidden=!c;
  const b=document.querySelector(`[data-rec="${sid}"]`); if(b && !b.classList.contains("on")) b.textContent = c ? "Re-record" : "Record voice";
}
$('scenes').addEventListener("input", e=>{
  const k=e.target.dataset.k; if(!k) return; const v=cur(); const sid=e.target.closest(".scene").dataset.sid;
  const s=v.output.scenes.find(x=>x.sid===sid); s[k] = k==="dur" ? Math.max(2,Math.min(20,+e.target.value||2)) : e.target.value;
  save(); still();
});
$('addScene').addEventListener("click", ()=>{ const v=cur(); v.output.scenes.push(normVideo({output:{scenes:[{shot:"New scene",dur:6,vo:"",ost:""}]}}).output.scenes[0]); save(); renderScenes(); });

/* mic recording */
let mic = null; // {rec, stream, sid, raf}
function audioMime(){ for(const m of ["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg"]) { try{ if(MediaRecorder.isTypeSupported(m)) return m; }catch(_){} } return ""; }
async function toggleRec(sid, btn){
  if(mic){ if(mic.sid===sid) mic.rec.stop(); else toast("Stop the other recording first."); return; }
  if(!navigator.mediaDevices || !window.MediaRecorder){ toast("This browser can't record audio."); return; }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}); }
  catch(err){ toast("Microphone blocked. Allow microphone access for this app in your browser or iPad settings."); return; }
  const mt=audioMime(); const rec=new MediaRecorder(stream, mt?{mimeType:mt}:undefined); const chunks=[];
  const an=ac().createAnalyser(); ac().resume(); const src=ac().createMediaStreamSource(stream); src.connect(an); const data=new Uint8Array(an.fftSize);
  mic={rec,stream,sid};
  btn.classList.add("on"); btn.textContent="Stop";
  const meter=$('m-'+sid);
  (function lvl(){ if(!mic) return; an.getByteTimeDomainData(data); let pk=0; for(const x of data) pk=Math.max(pk,Math.abs(x-128)); if(meter) meter.style.width=Math.min(100,pk/0.9)+"%"; mic.raf=requestAnimationFrame(lvl); })();
  rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  rec.onstop=async ()=>{
    cancelAnimationFrame(mic.raf); stream.getTracks().forEach(t=>t.stop()); src.disconnect(); mic=null;
    btn.classList.remove("on"); if(meter) meter.style.width="0";
    const blob=new Blob(chunks,{type:(mt||"audio/webm").split(";")[0]});
    try{ const buf=await decode(blob); const v=cur(); await clipSet(v.id+"|"+sid,{blob, dur:buf.duration}); clipState(v,sid); }
    catch(err){ toast("Recording failed. Try again."); clipState(cur(),sid); }
  };
  rec.start(); setTimeout(()=>{ if(mic && mic.rec===rec) rec.stop(); }, 30000);
}
let playing = null;
$('scenes').addEventListener("click", async e=>{
  const v=cur();
  const r=e.target.closest("[data-rec]"); if(r){ toggleRec(r.dataset.rec, r); return; }
  const ai=e.target.closest("[data-aiplay]");
  if(ai){ const s=v.output.scenes.find(x=>x.sid===ai.dataset.aiplay); const vs=$('vs-'+s.sid); ai.disabled=true;
    try{ await ensureAI(v,[s],t=>vs.textContent=t); const c=await clipGet(aiKey(v,s)); if(c){ if(playing) playing.pause(); playing=new Audio(URL.createObjectURL(c.blob)); playing.play().catch(()=>{}); vs.textContent=`${c.dur.toFixed(1)} s`; } else vs.textContent="Nothing to say in this scene."; }
    catch(err){ vs.textContent = navigator.onLine ? "Couldn't make the voice. Try again." : "Offline: connect once so the voice can download."; }
    finally{ ai.disabled=false; } return; }
  const p=e.target.closest("[data-playc]"); if(p){ const c=await clipGet(v.id+"|"+p.dataset.playc); if(c){ if(playing) playing.pause(); playing=new Audio(URL.createObjectURL(c.blob)); playing.play().catch(()=>{}); } return; }
  const d=e.target.closest("[data-delc]"); if(d){ await clipDel(v.id+"|"+d.dataset.delc); clipState(v,d.dataset.delc); return; }
  const ds=e.target.closest("[data-delscene]"); if(ds){ if(ds.dataset.confirm!=="1"){ ds.dataset.confirm="1"; ds.textContent="Tap again"; return; }
    clipDel(v.id+"|"+ds.dataset.delscene).catch(()=>{}); v.output.scenes=v.output.scenes.filter(s=>s.sid!==ds.dataset.delscene); save(); renderScenes(); still(); }
});

/* ---------------- AI voice ---------------- */
const VOICE_EN = {"en_US-ryan-medium":"Ryan · male · US","en_US-joe-medium":"Joe · male · US","en_US-hfc_male-medium":"HFC · male · US","en_GB-alan-medium":"Alan · male · UK","en_US-hfc_female-medium":"HFC · female · US","en_US-amy-medium":"Amy · female · US","en_GB-cori-medium":"Cori · female · UK"};
const VOICE_ZH = {"zh_CN-huayan-medium":"Huayan · female · Mandarin","zh_CN-huayan-x_low":"Huayan small · female · Mandarin (20 MB download)"};
function vcfg(){ state.voice = Object.assign({en:"en_US-ryan-medium", zh:"zh_CN-huayan-medium", deep:true}, state.voice||{}); return state.voice; }
const engine = () => window.PFTTS || null;
const CJKR = "\\u3400-\\u9fff\\uf900-\\ufaff\\u3000-\\u303f\\uff01-\\uff60";
function segments(text){
  const t=String(text||"").replace(/^[^:：]{1,12}[:：]\s*/,"")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,"").replace(/…|\.{3}/g,", ").replace(/\s+/g," ").trim();
  const runs=t.match(new RegExp(`[${CJKR}]+|[^${CJKR}]+`,"g"))||[];
  return runs.map(r=>({text:r.trim().replace(/^[\s,.!?;:\uff0c\u3002\uff01\uff1f]+/,""), zh:new RegExp(`[${CJKR}]`).test(r)})).filter(r=>/[\p{L}\p{N}]/u.test(r.text));
}
function resample(buf, factor){ // factor < 1 lowers pitch (and slows slightly)
  const src=buf.getChannelData(0), n=Math.floor(src.length/factor), out=ac().createBuffer(1,n,buf.sampleRate), d=out.getChannelData(0);
  for(let i=0;i<n;i++){ const x=i*factor, j=Math.floor(x), f=x-j; d[i]=(src[j]||0)*(1-f)+(src[j+1]||0)*f; }
  return out;
}
function concat(bufs, gap){
  const sr=bufs[0].sampleRate, g=Math.round(gap*sr), n=bufs.reduce((a,b)=>a+b.length,0)+g*(bufs.length-1);
  const out=ac().createBuffer(1,n,sr), d=out.getChannelData(0); let o=0;
  bufs.forEach((b,i)=>{ d.set(b.getChannelData(0),o); o+=b.length+(i<bufs.length-1?g:0); });
  return out;
}
function wavBlob(buf){
  const d=buf.getChannelData(0), sr=buf.sampleRate, ab=new ArrayBuffer(44+d.length*2), v=new DataView(ab);
  const w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4,36+d.length*2,true); w(8,"WAVE"); w(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40,d.length*2,true);
  for(let i=0;i<d.length;i++){ const s=Math.max(-1,Math.min(1,d[i])); v.setInt16(44+i*2, s<0?s*0x8000:s*0x7fff, true); }
  return new Blob([ab],{type:"audio/wav"});
}
const aiKey = (v,s) => v.id+"|"+s.sid+"|ai";
const aiSig = (v,s) => { const c=vcfg(); return [spokenText(v,s), c.en, c.zh, c.deep].join("|"); };
// Make AI voice clips for the given scenes. English parts of every scene first, then Mandarin, so each voice loads once.
async function ensureAI(v, scenes, onMsg){
  const e=engine(); if(!e) throw new Error("The voice engine didn't load. Connect to the internet once and reopen the app.");
  const c=vcfg(), todo=[];
  for(const s of scenes){ const old=await clipGet(aiKey(v,s)).catch(()=>null); if(!old || old.sig!==aiSig(v,s)) todo.push(s); }
  if(!todo.length) return;
  const parts=[]; todo.forEach(s=>segments(spokenText(v,s)).forEach((g,k)=>parts.push({s,k,g,buf:null})));
  const total=parts.length; let done=0;
  for(const zh of [false,true]){
    for(const p of parts.filter(p=>p.g.zh===zh)){
      onMsg && onMsg(`Writing the voiceover… ${Math.round(done/total*100)}%${done===0?" (the first time downloads the voice, about 60 MB)":""}`);
      const wav=await e.predict(p.g.text, zh?c.zh:c.en);
      let b=await decode(wav); if(zh && c.deep) b=resample(b,0.86); p.buf=b; done++;
    }
  }
  for(const s of todo){
    const bufs=parts.filter(p=>p.s===s).sort((a,b)=>a.k-b.k).map(p=>p.buf);
    if(!bufs.length){ await clipDel(aiKey(v,s)).catch(()=>{}); continue; }
    const out=concat(bufs,0.08);
    await clipSet(aiKey(v,s),{blob:wavBlob(out), dur:out.duration, sig:aiSig(v,s), auto:true});
  }
}

/* ---------------- timeline, preview, export ---------------- */
async function timeline(v, onMsg){
  const sc=v.output.scenes; let durs=sc.map(s=>Math.max(2,+s.dur||5)); const audio=[]; let aiErr=null;
  if(v.voiceMode==="file"){
    const f=await clipGet(v.id+"|file").catch(()=>null);
    if(f){ const buf=await decode(f.blob, v.id+"|file"); const tot=durs.reduce((a,b)=>a+b,0); durs=durs.map(d=>d*buf.duration/tot); audio.push({buf,start:0}); }
  } else if(v.voiceMode==="scenes" || v.voiceMode==="rec" || v.voiceMode==="ai"){
    const own={};
    if(v.voiceMode==="scenes"||v.voiceMode==="rec") for(const s of sc){ const c=await clipGet(v.id+"|"+s.sid).catch(()=>null); if(c) own[s.sid]=c; }
    const need=v.voiceMode==="rec" ? [] : sc.filter(s=>!own[s.sid] && segments(spokenText(v,s)).length);
    if(need.length){ try{ await ensureAI(v, need, onMsg); }catch(e){ aiErr=e; } }
    let acc=0;
    for(let i=0;i<sc.length;i++){
      const key = own[sc[i].sid] ? v.id+"|"+sc[i].sid : aiKey(v,sc[i]);
      const c = own[sc[i].sid] || (v.voiceMode==="rec" ? null : await clipGet(key).catch(()=>null));
      if(c && (!c.auto || c.sig===aiSig(v,sc[i]))){ const buf=await decode(c.blob, key); durs[i]=Math.max(durs[i], buf.duration+0.5); audio.push({buf,start:acc+0.2}); }
      acc+=durs[i];
    }
  }
  return {durs, total:durs.reduce((a,b)=>a+b,0), audio, aiErr};
}
function still(){ const v=cur(); const c=$('pv'); if(!v||!c||!v.output.scenes.length) return; const d=v.output.scenes.map(s=>Math.max(2,+s.dur||5)); drawFrame(c.getContext("2d"),c.width,c.height,v.output.scenes,d,0.4,false,v); }

let run = null;
function videoMime(){
  const L=[["video/mp4;codecs=avc1.42E01E,mp4a.40.2","mp4"],["video/mp4;codecs=avc1,mp4a","mp4"],["video/mp4","mp4"],["video/webm;codecs=vp9,opus","webm"],["video/webm;codecs=vp8,opus","webm"],["video/webm","webm"]];
  for(const [m,e] of L){ try{ if(MediaRecorder.isTypeSupported(m)) return {m,e}; }catch(_){} } return null;
}
const fileName = (v,ext) => `${v.date||today()}-${(v.title||"video").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50)||"video"}.${ext}`;
// Core: play (record=false) or record one video. Returns {file, voiced, aiErr, mime} when recorded.
async function renderVideo(v, {record, canvas, onMsg, live, micStream}){
  const a=ac(); await a.resume();
  const tl=await timeline(v, onMsg);
  if(run && run.stop) return null;
  const pctx=canvas && canvas.getContext("2d");
  let rctx, stream, rec, chunks=[], mime, dest;
  if(record){
    mime=videoMime();
    if(!mime || !HTMLCanvasElement.prototype.captureStream) throw new Error("This browser can't make video files. Use Edge or Chrome on Windows, or Safari on iPad.");
    const rc=document.createElement("canvas"); rc.width=1080; rc.height=1920; rctx=rc.getContext("2d");
    drawFrame(rctx,1080,1920,v.output.scenes,tl.durs,0,true,v);
    stream=rc.captureStream(30);
    dest=a.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    try{ rec=new MediaRecorder(stream,{mimeType:mime.m, videoBitsPerSecond:8000000, audioBitsPerSecond:160000}); }catch(e){ rec=new MediaRecorder(stream); }
    rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  }
  let mbuf=null; const musClip=await clipGet(v.id+"|music").catch(()=>null);
  if(musClip){ try{ mbuf=await decode(musClip.blob, v.id+"|music"); }catch(_){ onMsg && onMsg("Couldn't read the music file, so this video has no music."); } }
  const t0=a.currentTime+0.35;
  const srcs=tl.audio.map(x=>{ const s=a.createBufferSource(); s.buffer=x.buf; s.connect(a.destination); if(dest) s.connect(dest); s.start(t0+x.start); return s; });
  let mg=null;
  if(mbuf){ mg=a.createGain(); mg.connect(a.destination); if(dest) mg.connect(dest);
    const ms=a.createBufferSource(); ms.buffer=mbuf; ms.loop=true; ms.connect(mg);
    const vol=(v.musicVol==null?18:v.musicVol)/100;
    mg.gain.setValueAtTime(0,t0); mg.gain.linearRampToValueAtTime(vol,t0+0.8);
    if(!live){ mg.gain.setValueAtTime(vol,t0+Math.max(1,tl.total-1.5)); mg.gain.linearRampToValueAtTime(0,t0+tl.total); }
    ms.start(t0); srcs.push(ms); }
  if(live && micStream && dest){ const mn=a.createMediaStreamSource(micStream); const mgn=a.createGain(); mgn.gain.value=1.3; mn.connect(mgn); mgn.connect(dest); }
  if(rec) rec.start(500);
  onMsg && onMsg(record ? `Recording… keep the app open. About ${Math.ceil(tl.total)} seconds.` : "Playing preview.");
  const planned=tl.durs.slice();
  await new Promise(resolve=>{
    (function step(){
      const t=Math.max(0,a.currentTime-t0);
      if(live){
        if(live.next && !live.done){ live.next=false; tl.durs[live.idx]=Math.max(1.2,t-live.start);
          if(live.idx>=planned.length-1){ live.done=true; live.endAt=t;
            if(mg){ const n=a.currentTime; mg.gain.cancelScheduledValues(n); mg.gain.setValueAtTime(mg.gain.value,n); mg.gain.linearRampToValueAtTime(0,n+1); } }
          else { live.idx++; live.start=t; live.onScene && live.onScene(live.idx); } }
        if(!live.done) tl.durs[live.idx]=Math.max(planned[live.idx],t-live.start);
        if((run && run.stop) || (live.done && t>=live.endAt+1.1)){ resolve(); return; }
      } else if((run && run.stop) || t>=tl.total){ resolve(); return; }
      if(rctx) drawFrame(rctx,1080,1920,v.output.scenes,tl.durs,t,true,v);
      if(pctx) drawFrame(pctx,canvas.width,canvas.height,v.output.scenes,tl.durs,t,false,v);
      if(record && onMsg) onMsg(live ? `Recording your voiceover… ${Math.floor(t)} s. Tap Next scene when you finish each line.` : `Recording… ${Math.round(t/tl.total*100)}%. Keep the app open.`);
      requestAnimationFrame(step);
    })();
  });
  const cancelled = run && run.stop;
  srcs.forEach(s=>{ try{ s.stop(); }catch(_){ } });
  if(rec){
    drawFrame(rctx,1080,1920,v.output.scenes,tl.durs,tl.durs.reduce((x,y)=>x+y,0)-0.01,true,v);
    await new Promise(r=>setTimeout(r,250));
    const done=new Promise(r=>rec.onstop=r); rec.stop(); await done; stream.getVideoTracks().forEach(t=>t.stop());
  }
  if(!record || cancelled) return {cancelled, aiErr:tl.aiErr};
  const blob=new Blob(chunks,{type:mime.m.split(";")[0]});
  const file=new File([blob], fileName(v,mime.e), {type:blob.type});
  const voiced=tl.audio.length>0 || !!live;
  const target = voiced ? "Voice added" : "Video made";
  if(STATUSES.indexOf(v.status) < STATUSES.indexOf(target)){ v.status=target; save(); }
  return {file, voiced, aiErr:tl.aiErr, mime};
}
function voiceNote(r){ return r.aiErr ? ` No AI voice: ${r.aiErr.message && r.aiErr.message.startsWith("The voice") ? r.aiErr.message : "connect to the internet once so the voice can download, then try again."}` : ""; }
function codecNote(r){ return /avc1/.test(r.mime.m) ? "" : " If TikTok won't accept this file, open it in CapCut or Clipchamp and export it again as MP4."; }
async function go(record){
  try{ ac().resume(); }catch(_){}
  const v=cur(); if(!v || run) return;
  if(!v.output.scenes.length){ toast("Add at least one scene."); return; }
  if(mic){ toast("Stop the voice recording first."); return; }
  run={stop:false};
  $('play').textContent = record ? "Cancel" : "Stop"; $('make').disabled=true; $('outRow').hidden=true;
  const msg=t=>$('makeMsg').textContent=t;
  let micStream=null, live=null;
  try{
    if(record && v.voiceMode==="live"){
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser can't use the microphone.");
      try{ micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); }
      catch(_){ throw new Error("Allow the microphone to record a live voiceover, then press Make video again."); }
      const sc=v.output.scenes; live={idx:0,start:0,next:false,done:false};
      const show=i=>{ $('liveCount').textContent=`Scene ${i+1} of ${sc.length}`; $('liveLine').textContent=spokenText(v,sc[i])||sc[i].shot||""; $('liveNext').textContent=i>=sc.length-1?"Finish ■":"Next scene ▶"; };
      live.onScene=show; show(0); $('livePanel').hidden=false; try{ $('livePanel').scrollIntoView({block:'center',behavior:'smooth'}); }catch(_){}
      let last=0; $('liveNext').onclick=()=>{ const n=Date.now(); if(n-last<500) return; last=n; live.next=true; };
      for(let n=3;n>0 && !run.stop;n--){ msg(`Get ready… ${n}`); await new Promise(r=>setTimeout(r,1000)); }
      if(run.stop){ msg("Cancelled."); return; }
    }
    const r=await renderVideo(v,{record, canvas:$('pv'), onMsg:msg, live, micStream});
    if(!r) msg("Cancelled.");
    else if(!record) msg(r.cancelled ? "Preview stopped." : "Preview finished."+voiceNote(r));
    else if(r.cancelled) msg("Cancelled.");
    else {
      lastFile=r.file;
      const dl=$('dl'); if(dl._u) URL.revokeObjectURL(dl._u); dl._u=URL.createObjectURL(r.file); dl.href=dl._u; dl.download=r.file.name;
      $('share').hidden = !(navigator.canShare && navigator.canShare({files:[r.file]}));
      $('outRow').hidden=false; $('outHint').hidden=false; $('mStatus').value=v.status; renderList();
      msg(`Ready: ${r.file.name} · ${(r.file.size/1048576).toFixed(1)} MB · 1080×1920${r.voiced?" · with voice":" · no voice"}.${voiceNote(r)}${codecNote(r)}`);
    }
  }catch(e){ msg(e.message||"Something went wrong. Try again."); }
  finally{ run=null; if(micStream) micStream.getTracks().forEach(t=>t.stop()); $('livePanel').hidden=true; $('play').textContent="Play preview"; $('make').disabled=false; }
}
document.addEventListener("keydown",e=>{ if(!run || $('livePanel').hidden) return; if(e.code==="Space"||e.key==="Enter"){ e.preventDefault(); $('liveNext').click(); } });
let lastFile=null;
$('play').addEventListener("click", ()=>{ if(run) run.stop=true; else go(false); });
$('make').addEventListener("click", ()=>go(true));
$('share').addEventListener("click", async ()=>{
  if(!lastFile) return;
  try{ await navigator.share({files:[lastFile], title:cur().title}); }catch(e){ if(e && e.name!=="AbortError") toast("Sharing didn't work. Use Download file instead."); }
});

/* ---------------- make all ---------------- */
const made = [];
function renderMade(){
  const box=$('allOut'); if(!made.length){ box.innerHTML=""; return; }
  box.innerHTML = made.map((m,i)=>`<div class="item"><span class="d">${esc(fmtD(m.date))}</span><span><span class="t">${esc(m.title)}</span><br><span class="s">${esc(m.file.name)} · ${(m.file.size/1048576).toFixed(1)} MB${m.voiced?" · with voice":" · no voice"}</span></span>
    <span class="row" style="gap:6px">${navigator.canShare && navigator.canShare({files:[m.file]}) ? `<button class="btn small primary" data-mshare="${i}">Save / Share</button>`:""}<a class="btn small" data-mdl="${i}" href="${m.url}" download="${esc(m.file.name)}">Download</a></span></div>`).join("");
}
$('allOut').addEventListener("click", async e=>{
  const s=e.target.closest("[data-mshare]"); if(!s) return;
  const m=made[+s.dataset.mshare];
  try{ await navigator.share({files:[m.file], title:m.title}); s.textContent="Shared"; }catch(err){ if(err && err.name!=="AbortError") toast("Sharing didn't work. Use Download instead."); }
});
$('makeAll').addEventListener("click", async ()=>{
  if(run){ run.stop=true; return; }
  const list=[...state.videos].filter(v=>v.status!=="Posted" && v.output.scenes.length && v.voiceMode!=="live").sort((a,b)=>(a.date||"9").localeCompare(b.date||"9"));
  if(!list.length){ toast("No videos to make. Import a plan first."); return; }
  if(mic){ toast("Stop the voice recording first."); return; }
  made.forEach(m=>URL.revokeObjectURL(m.url)); made.length=0; renderMade();
  run={stop:false}; $('makeAll').textContent="Stop"; $('make').disabled=true;
  const msg=t=>$('allMsg').textContent=t;
  const autoDl = !(navigator.canShare && window.File && navigator.canShare({files:[new File(["x"],"x.mp4",{type:"video/mp4"})]}));
  let n=0, noVoice=0;
  try{
    for(const v of list){
      if(run.stop) break;
      n++;
      const r=await renderVideo(v,{record:true, canvas:null, onMsg:t=>msg(`Video ${n} of ${list.length}: ${v.title}. ${t}`)});
      if(!r || r.cancelled) break;
      if(!r.voiced) noVoice++;
      const url=URL.createObjectURL(r.file);
      made.push({file:r.file, url, title:v.title||"Untitled", date:v.date, voiced:r.voiced});
      renderMade(); renderList(); save();
      if(autoDl){ const a=document.createElement("a"); a.href=url; a.download=r.file.name; document.body.appendChild(a); a.click(); a.remove(); }
    }
    msg(run.stop ? `Stopped. ${made.length} video${made.length===1?"":"s"} made.` :
      `Done: ${made.length} video${made.length===1?"":"s"} made${noVoice?`, ${noVoice} without voice (connect to the internet once so the voice can download)`:""}. ${autoDl?"They're in your Downloads folder.":"Tap Save / Share on each one, then Save Video."}`);
  }catch(e){ msg(e.message||"Something went wrong. Try again."); }
  finally{ run=null; $('makeAll').textContent="Make all videos"; $('make').disabled=false; }
});

/* ---------------- voice settings ---------------- */
function renderVoiceSettings(){
  const c=vcfg();
  $('vEn').innerHTML=Object.entries(VOICE_EN).map(([k,l])=>`<option value="${k}"${k===c.en?" selected":""}>${esc(l)}</option>`).join("");
  $('vZh').innerHTML=Object.entries(VOICE_ZH).map(([k,l])=>`<option value="${k}"${k===c.zh?" selected":""}>${esc(l)}</option>`).join("");
  $('vDeep').checked=!!c.deep;
}
async function voiceStatus(){
  const e=engine(); if(!e){ $('vMsg').textContent="Voice engine not loaded yet."; return; }
  const st=await e.stored(); const c=vcfg();
  if(st===null){ $('vMsg').textContent = navigator.onLine ? "Couldn't reach the voice engine. Try again in a moment." : "Offline: connect once to download the voice engine."; return; }
  const have=[c.en,c.zh].filter(id=>st.includes(id)).length;
  $('vMsg').textContent = have===2 ? "Both voices are downloaded. AI voice works offline." : `${have} of 2 voices downloaded. Press Download voices while online.`;
}
["vEn","vZh"].forEach(id=>$(id).addEventListener("change",()=>{ const c=vcfg(); c[id==="vEn"?"en":"zh"]=$(id).value; save(); voiceStatus(); }));
$('vDeep').addEventListener("change",()=>{ vcfg().deep=$('vDeep').checked; save(); });
$('vDownload').addEventListener("click", async ()=>{
  const e=engine(); if(!e){ toast("Voice engine not loaded. Check your internet and reopen the app."); return; }
  const b=$('vDownload'); b.disabled=true; const c=vcfg();
  try{
    for(const [i,id] of [c.en,c.zh].entries()){
      await e.download(id, p=>{ if(p && p.total) $('vMsg').textContent=`Downloading voice ${i+1} of 2… ${Math.round(p.loaded/p.total*100)}%`; });
    }
    $('vMsg').textContent="Voices downloaded. Preparing the engine for offline use…";
    await e.predict("Ready.", c.en);
    await voiceStatus();
  }catch(err){ $('vMsg').textContent="Download failed. Check your internet connection and try again."; }
  finally{ b.disabled=false; }
});
$('vTest').addEventListener("click", async ()=>{
  const b=$('vTest'); b.disabled=true;
  try{
    const fake=normVideo({id:"voicetest", output:{scenes:[{sid:"t1", vo:"Hello! I'm Purple Fox. 今天我们来聊聊钱。 Let's go!"}]}});
    await ensureAI(fake, fake.output.scenes, t=>$('vMsg').textContent=t);
    const c=await clipGet(aiKey(fake,fake.output.scenes[0]));
    if(playing) playing.pause(); playing=new Audio(URL.createObjectURL(c.blob)); playing.play().catch(()=>{});
    $('vMsg').textContent="Playing the test line.";
  }catch(err){ $('vMsg').textContent = err.message && err.message.startsWith("The voice") ? err.message : "Couldn't make the test voice. Connect to the internet once so it can download."; }
  finally{ b.disabled=false; }
});

/* post pack */
function packText(v){ const o=v.output||{};
  return `YOUTUBE TITLE:\n${o.yt_title||v.title}\n\nTIKTOK CAPTION:\n${o.caption||""}\n\nYOUTUBE DESCRIPTION:\n${o.desc||""}\n\nHASHTAGS:\n${(o.tags||[]).join(" ")}${o.post?"\n\nWHEN TO POST:\n"+o.post:""}`; }
function renderPack(){ const v=cur(); if(!v) return; const o=v.output||{};
  $('pack').innerHTML=`<div><b>YouTube title</b>${esc(o.yt_title||v.title)}</div><div><b>TikTok caption</b>${esc(o.caption||"Add a caption in Purple Fox Studio")}</div><div><b>Hashtags</b>${esc((o.tags||[]).join(" ")||"#adultingsg #singapore")}</div>${o.post?`<div><b>When to post</b>${esc(o.post)}</div>`:""}`; }
$('copyPack').addEventListener("click", async ()=>{ try{ await navigator.clipboard.writeText(packText(cur())); toast("Post pack copied."); }catch(_){ toast("Couldn't copy. Select the text instead."); } });

/* ---------------- settings ---------------- */
$('charFile').addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  const img=await loadImg(URL.createObjectURL(f)); if(!img){ toast("Couldn't read that picture."); return; }
  const k=Math.min(1,1100/Math.max(img.width,img.height)), c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
  const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
  state.char.image=c.toDataURL("image/jpeg",0.86); save(); loadImages(); toast("Main picture changed.");
});
$('charReset').addEventListener("click", ()=>{ state.char.image=null; save(); loadImages(); toast("Back to Purple Fox."); });
$('exportAll').addEventListener("click", ()=>{
  const blob=new Blob([JSON.stringify({app:"purple-fox",backup:true,videos:state.videos,char:state.char})],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`purple-fox-backup-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
  toast("Backup saved. Voice recordings aren't included.");
});
$('restoreFile').addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{ const d=JSON.parse(await f.text()); toast(importData(d)); if(d.char){ state.char=Object.assign(state.char,d.char); save(); loadImages(); } }catch(_){ toast("That isn't a Purple Fox backup file."); }
});
async function storeInfo(){
  try{ if(navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    const e=await navigator.storage.estimate(); $('storeMsg').textContent=`Using ${(e.usage/1048576).toFixed(1)} MB on this device.`; }catch(_){}
}

/* ---------------- shell ---------------- */
function showTab(t){
  document.querySelectorAll("nav.tabs button").forEach(b=>{ if(b.dataset.tab===t) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  document.querySelectorAll(".view").forEach(s=>s.classList.toggle("on", s.id==="v-"+t));
  if(t==="make") { still(); }
  if(t==="settings"){ storeInfo(); renderVoiceSettings(); voiceStatus(); }
  if(window.PF && PF.onTab) PF.onTab(t);
  window.scrollTo(0,0);
}
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>{ if(b.dataset.tab==="make") openMake(); showTab(b.dataset.tab); }));
function net(){ const n=$('net'); n.textContent=navigator.onLine?"Online":"Offline"; n.classList.toggle("off",!navigator.onLine); }
window.addEventListener("online",net); window.addEventListener("offline",net);

document.addEventListener("click", async e=>{ const b=e.target.closest("[data-copytext]"); if(!b) return; try{ await navigator.clipboard.writeText(b.dataset.copytext); const o=b.textContent; b.textContent="Copied"; setTimeout(()=>b.textContent=o,1200); }catch(_){ toast("Couldn't copy."); } });
window.PF = Object.assign(window.PF||{}, { get state(){ return state; }, save, persist:()=>kvSet("state",state), cur, normVideo, newVideo, openMake, showTab, renderList, toast, esc, today, fmtD, STATUSES, PILLARS, uid, loadImages, still, importData });
(async function boot(){
  net();
  try{ const s=await kvGet("state"); if(s) state=Object.assign(state,s); }catch(_){ toast("Storage isn't available, so changes won't be kept."); }
  if(!state.videos.length && window.PF_SEED && !state.seeded){ state.videos.push(normVideo(JSON.parse(JSON.stringify(window.PF_SEED)))); state.seeded=true; save(); }
  state.videos.forEach(normVideo);
  vcfg(); renderVoiceSettings();
  renderList(); await loadImages();
  if(state.sel && cur()) openMake();
  PF.booted=true; if(PF.ready) PF.ready();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
})();
