// Free AI voice engine (Piper neural voices running inside the browser).
// The engine downloads once from the internet, then works offline:
// voices are kept in the browser's private storage, engine files in the app cache.
const LIB = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/dist/piper-tts-web.js";
let modP = null, sess = null, curVoice = null;

function lib(){
  if(!modP) modP = import(LIB).catch(e => { modP = null; throw e; });
  return modP;
}
// The library keeps one voice loaded at a time, so switching voices means starting a new session.
async function session(voiceId, progress){
  const m = await lib();
  if(sess && curVoice === voiceId) return sess;
  if(m.TtsSession) m.TtsSession._instance = null;
  sess = new m.TtsSession({voiceId, progress});
  curVoice = voiceId;
  if(sess.waitReady) await sess.waitReady;
  return sess;
}
window.PFTTS = {
  async predict(text, voiceId){
    try{ const s = await session(voiceId); return await s.predict(text); }
    catch(e){ sess = null; curVoice = null; throw e; }
  },
  async download(voiceId, cb){ const m = await lib(); return m.download(voiceId, cb); },
  async stored(){ try{ const m = await lib(); return await m.stored(); }catch(e){ return null; } }
};
window.dispatchEvent(new Event("pftts-ready"));
