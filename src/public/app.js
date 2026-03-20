// ── Bootstrap from server-injected data ─────────────────────────────────────
var _init = JSON.parse(document.getElementById('init-data').textContent);
var employees = _init.employees;
var teamSettings = _init.settings;

// ── Team settings ─────────────────────────────────────────────────────────────
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
    var si=grpAccum[tid].indexOf('\n\n');
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
      var lines=chunk.split('\n');
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
          note.innerHTML='\u2197 <span style="color:#bc8cff">@'+escHtml(data.targetId)+'</span> notified in Group';
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
          if(!grpSplit[grpTarget]&&grpAccum[grpTarget].includes('\n\n')){ splitGrp(grpTarget); }
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
  while(s>=0&&!/\s/.test(v[s])) s--; s++;
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
  finally{sb.disabled=false;sb.textContent='\u2728 Auto-suggest';}
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
document.getElementById('m-suggest-btn').onclick=suggestAll;
document.getElementById('m-save-btn').onclick=saveEmp;
document.getElementById('m-cancel-btn').onclick=closeModal;
document.getElementById('m-delete-btn').onclick=deleteEmp;
overlay.onclick=function(e){if(e.target===overlay)closeModal();};

// ── Livereload ────────────────────────────────────────────────────────────────
(function livereload(){
  var es=new EventSource('/livereload');
  es.onerror=function(){es.close();setTimeout(function(){location.reload();},500);};
})();

// ── Mobile viewport ───────────────────────────────────────────────────────────
if(window.visualViewport){
  function onVV(){ document.body.style.height=window.visualViewport.height+'px'; }
  window.visualViewport.addEventListener('resize',onVV);
  onVV();
}
