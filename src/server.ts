import express from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  initDb, getAllEmployees, getEmployee, createEmployee, updateEmployee,
  deleteEmployee as dbDeleteEmployee, reorderEmployees, getSession, setSession,
  addGroupEntry, getGroupContextString, getTeamSettings, updateTeamSettings,
} from "./db.js";
import type { TeamSettings } from "./db.js";
import { hydrateEmployee, buildFullPrompt } from "./employees.js";
import type { Employee } from "./employees.js";

initDb();

const app = express();
const PORT = 3000;
app.use(express.json());

// ── Livereload ───────────────────────────────────────────────────────────────

app.get("/livereload", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.write("data: connected\n\n");
  const interval = setInterval(() => res.write(": ping\n\n"), 10_000);
  res.on("close", () => clearInterval(interval));
});

// ── Serve the chat UI ────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  const rows = getAllEmployees();
  const empJson = JSON.stringify(rows.map(r => ({
    id: r.id, name: r.name, job_title: r.job_title, model: r.model, effort: r.effort, color: r.color, tools: JSON.parse(r.tools), prompt: r.prompt,
  })));
  const settingsJson = JSON.stringify(getTeamSettings());

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,interactive-widget=resizes-content"/>
<title>Roster</title>
<script src="https://cdn.jsdelivr.net/npm/marked@13/marked.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0;scrollbar-width:thin;scrollbar-color:#30363d transparent}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#484f58}
html{height:100%;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#0d1117;color:#e6edf3;height:100%;display:flex;flex-direction:column;font-size:14px;overflow:hidden}
header{padding:11px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:10px;background:#161b22;flex-shrink:0}
header h1{font-size:0.9rem;font-weight:600;color:#e6edf3;letter-spacing:-0.01em}
#messages{flex:1;min-height:0;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:78%;padding:10px 14px;border-radius:8px;line-height:1.55;white-space:pre-wrap;font-size:0.875rem}
.msg.user{align-self:flex-end;background:#1f6feb;color:#fff;border-radius:8px 8px 2px 8px}
.msg.assistant{align-self:flex-start;background:#161b22;border:1px solid #30363d;border-radius:8px 8px 8px 2px}
.msg.forwarded{border-color:#6e40c933;background:#130d27}
.msg .label{font-size:0.68rem;color:#8b949e;margin-bottom:5px;font-weight:500}
.msg.streaming{opacity:0.85}
.typing-dots{display:inline-flex;gap:3px;align-items:center;height:1em}
.typing-dots span{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:0.4;animation:blink 1.2s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes blink{0%,80%,100%{opacity:0.4}40%{opacity:1}}
.msg.routing-note{align-self:center;background:transparent;border:none;font-size:0.72rem;color:#8b949e;padding:2px 0;max-width:100%}
#input-row{display:flex;gap:8px;padding:12px 20px;border-top:1px solid #21262d;background:#0d1117;flex-shrink:0}
#msg-input{flex:1;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:9px 13px;font-size:0.875rem;resize:none;height:42px;font-family:inherit;transition:border-color 0.15s}
#msg-input:focus{outline:none;border-color:#58a6ff}
#send-btn{background:#238636;color:#fff;border:1px solid #2ea043;border-radius:6px;padding:9px 18px;cursor:pointer;font-size:0.875rem;font-weight:500;transition:background 0.15s}
#send-btn:hover{background:#2ea043}#send-btn:disabled{opacity:0.5;cursor:not-allowed}
.employees-bar{display:flex;align-items:stretch;gap:5px;padding:7px 16px;border-bottom:1px solid #21262d;flex-wrap:nowrap;overflow-x:auto;background:#161b22;flex-shrink:0}
.group-spacer{flex:1;min-width:8px}
.emp-chip{padding:4px 10px;border-radius:6px;border:1px solid #30363d;background:transparent;font-size:0.78rem;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;transition:border-color 0.12s,background 0.12s,color 0.12s;font-weight:500;color:#8b949e;flex-shrink:0}
.emp-chip:hover{border-color:#58a6ff33;background:#161b22;color:#e6edf3}
.emp-chip.active{border-color:#58a6ff;background:#0d2849;color:#58a6ff}
.emp-chip.group-chip:hover{border-color:#bc8cff33;color:#e6edf3}
.emp-chip.group-chip.active{border-color:#bc8cff;background:#1e0f3a;color:#bc8cff}
.unread-dot{width:5px;height:5px;border-radius:50%;background:#f85149;flex-shrink:0;display:none}
.emp-chip.unread .unread-dot{display:block}.emp-chip.group-chip.unread .unread-dot{background:#bc8cff}
.emp-chip.add-chip{border-style:dashed;font-size:0.8rem;padding:3px 10px}
.emp-chip.add-chip:hover{border-color:#58a6ff;color:#58a6ff;background:#0d2849;border-style:dashed}
.emp-chip.dragging{opacity:0.35;border-style:dashed}
.emp-chip.drag-target{border-color:#58a6ff!important;background:#0d2849!important}
.chip-label{display:flex;flex-direction:column;gap:1px;min-width:0}
.chip-name{font-size:0.78rem;font-weight:500;line-height:1.2}
.chip-job{font-size:0.62rem;color:#8b949e;font-weight:400;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
.emp-chip.active .chip-job{color:#388bfd}
.chip-edit-btn{background:none;border:none;cursor:pointer;font-size:0.65rem;padding:0 2px 0 4px;color:inherit;line-height:1;flex-shrink:0;opacity:0.3;transition:opacity 0.12s}
.emp-chip:hover .chip-edit-btn{opacity:0.6}.chip-edit-btn:hover{opacity:1!important;color:#58a6ff}
/* Markdown */
.md{line-height:1.6}.md>*:first-child{margin-top:0!important}.md>*:last-child{margin-bottom:0!important}
.md p{margin:0.3em 0}.md>p:only-child{margin:0}
.md h1,.md h2,.md h3,.md h4{margin:0.7em 0 0.3em;font-weight:600;line-height:1.3}
.md h1{font-size:1.1em}.md h2{font-size:1em}.md h3{font-size:0.95em}
.md ul,.md ol{margin:0.4em 0;padding-left:1.5em}.md li{margin:0.2em 0}.md li>p{margin:0}
.md code{background:#161b22;border:1px solid #30363d;padding:1px 6px;border-radius:4px;font-size:0.82em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#e6edf3}
.md pre{background:#010409;border:1px solid #30363d;border-radius:6px;padding:14px 16px;overflow-x:auto;margin:0.6em 0}
.md pre code{background:none;border:none;padding:0;font-size:0.85em}
.md blockquote{border-left:3px solid #30363d;margin:0.5em 0;padding:0 0 0 12px;color:#8b949e}
.md table{border-collapse:collapse;width:100%;margin:0.5em 0;font-size:0.85em}
.md th,.md td{border:1px solid #30363d;padding:5px 10px;text-align:left}.md th{background:#161b22;font-weight:600}
.md a{color:#58a6ff;text-decoration:none}.md a:hover{text-decoration:underline}
.md hr{border:none;border-top:1px solid #21262d;margin:0.6em 0}
.msg.user .md code{background:rgba(0,0,0,0.2);border-color:rgba(255,255,255,0.15)}
.msg.user .md pre{background:rgba(0,0,0,0.3);border-color:rgba(255,255,255,0.15)}
.msg.user .md a{color:#b0d0ff}
/* Autocomplete */
#autocomplete{display:none;position:fixed;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;z-index:200;min-width:200px;box-shadow:0 8px 32px rgba(1,4,9,0.85)}
.ac-item{padding:8px 14px;font-size:0.82rem;cursor:pointer;display:flex;align-items:baseline;gap:8px}
.ac-item:hover,.ac-item.ac-active{background:#21262d}
.ac-handle{color:#58a6ff;font-weight:600}.ac-desc{color:#8b949e;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Modal */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(1,4,9,0.8);z-index:300;justify-content:center;align-items:center;backdrop-filter:blur(3px)}
.modal-overlay.open{display:flex}
.modal{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:24px;width:90%;max-width:500px;max-height:88vh;overflow-y:auto;box-shadow:0 16px 48px rgba(1,4,9,0.8)}
.modal h2{font-size:0.9rem;font-weight:600;margin-bottom:18px;color:#e6edf3}
.modal .field{margin-bottom:14px}
.modal label{display:block;font-size:0.7rem;color:#8b949e;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
.modal input,.modal textarea,.modal select{width:100%;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:8px 11px;font-size:0.875rem;font-family:inherit;transition:border-color 0.15s}
.modal input:focus,.modal textarea:focus,.modal select:focus{outline:none;border-color:#58a6ff}
.modal textarea{resize:vertical;min-height:120px}
.modal select{cursor:pointer}
.modal .row{display:flex;gap:10px;align-items:flex-start}.modal .row>*{flex:1}
.modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.btn{padding:7px 16px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-size:0.875rem;font-weight:500;transition:all 0.12s}
.btn-primary{background:#238636;color:#fff;border-color:#2ea043}.btn-primary:hover{background:#2ea043}
.btn-cancel{background:transparent;color:#e6edf3;border-color:#30363d}.btn-cancel:hover{background:#21262d;border-color:#484f58}
.btn-danger{background:transparent;color:#f85149;border-color:#f8514944}.btn-danger:hover{background:#f8514911;border-color:#f85149}
.btn:disabled{opacity:0.5;cursor:not-allowed}
.suggest-btn{padding:4px 10px;border-radius:6px;border:1px solid #30363d;background:transparent;color:#58a6ff;font-size:0.72rem;cursor:pointer;white-space:nowrap;font-weight:500;transition:background 0.12s}
.suggest-btn:hover{background:#0d2849;border-color:#58a6ff}.suggest-btn:disabled{opacity:0.5;cursor:not-allowed}
.color-swatches{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.color-swatch{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform 0.1s,border-color 0.1s;flex-shrink:0}
.color-swatch:hover{transform:scale(1.15)}.color-swatch.selected{border-color:#fff;transform:scale(1.1)}
.chip-color-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;opacity:0.85}
.chip-name-row{display:flex;align-items:center;gap:4px}
</style>
</head>
<body>
<header>
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
    <circle cx="10" cy="6" r="3.5" fill="#58a6ff"/>
    <circle cx="3.5" cy="15" r="3" fill="#58a6ff" opacity="0.55"/>
    <circle cx="10" cy="16.5" r="3" fill="#58a6ff" opacity="0.8"/>
    <circle cx="16.5" cy="15" r="3" fill="#58a6ff" opacity="0.55"/>
  </svg>
  <h1>Roster</h1>
  <span id="team-subtitle" style="font-size:0.78rem;color:#8b949e;font-weight:500"></span>
  <div style="flex:1"></div>
  <button id="settings-btn" title="Team settings" style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:1rem;padding:2px 4px;border-radius:4px;transition:color 0.12s" onmouseover="this.style.color='#e6edf3'" onmouseout="this.style.color='#8b949e'">&#9881;</button>
</header>
<div class="employees-bar" id="emp-bar"></div>
<div id="messages"></div>
<div id="autocomplete"></div>
<div id="input-row">
  <textarea id="msg-input" placeholder="Message your employee..." rows="1"></textarea>
  <button id="send-btn">Send</button>
</div>

<!-- Settings modal -->
<div id="settings-overlay" class="modal-overlay">
<div class="modal">
  <h2>Team Settings</h2>
  <div class="field"><label>Name</label><input type="text" id="s-team-name" placeholder="e.g. Acme Corp — Product Team"/></div>
  <div class="field">
    <label>Description</label>
    <textarea id="s-team-context" style="min-height:140px" placeholder="Shared context injected into every employee&#39;s system prompt. Describe your product, stack, working norms, goals, or anything the whole team should know..."></textarea>
  </div>
  <div class="actions">
    <button class="btn btn-cancel" id="s-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="s-save-btn">Save</button>
  </div>
</div>
</div>

<!-- Employee modal -->
<div id="modal-overlay" class="modal-overlay">
<div class="modal">
  <h2 id="modal-title">New Employee</h2>
  <div class="field row">
    <div><label>Name</label><input type="text" id="m-name" placeholder="e.g. Alex"/></div>
    <div><label>Job Title</label><input type="text" id="m-job-title" placeholder="e.g. Senior Designer"/></div>
  </div>
  <div class="field">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <label style="margin:0">Background</label>
      <button class="suggest-btn" id="m-suggest-btn">&#10024; Auto-suggest</button>
    </div>
    <textarea id="m-prompt" placeholder="Describe the employee's role, expertise, and working style..."></textarea>
  </div>
  <div class="field row">
    <div><label>Model</label><select id="m-model"><option value="sonnet">Sonnet</option><option value="opus">Opus</option><option value="haiku">Haiku</option></select></div>
    <div><label>Effort</label><select id="m-effort"><option value="normal">Normal</option><option value="high">High</option><option value="max">Max</option></select></div>
  </div>
  <div class="field">
    <label>Colour</label>
    <div class="color-swatches" id="m-color-swatches"></div>
  </div>
  <div class="actions">
    <button class="btn btn-danger" id="m-delete-btn" style="margin-right:auto;display:none">Delete</button>
    <button class="btn btn-cancel" id="m-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="m-save-btn">Save</button>
  </div>
</div>
</div>

<script>
// ── Team settings ─────────────────────────────────────────────────────────────
var teamSettings = ${settingsJson};
function updateTeamSubtitle(){
  var el = document.getElementById('team-subtitle');
  el.textContent = teamSettings.team_name || '';
}
updateTeamSubtitle();
var sOverlay = document.getElementById('settings-overlay');
function openSettings(){
  document.getElementById('s-team-name').value = teamSettings.team_name||'';
  document.getElementById('s-team-context').value = teamSettings.team_context||'';
  sOverlay.classList.add('open');
}
function closeSettings(){ sOverlay.classList.remove('open'); }
async function saveSettings(){
  var name = document.getElementById('s-team-name').value.trim();
  var ctx  = document.getElementById('s-team-context').value.trim();
  document.getElementById('s-save-btn').disabled = true;
  try{
    var r = await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({team_name:name,team_context:ctx})});
    if(!r.ok){ var e=await r.json(); throw new Error(e.error); }
    teamSettings = await r.json(); updateTeamSubtitle(); closeSettings();
  }catch(err){ alert('Error: '+err.message); }
  finally{ document.getElementById('s-save-btn').disabled=false; }
}
document.getElementById('settings-btn').onclick = openSettings;
document.getElementById('s-cancel-btn').onclick = closeSettings;
document.getElementById('s-save-btn').onclick = saveSettings;
sOverlay.onclick = function(e){ if(e.target===sOverlay) closeSettings(); };

// ── Color palette ────────────────────────────────────────────────────────────
var COLOR_PALETTE=['#58a6ff','#bc8cff','#3fb950','#ffa657','#f85149','#d2a8ff','#79c0ff','#56d364'];
var selectedColor=COLOR_PALETTE[0];
(function buildSwatches(){
  var container=document.getElementById('m-color-swatches');
  COLOR_PALETTE.forEach(function(c){
    var s=document.createElement('div');
    s.className='color-swatch'+(c===selectedColor?' selected':'');
    s.style.background=c; s.dataset.color=c; s.title=c;
    s.onclick=function(){
      selectedColor=c;
      container.querySelectorAll('.color-swatch').forEach(function(x){x.classList.remove('selected');});
      s.classList.add('selected');
    };
    container.appendChild(s);
  });
})();

// ── State ────────────────────────────────────────────────────────────────────
var employees = ${empJson};
var activeEmployee = employees[0]?.id ?? '';
var histories = {};
var chips = {};
employees.forEach(function(e){ histories[e.id] = document.createDocumentFragment(); });
histories['group'] = document.createDocumentFragment();

var msgs = document.getElementById('messages');
var input = document.getElementById('msg-input');
var btn = document.getElementById('send-btn');

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function empName(id){
  var e = employees.find(function(x){return x.id===id;});
  return e ? e.name : id;
}
marked.use({gfm:true,breaks:false});
function renderMd(t){ return t ? '<div class="md">'+marked.parse(String(t))+'</div>' : ''; }

// ── Channel switching ────────────────────────────────────────────────────────
function switchTo(id){
  if(activeEmployee && histories[activeEmployee]){
    while(msgs.firstChild) histories[activeEmployee].appendChild(msgs.firstChild);
  }
  if(chips[id]) chips[id].classList.remove('unread');
  activeEmployee = id;
  if(histories[id]) msgs.appendChild(histories[id]);
  msgs.scrollTop = msgs.scrollHeight;
  input.placeholder = id==='group' ? 'Message the group (@handle)...' : 'Message your employee...';
}
function markUnread(id){ if(id!==activeEmployee && chips[id]) chips[id].classList.add('unread'); }

// ── Build chips (dynamic) ────────────────────────────────────────────────────
var dragSrcId = null;
function buildChips(){
  var bar = document.getElementById('emp-bar');
  bar.innerHTML = '';
  chips = {};
  employees.forEach(function(e){
    var c = document.createElement('div');
    c.className = 'emp-chip' + (e.id===activeEmployee?' active':'');
    c.title = (e.job_title||e.name)+' ['+e.model+']';
    c.draggable = true;
    var dotColor=e.color||COLOR_PALETTE[0];
    c.innerHTML = '<span class="chip-label"><span class="chip-name-row"><span class="chip-color-dot" style="background:'+escHtml(dotColor)+'"></span><span class="chip-name">'+escHtml(e.name)+'</span></span>'+(e.job_title?'<span class="chip-job">'+escHtml(e.job_title)+'</span>':'')+'</span><span class="unread-dot"></span>';
    c.onclick = function(ev){
      if(ev.target.closest && ev.target.closest('.chip-edit-btn')) return;
      bar.querySelectorAll('.emp-chip').forEach(function(x){x.classList.remove('active');});
      c.classList.add('active'); switchTo(e.id);
    };
    c.addEventListener('dragstart',function(ev){
      dragSrcId=e.id; ev.dataTransfer.effectAllowed='move';
      setTimeout(function(){c.classList.add('dragging');},0);
    });
    c.addEventListener('dragend',function(){
      c.classList.remove('dragging');
      bar.querySelectorAll('.emp-chip').forEach(function(x){x.classList.remove('drag-target');});
    });
    c.addEventListener('dragover',function(ev){
      ev.preventDefault(); ev.dataTransfer.dropEffect='move';
      if(dragSrcId!==e.id) c.classList.add('drag-target');
    });
    c.addEventListener('dragleave',function(){c.classList.remove('drag-target');});
    c.addEventListener('drop',function(ev){
      ev.preventDefault(); c.classList.remove('drag-target');
      if(!dragSrcId||dragSrcId===e.id) return;
      var fi=employees.findIndex(function(x){return x.id===dragSrcId;});
      var ti=employees.findIndex(function(x){return x.id===e.id;});
      if(fi===-1||ti===-1) return;
      employees.splice(ti,0,employees.splice(fi,1)[0]);
      dragSrcId=null; buildChips();
      fetch('/api/employees/reorder',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({order:employees.map(function(x){return x.id;})})}).catch(function(){});
    });
    var eb = document.createElement('button');
    eb.className = 'chip-edit-btn'; eb.title = 'Edit '+e.name; eb.innerHTML = '&#9998;';
    eb.onclick = function(ev){ ev.stopPropagation(); openModal('edit',e); };
    c.appendChild(eb);
    bar.appendChild(c);
    chips[e.id] = c;
  });
  // + button
  var add = document.createElement('div');
  add.className = 'emp-chip add-chip'; add.textContent = '+'; add.title = 'Add employee';
  add.onclick = function(){ openModal('create'); };
  bar.appendChild(add);
  // spacer pushes group to the right
  var sp = document.createElement('div'); sp.className='group-spacer'; bar.appendChild(sp);
  var gc = document.createElement('div');
  gc.className = 'emp-chip group-chip'+(activeEmployee==='group'?' active':'');
  gc.title = 'Group channel'; gc.innerHTML = '# Group<span class="unread-dot"></span>';
  gc.onclick = function(){
    bar.querySelectorAll('.emp-chip').forEach(function(x){x.classList.remove('active');});
    gc.classList.add('active'); switchTo('group');
  };
  bar.appendChild(gc); chips['group'] = gc;
}
buildChips();

// ── Add message bubble ───────────────────────────────────────────────────────
function empColor(id){
  var e=employees.find(function(x){return x.id===id;});
  return e&&e.color?e.color:'';
}
function addMessageTo(channelId, role, label, text, streaming, useMd, labelColor){
  text = text ?? '';
  var body = useMd ? renderMd(text) : escHtml(text);
  var el = document.createElement('div');
  el.className = 'msg '+role+(streaming?' streaming':'');
  var labelStyle=labelColor?(' style="color:'+escHtml(labelColor)+'"'):'';
  el.innerHTML = '<div class="label"'+labelStyle+'>'+escHtml(label)+'</div>'+body;
  if(channelId===activeEmployee){ msgs.appendChild(el); msgs.scrollTop=msgs.scrollHeight; }
  else { if(!histories[channelId]) histories[channelId]=document.createDocumentFragment(); histories[channelId].appendChild(el); if(role!=='user') markUnread(channelId); }
  return el;
}

// ── Send message ─────────────────────────────────────────────────────────────
async function send(){
  var text=input.value.trim(); if(!text||!activeEmployee) return;
  input.value=''; btn.disabled=true;
  var isGroup = activeEmployee==='group';
  addMessageTo(activeEmployee,'user','You',text,false,false);
  var dmBubbles={},dmAccum={},grpBubbles={},grpAccum={},grpSplit={};
  function labelHtml(lbl,color){ return '<div class="label"'+(color?' style="color:'+escHtml(color)+'"':'')+'>'+escHtml(lbl)+'</div>'; }
  function getDmBubble(tid,lbl){
    if(!dmBubbles[tid]){
      var color=empColor(tid);
      var el=addMessageTo(activeEmployee,'assistant',lbl,'',true,false,color);
      el.innerHTML=labelHtml(lbl,color)+'<div class="typing-dots"><span></span><span></span><span></span></div>';
      dmBubbles[tid]={el:el,label:lbl,color:color}; dmAccum[tid]='';
    } return dmBubbles[tid];
  }
  function getGrpBubble(tid,lbl){
    if(!grpBubbles[tid]){
      var color=empColor(tid);
      var el=addMessageTo('group','assistant',lbl,'',true,false,color);
      el.innerHTML=labelHtml(lbl,color)+'<div class="typing-dots"><span></span><span></span><span></span></div>';
      grpBubbles[tid]={el:el,label:lbl,color:color}; grpAccum[tid]=''; grpSplit[tid]=false;
    } return grpBubbles[tid];
  }
  function splitGrp(tid){
    var b=grpBubbles[tid]; if(!b) return;
    var si=grpAccum[tid].indexOf('\\n\\n');
    var first=grpAccum[tid].slice(0,si).trim(), rest=grpAccum[tid].slice(si+2);
    b.el.innerHTML=labelHtml(b.label,b.color)+renderMd(first);
    b.el.classList.remove('streaming');
    var el2=addMessageTo('group','assistant',b.label,'',true,false,b.color);
    el2.innerHTML=rest?labelHtml(b.label,b.color)+renderMd(rest)
      :labelHtml(b.label,b.color)+'<div class="typing-dots"><span></span><span></span><span></span></div>';
    grpBubbles[tid]={el:el2,label:b.label,color:b.color}; grpAccum[tid]=rest; grpSplit[tid]=true;
  }
  if(!isGroup) getDmBubble(activeEmployee,empName(activeEmployee));
  try{
    var res=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId:activeEmployee,message:text})});
    var reader=res.body.getReader(), decoder=new TextDecoder(), dmTarget=isGroup?null:activeEmployee, grpTarget=null;
    while(true){
      var r=await reader.read(); if(r.done) break;
      var chunk=decoder.decode(r.value);
      var lines=chunk.split('\\n');
      for(var li=0;li<lines.length;li++){
        var line=lines[li]; if(!line.startsWith('data: ')) continue;
        var data=JSON.parse(line.slice(6));
        if(data.type==='mention_start'){
          grpTarget=data.targetEmployeeId; getGrpBubble(grpTarget,empName(grpTarget));
        }else if(data.type==='group_handoff_start'){
          grpTarget=data.targetId;
          var dmB=dmBubbles[dmTarget];
          if(dmB){var raw=dmAccum[dmTarget]||'';var ai=raw.toLowerCase().lastIndexOf('@'+data.targetId);
            if(ai!==-1){dmAccum[dmTarget]=raw.slice(0,ai).trimEnd();dmB.el.innerHTML=labelHtml(dmB.label,dmB.color)+renderMd(dmAccum[dmTarget]);}}
          var note=document.createElement('div');note.className='msg routing-note';
          note.innerHTML='\\u2197 <span style="color:#bc8cff">@'+escHtml(data.targetId)+'</span> notified in Group';
          msgs.appendChild(note);msgs.scrollTop=msgs.scrollHeight;
          addMessageTo('group','assistant forwarded',empName(data.fromId)+' \u2192 Group',data.message,false,false,empColor(data.fromId));
          getGrpBubble(grpTarget,empName(grpTarget)); markUnread('group');
        }else if(data.type==='text'){
          if(dmTarget===null) continue;
          var b=getDmBubble(dmTarget,empName(dmTarget)); dmAccum[dmTarget]+=data.text;
          var disp=dmAccum[dmTarget];
          for(var ei=0;ei<employees.length;ei++){
            if(employees[ei].id===dmTarget) continue;
            var aidx=disp.toLowerCase().lastIndexOf('@'+employees[ei].id);
            if(aidx!==-1){disp=disp.slice(0,aidx).trimEnd();break;}
          }
          b.el.innerHTML=labelHtml(b.label,b.color)+renderMd(disp);
          msgs.scrollTop=msgs.scrollHeight;
        }else if(data.type==='group_text'){
          if(grpTarget===null) continue;
          var gb=getGrpBubble(grpTarget,empName(grpTarget)); grpAccum[grpTarget]+=data.text;
          if(!grpSplit[grpTarget]&&grpAccum[grpTarget].includes('\\n\\n')){ splitGrp(grpTarget); }
          else{ gb.el.innerHTML=labelHtml(gb.label,gb.color)+renderMd(grpAccum[grpTarget]); }
          if(activeEmployee==='group') msgs.scrollTop=msgs.scrollHeight;
        }else if(data.type==='hint'){
          var he=document.createElement('div');he.className='msg assistant';he.style.cssText='opacity:0.5;font-style:italic';
          he.innerHTML='<div class="label">System</div>'+escHtml(data.text);
          if(activeEmployee==='group'){msgs.appendChild(he);msgs.scrollTop=msgs.scrollHeight;}else{if(!histories['group'])histories['group']=document.createDocumentFragment();histories['group'].appendChild(he);}
        }else if(data.type==='done'){
          var dt=data.targetEmployeeId||dmTarget; if(dt&&dmBubbles[dt]) dmBubbles[dt].el.classList.remove('streaming');
        }else if(data.type==='group_done'){
          var gt=data.targetEmployeeId||grpTarget; if(gt&&grpBubbles[gt]){grpBubbles[gt].el.classList.remove('streaming');markUnread('group');}
        }
      }
    }
  }catch(err){
    var ee=document.createElement('div');ee.className='msg assistant';
    ee.innerHTML='<div class="label">Error</div><span style="color:#f85149">'+escHtml(String(err))+'</span>';
    msgs.appendChild(ee);
  }
  btn.disabled=false; input.focus();
}
btn.onclick=send;

// ── @ Autocomplete ───────────────────────────────────────────────────────────
var ac=document.getElementById('autocomplete'), acMatches=[], acIdx=0, acStart=0;
function getAtWord(){
  var p=input.selectionStart||0, v=input.value, s=p-1;
  while(s>=0&&!/\\s/.test(v[s])) s--; s++;
  var w=v.slice(s,p); return w.startsWith('@')?{word:w,start:s}:null;
}
function renderAc(){
  if(!acMatches.length){ac.style.display='none';return;}
  ac.innerHTML=acMatches.map(function(e,i){
    return '<div class="ac-item'+(i===acIdx?' ac-active':'')+'" data-i="'+i+'">'+
      '<span class="ac-handle">@'+escHtml(e.id)+'</span>'+
      '<span class="ac-desc">'+escHtml(e.name)+'</span></div>';
  }).join('');
  var rect=input.getBoundingClientRect();
  ac.style.left=rect.left+'px';ac.style.width=rect.width+'px';
  ac.style.bottom=(window.innerHeight-rect.top+6)+'px';ac.style.display='block';
}
function closeAc(){ac.style.display='none';acMatches=[];acIdx=0;}
function commitAc(emp){
  var v=input.value,p=input.selectionStart||0;
  input.value=v.slice(0,acStart)+'@'+emp.id+' '+v.slice(p);
  var c=acStart+emp.id.length+2;input.setSelectionRange(c,c);closeAc();input.focus();
}
input.addEventListener('input',function(){
  var h=getAtWord(); if(!h){closeAc();return;}
  acStart=h.start; var partial=h.word.slice(1).toLowerCase();
  acMatches=employees.filter(function(e){return e.id.startsWith(partial)||e.name.toLowerCase().startsWith(partial);});
  acIdx=0; renderAc();
});
ac.addEventListener('mousedown',function(e){
  var item=e.target.closest('.ac-item'); if(!item) return;
  e.preventDefault(); commitAc(acMatches[+item.dataset.i]);
});
input.addEventListener('keydown',function(e){
  if(ac.style.display!=='none'&&acMatches.length){
    if(e.key==='ArrowDown'){e.preventDefault();acIdx=(acIdx+1)%acMatches.length;renderAc();return;}
    if(e.key==='ArrowUp'){e.preventDefault();acIdx=(acIdx-1+acMatches.length)%acMatches.length;renderAc();return;}
    if(e.key==='Tab'||e.key==='Enter'){e.preventDefault();commitAc(acMatches[acIdx]);return;}
    if(e.key==='Escape'){closeAc();return;}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
});
document.addEventListener('click',function(e){if(!ac.contains(e.target)&&e.target!==input)closeAc();});

// ── Employee modal ───────────────────────────────────────────────────────────
var modalMode='create', editingId=null;
var overlay=document.getElementById('modal-overlay');
function openModal(mode,emp){
  modalMode=mode; editingId=emp?emp.id:null;
  document.getElementById('modal-title').textContent=mode==='edit'?'Edit Employee':'New Employee';
  document.getElementById('m-name').value=emp?emp.name:'';
  document.getElementById('m-name').disabled=mode==='edit';
  document.getElementById('m-job-title').value=emp?emp.job_title:'';
  document.getElementById('m-prompt').value=emp?emp.prompt:'';
  document.getElementById('m-model').value=emp?emp.model:'sonnet';
  document.getElementById('m-effort').value=emp?emp.effort:'normal';
  document.getElementById('m-delete-btn').style.display=mode==='edit'?'':'none';
  // Set color swatch
  var initColor=emp?emp.color:null;
  if(!initColor||!COLOR_PALETTE.includes(initColor)) initColor=COLOR_PALETTE[0];
  selectedColor=initColor;
  document.getElementById('m-color-swatches').querySelectorAll('.color-swatch').forEach(function(s){
    s.classList.toggle('selected',s.dataset.color===selectedColor);
  });
  overlay.classList.add('open');
}
function closeModal(){overlay.classList.remove('open');}
async function saveEmp(){
  var name=document.getElementById('m-name').value.trim();
  var jobTitle=document.getElementById('m-job-title').value.trim();
  var prompt=document.getElementById('m-prompt').value.trim();
  var model=document.getElementById('m-model').value;
  var effort=document.getElementById('m-effort').value;
  if(!name){alert('Name is required');return;} if(!prompt){alert('Background is required');return;}
  document.getElementById('m-save-btn').disabled=true;
  try{
    var url=modalMode==='edit'?'/api/employees/'+editingId:'/api/employees';
    var method=modalMode==='edit'?'PUT':'POST';
    var r=await fetch(url,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,job_title:jobTitle,prompt:prompt,model:model,effort:effort,color:selectedColor,tools:[]})});
    if(!r.ok){var e=await r.json();throw new Error(e.error);}
    closeModal(); await refreshEmployees();
  }catch(err){alert('Error: '+err.message);}
  finally{document.getElementById('m-save-btn').disabled=false;}
}
async function deleteEmp(){
  if(!editingId) return; if(!confirm('Delete this employee? This cannot be undone.')) return;
  try{var r=await fetch('/api/employees/'+editingId,{method:'DELETE'});
    if(!r.ok){var e=await r.json();throw new Error(e.error);} closeModal(); await refreshEmployees();
  }catch(err){alert('Error: '+err.message);}
}
async function suggestAll(){
  var name=document.getElementById('m-name').value.trim();
  var jobTitle=document.getElementById('m-job-title').value.trim();
  if(!name&&!jobTitle){alert('Enter a name or job title first');return;}
  var sb=document.getElementById('m-suggest-btn'); sb.disabled=true; sb.textContent='Generating...';
  try{
    var r=await fetch('/api/suggest-prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,job_title:jobTitle})});
    var result=await r.json();
    if(result.suggestion) document.getElementById('m-prompt').value=result.suggestion;
  }catch(err){alert('Suggest failed: '+err.message);}
  finally{sb.disabled=false;sb.textContent='\\u2728 Auto-suggest';}
}
async function refreshEmployees(){
  var r=await fetch('/api/employees'); employees=await r.json();
  employees.forEach(function(e){if(!histories[e.id]) histories[e.id]=document.createDocumentFragment();});
  if(!histories['group']) histories['group']=document.createDocumentFragment();
  buildChips();
  if(activeEmployee!=='group'&&!employees.find(function(e){return e.id===activeEmployee;})){
    activeEmployee=employees[0]?employees[0].id:'';
    if(activeEmployee) switchTo(activeEmployee);
  }
}
// Wire up modal buttons
document.getElementById('m-suggest-btn').onclick=suggestAll;
document.getElementById('m-save-btn').onclick=saveEmp;
document.getElementById('m-cancel-btn').onclick=closeModal;
document.getElementById('m-delete-btn').onclick=deleteEmp;
overlay.onclick=function(e){if(e.target===overlay)closeModal();};
</script>
<script>
(function livereload(){
  var es=new EventSource('/livereload');
  es.onerror=function(){es.close();setTimeout(function(){location.reload();},500);};
})();
// Mobile: keep layout pinned to visual viewport (handles iOS soft keyboard)
if(window.visualViewport){
  function onVV(){ document.body.style.height=window.visualViewport.height+'px'; }
  window.visualViewport.addEventListener('resize',onVV);
  onVV();
}
</script>
</body>
</html>`);
});

// ── REST API ─────────────────────────────────────────────────────────────────

app.get("/api/employees", (_req, res) => {
  const rows = getAllEmployees();
  res.json(rows.map(r => ({
    id: r.id, name: r.name, job_title: r.job_title, model: r.model, effort: r.effort, color: r.color, tools: JSON.parse(r.tools), prompt: r.prompt,
  })));
});

app.post("/api/employees", (req, res) => {
  try {
    const { name, job_title, prompt, tools, model, effort, color } = req.body;
    const row = createEmployee({ name, job_title: job_title ?? "", prompt, tools: tools ?? [], model, effort, color });
    res.json({ id: row.id, name: row.name, job_title: row.job_title, model: row.model, effort: row.effort, color: row.color, tools: JSON.parse(row.tools), prompt: row.prompt });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.put("/api/employees/reorder", (req, res) => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array" }); return; }
  reorderEmployees(order);
  res.json({ ok: true });
});

app.put("/api/employees/:id", (req, res) => {
  try {
    const { job_title, prompt, tools, model, effort, color } = req.body;
    const row = updateEmployee(req.params.id, { job_title, prompt, tools, model, effort, color });
    res.json({ id: row.id, name: row.name, job_title: row.job_title, model: row.model, effort: row.effort, color: row.color, tools: JSON.parse(row.tools), prompt: row.prompt });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/api/employees/:id", (req, res) => {
  dbDeleteEmployee(req.params.id);
  res.json({ ok: true });
});

// ── Team settings API ─────────────────────────────────────────────────────────

app.get("/api/settings", (_req, res) => {
  res.json(getTeamSettings());
});

app.put("/api/settings", (req, res) => {
  try {
    const { team_name, team_context } = req.body;
    res.json(updateTeamSettings({ team_name, team_context }));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Auto-suggest endpoints ───────────────────────────────────────────────────

app.post("/api/suggest-prompt", async (req, res) => {
  const { name, job_title } = req.body;
  if (!name && !job_title) { res.status(400).json({ error: "name or job_title required" }); return; }
  const identity = [name, job_title].filter(Boolean).join(", ");
  let result = "";
  try {
    for await (const msg of query({
      prompt: `Generate a concise background brief (3-5 short paragraphs) for an AI employee: ${identity}. This acts as their system prompt. Define their role, core expertise, working style, and how they communicate with colleagues. Write it in second person ("You are..."). Output ONLY the raw text — no markdown fences, no preamble, no explanation.`,
      options: {
        model: "haiku",
        allowedTools: [],
        systemPrompt: "You generate system prompts for AI assistants. Be concise, specific, and professional.",
        permissionMode: "plan",
        cwd: process.cwd(),
      },
    })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") result += block.text;
        }
      }
    }
    res.json({ suggestion: result.trim() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Chat helpers ─────────────────────────────────────────────────────────────

function loadEmployees(): Employee[] {
  return getAllEmployees().map(hydrateEmployee);
}

function extractMentions(text: string, validIds: string[]): Array<{ targetId: string; message: string }> {
  if (!validIds.length) return [];
  // Only match @handles that appear at the start of a line (the intended routing line).
  // This prevents mid-sentence "@mention" references from being accidentally routed.
  const pattern = new RegExp(`^@(${validIds.join("|")})\\b([^\\n]*)`, "gim");
  const byTarget = new Map<string, string>();
  for (const match of text.matchAll(pattern)) {
    const targetId = match[1]!.toLowerCase();
    // Use the inline message if present; otherwise use the full context from the original text
    // so a bare "@handle" line is still routed (agent forgot to append message text).
    const message = match[2]!.trim() || text.trim();
    byTarget.set(targetId, message);
  }
  return Array.from(byTarget.entries()).map(([targetId, message]) => ({ targetId, message }));
}

async function streamEmployee(
  employee: Employee,
  allEmployees: Employee[],
  message: string,
  res: express.Response,
  teamSettings: TeamSettings,
  targetEmployeeId?: string,
  toGroup = false,
): Promise<string> {
  const existing = getSession(employee.id);

  const queryOptions = {
    ...(employee.tools.length > 0 ? { allowedTools: employee.tools } : {}),
    systemPrompt: buildFullPrompt(employee, allEmployees, teamSettings),
    model: employee.model,
    permissionMode: "acceptEdits" as const,
    cwd: employee.workdir,
    additionalDirectories: [process.cwd()],
    ...(existing ? { resume: existing } : {}),
  };

  let sessionId = "";
  let fullText = "";

  for await (const msg of query({ prompt: message, options: queryOptions })) {
    if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;

    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          fullText += block.text;
          const type = toGroup ? "group_text" : "text";
          res.write(`data: ${JSON.stringify({ type, text: block.text })}\n\n`);
        }
      }
    }

    if (msg.type === "result" && msg.subtype === "success") {
      if (sessionId) setSession(employee.id, sessionId);
      const type = toGroup ? "group_done" : "done";
      res.write(`data: ${JSON.stringify({ type, targetEmployeeId: targetEmployeeId ?? null })}\n\n`);
    }
  }

  return fullText;
}

// ── Streaming chat endpoint ──────────────────────────────────────────────────

app.post("/chat", async (req, res) => {
  const { employeeId, message } = req.body as { employeeId: string; message: string };
  const allEmployees = loadEmployees();
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const isGroup = employeeId === "group";
  if (!isGroup && !empMap.has(employeeId)) {
    res.status(400).json({ error: `Unknown employee: ${employeeId}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const allIds = allEmployees.map(e => e.id);
  const ts = getTeamSettings();

  try {
    if (isGroup) {
      addGroupEntry(null, message);
      const groupMentions = extractMentions(message, allIds);

      if (groupMentions.length === 0) {
        const handles = allEmployees.map(e => "@" + e.id).join(", ");
        res.write(`data: ${JSON.stringify({ type: "hint", text: `Use @handle to mention an agent (${handles}).` })}\n\n`);
      } else {
        for (const { targetId, message: mentionMessage } of groupMentions) {
          const emp = empMap.get(targetId);
          if (!emp) continue;
          const ctx = `[Group channel]\n${mentionMessage}${getGroupContextString()}`;
          res.write(`data: ${JSON.stringify({ type: "mention_start", targetEmployeeId: targetId, message: mentionMessage })}\n\n`);
          const responseText = await streamEmployee(emp, allEmployees, ctx, res, ts, targetId, true);
          addGroupEntry(targetId, responseText);

          const chained = extractMentions(responseText, allIds.filter(i => i !== targetId));
          for (const { targetId: cid, message: cmsg } of chained) {
            const ce = empMap.get(cid);
            if (!ce) continue;
            addGroupEntry(targetId, `@${cid} ${cmsg}`);
            res.write(`data: ${JSON.stringify({ type: "mention_start", targetEmployeeId: cid, message: cmsg })}\n\n`);
            const ct = await streamEmployee(ce, allEmployees, `[Group channel]\n${cmsg}${getGroupContextString()}`, res, ts, cid, true);
            addGroupEntry(cid, ct);
          }
        }
      }
    } else {
      const emp = empMap.get(employeeId)!;
      const responseText = await streamEmployee(emp, allEmployees, message, res, ts);

      const mentions = extractMentions(responseText, allIds.filter(i => i !== employeeId));
      for (const { targetId, message: mentionMessage } of mentions) {
        const te = empMap.get(targetId);
        if (!te) continue;
        addGroupEntry(employeeId, `@${targetId} ${mentionMessage}`);
        res.write(`data: ${JSON.stringify({ type: "group_handoff_start", fromId: employeeId, targetId, message: mentionMessage })}\n\n`);
        const ct = await streamEmployee(te, allEmployees, `[Group channel]\n${mentionMessage}${getGroupContextString()}`, res, ts, targetId, true);
        addGroupEntry(targetId, ct);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`Claude Harness running at http://localhost:${PORT}`);
});
