/* Pro TODO — Frontend Only
   Features: localStorage, subtasks, due dates, reminders (Notifications API),
   recurring tasks, calendar view, pomodoro timer, export/import, voice input, theme & dark mode
*/

// --- Utilities
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const ls = (k,v) => v===undefined ? JSON.parse(localStorage.getItem(k)||'null') : localStorage.setItem(k, JSON.stringify(v));
const nowISO = () => new Date().toISOString();

let tasks = ls('pro_todo_tasks') || [];
let settings = ls('pro_todo_settings') || { dark:false, theme:'default' };
let calendarState = { year: new Date().getFullYear(), month: new Date().getMonth() };

// DOM refs
const taskListEl = document.getElementById('taskList');
const addBtn = document.getElementById('addBtn');
const titleInput = document.getElementById('taskTitle');
const dueDate = document.getElementById('taskDueDate');
const dueTime = document.getElementById('taskDueTime');
const prioritySel = document.getElementById('taskPriority');
const categoryInput = document.getElementById('taskCategory');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const sortSelect = document.getElementById('sortSelect');
const progressPct = document.getElementById('progressPct');
const progressFill = document.getElementById('progressFill');
const subtaskInput = document.getElementById('subtaskInput');
const subtaskListEl = document.getElementById('subtaskList');
const taskRepeat = document.getElementById('taskRepeat');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const voiceBtn = document.getElementById('voiceBtn');
const themeSelect = document.getElementById('themeSelect');
const darkToggle = document.getElementById('darkToggle');

const calendarEl = document.getElementById('calendar');
const monthLabel = document.getElementById('monthLabel');
const prevMonth = document.getElementById('prevMonth');
const nextMonth = document.getElementById('nextMonth');
const dayTasks = document.getElementById('dayTasks');

// Timer refs
const timerMinute = document.getElementById('timerMinute');
const timerSecond = document.getElementById('timerSecond');
const startTimer = document.getElementById('startTimer');
const pauseTimer = document.getElementById('pauseTimer');
const resetTimer = document.getElementById('resetTimer');
const workMins = document.getElementById('workMins');
const breakMins = document.getElementById('breakMins');

let currentSubtasks = [];
let currentFilter = 'all';
let currentSort = 'created_desc';

// Pomodoro state
let timer = { running:false, isWork:true, remaining:25*60, intervalId:null };

// --- Init
applySettings();
renderTasks();
renderCalendar();
updateProgress();
requestNotificationPermission();

// --- Event wiring
addBtn.addEventListener('click', handleAdd);
searchInput.addEventListener('input', renderTasks);
filterSelect.addEventListener('change', (e)=>{currentFilter=e.target.value;renderTasks()});
sortSelect.addEventListener('change', (e)=>{currentSort=e.target.value;renderTasks()});
subtaskInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ addSubtask(); }});
exportBtn.addEventListener('click', exportJSON);
exportCsvBtn.addEventListener('click', exportCSV);
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', handleImportFile);
voiceBtn.addEventListener('click', startVoice);
themeSelect.addEventListener('change', (e)=>{ settings.theme=e.target.value; saveSettings(); applySettings();});
darkToggle.addEventListener('click', ()=>{ settings.dark=!settings.dark; saveSettings(); applySettings();});

// calendar nav
prevMonth.addEventListener('click', ()=>{ changeMonth(-1) });
nextMonth.addEventListener('click', ()=>{ changeMonth(1) });

// timer buttons
startTimer.addEventListener('click', startPomodoro);
pauseTimer.addEventListener('click', pausePomodoro);
resetTimer.addEventListener('click', resetPomodoro);

// simple heuristic suggestions (AI-like)
function suggestPriority(text){
  const t = text.toLowerCase();
  if(/urgent|asap|immediately|due today|deadline|important/.test(t)) return 'high';
  if(/schedule|later|tomorrow|soon/.test(t)) return 'medium';
  return 'low';
}

// --- Task functions
function handleAdd(){
  const title = titleInput.value.trim();
  if(!title) return alert('Please enter a task title');
  const dueD = dueDate.value || null;
  const dueT = dueTime.value || '';
  const due = dueD ? (dueT ? new Date(dueD + 'T' + dueT) : new Date(dueD)) : null;
  const priority = prioritySel.value || suggestPriority(title);
  const cats = categoryInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  const repeat = taskRepeat.value || 'none';
  const id = uid();
  const newTask = {
    id, text:title, created: nowISO(), due: due? due.toISOString():null, priority, categories:cats,
    subtasks: currentSubtasks.slice(), completed:false, repeat, lastNotified:null
  };
  tasks.push(newTask);
  ls('pro_todo_tasks', tasks);
  resetAddForm();
  renderTasks();
  renderCalendar();
  scheduleRemindersForTask(newTask);
}

function resetAddForm(){ titleInput.value=''; dueDate.value=''; dueTime.value=''; categoryInput.value=''; currentSubtasks=[]; subtaskListEl.innerHTML=''; taskRepeat.value='none'; prioritySel.value='medium'; }

function addSubtask(){
  const t = subtaskInput.value.trim();
  if(!t) return;
  currentSubtasks.push({ id:uid(), text:t, done:false});
  subtaskInput.value='';
  renderSubtasks();
}
function renderSubtasks(){
  subtaskListEl.innerHTML='';
  currentSubtasks.forEach(st=>{
    const el = document.createElement('div'); el.className='subtask-pill';
    el.innerHTML = `${st.text} <button data-id="${st.id}">x</button>`;
    el.querySelector('button').onclick = (e)=>{ currentSubtasks=currentSubtasks.filter(x=>x.id!==st.id); renderSubtasks(); }
    subtaskListEl.appendChild(el);
  });
}

function renderTasks(){
  taskListEl.innerHTML='';
  const q = searchInput.value.trim().toLowerCase();

  let list = tasks.slice();

  // filter
  list = list.filter(t=>{
    if(currentFilter==='active') return !t.completed;
    if(currentFilter==='completed') return t.completed;
    if(currentFilter==='priority_high') return t.priority==='high';
    if(currentFilter==='priority_medium') return t.priority==='medium';
    if(currentFilter==='priority_low') return t.priority==='low';
    return true;
  });

  // search
  if(q) list = list.filter(t => {
    return t.text.toLowerCase().includes(q) || (t.categories||[]).join(' ').toLowerCase().includes(q) || (t.subtasks||[]).some(s=>s.text.toLowerCase().includes(q));
  });

  // sort
  list.sort((a,b)=>{
    if(currentSort==='created_desc') return b.created.localeCompare(a.created);
    if(currentSort==='created_asc') return a.created.localeCompare(b.created);
    if(currentSort==='due_asc') return (a.due||'9999').localeCompare(b.due||'9999');
    if(currentSort==='due_desc') return (b.due||'0000').localeCompare(a.due||'0000');
    if(currentSort==='priority_desc') return (['low','medium','high'].indexOf(b.priority) - ['low','medium','high'].indexOf(a.priority));
    return 0;
  });

  list.forEach((task, idx)=>{
    const li = document.createElement('li'); li.className='task-item';
    const left = document.createElement('div'); left.className='task-left';
    const checkbox = document.createElement('div'); checkbox.className='checkbox' + (task.completed ? ' checked':''); checkbox.innerHTML = task.completed? '✓':''; checkbox.onclick = ()=> toggleComplete(task.id);
    const titleWrap = document.createElement('div'); titleWrap.style.flex='1';
    const title = document.createElement('div'); title.className='task-title' + (task.completed?' completed':''); title.innerText = task.text;
    title.ondblclick = ()=> editTaskPrompt(task.id);
    title.onclick = ()=> toggleComplete(task.id);
    const meta = document.createElement('div'); meta.className='task-meta';
    const parts = [];
    if(task.due) parts.push('Due: '+ new Date(task.due).toLocaleString());
    if(task.categories && task.categories.length) parts.push('Tags: '+ task.categories.join(', '));
    parts.push('Priority: '+ task.priority);
    meta.innerText = parts.join(' | ');
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    left.appendChild(checkbox);
    left.appendChild(titleWrap);

    const right = document.createElement('div'); right.className='task-actions';
    // subtasks count
    if(task.subtasks && task.subtasks.length){
      const subBtn = document.createElement('button'); subBtn.textContent = `${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length} ✓`;
      subBtn.onclick = ()=> viewSubtasks(task);
      subBtn.title='View subtasks';
      right.appendChild(subBtn);
    }
    const editBtn = document.createElement('button'); editBtn.className='edit-btn'; editBtn.textContent='Edit'; editBtn.onclick=()=> editTaskPrompt(task.id);
    const delBtn = document.createElement('button'); delBtn.className='delete-btn'; delBtn.textContent='Delete'; delBtn.onclick=()=> { if(confirm('Delete task?')) deleteTask(task.id) };
    right.appendChild(editBtn); right.appendChild(delBtn);

    // small tag badges
    if(task.categories && task.categories.length){
      const tagWrap = document.createElement('div'); task.categories.forEach(c=>{
        const t = document.createElement('span'); t.className='tag'; t.innerText = c;
        left.appendChild(t);
      });
    }

    li.appendChild(left); li.appendChild(right);
    taskListEl.appendChild(li);
  });
  updateProgress();
}

function toggleComplete(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.completed = !t.completed;
  // if completed and recurring, schedule next occurrence
  if(t.completed && t.repeat && t.repeat!=='none'){
    scheduleNextRecurrence(t);
  }
  ls('pro_todo_tasks', tasks);
  renderTasks();
}

function editTaskPrompt(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  const newText = prompt('Edit task title:', t.text);
  if(newText===null) return;
  t.text = newText.trim() || t.text;
  const newDue = prompt('Due date/time ISO (leave blank to keep):', t.due || '');
  if(newDue!==null && newDue.trim()!=='') t.due = newDue;
  // edit priority & categories (simple)
  const p = prompt('Priority (low/medium/high):', t.priority);
  if(['low','medium','high'].includes(p)) t.priority = p;
  const cats = prompt('Categories (comma separated):', (t.categories||[]).join(','));
  if(cats!==null) t.categories = cats.split(',').map(s=>s.trim()).filter(Boolean);
  ls('pro_todo_tasks', tasks);
  renderTasks();
  renderCalendar();
}

function viewSubtasks(task){
  const html = task.subtasks.map(s => `${s.done ? '✓':'○'} ${s.text}`).join('\n');
  alert('Subtasks:\n\n' + html);
}

function deleteTask(id){ tasks = tasks.filter(t=>t.id!==id); ls('pro_todo_tasks', tasks); renderTasks(); renderCalendar(); }

// recurring: when completed, set next due based on repeat
function scheduleNextRecurrence(task){
  if(!task.due) return;
  const d = new Date(task.due);
  let next;
  if(task.repeat==='daily'){ next = new Date(d.getTime()); next.setDate(d.getDate()+1); }
  else if(task.repeat==='weekly'){ next = new Date(d.getTime()); next.setDate(d.getDate()+7); }
  else if(task.repeat==='monthly'){ next = new Date(d.getTime()); next.setMonth(d.getMonth()+1); }
  if(next){
    const newTask = {...task, id:uid(), created:nowISO(), due: next.toISOString(), completed:false, lastNotified:null};
    tasks.push(newTask);
    ls('pro_todo_tasks', tasks);
    renderTasks();
    renderCalendar();
  }
}

// reminders via Notification API
function requestNotificationPermission(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'default') Notification.requestPermission();
}
function scheduleRemindersForTask(task){
  // simple: if due within 24h, show a notification now (best-effort; no background scheduling)
  if(!task.due) return;
  try{
    const due = new Date(task.due);
    const delta = due - new Date();
    if(delta <= 0) return;
    // If browser supports setTimeout for this page session and delta is reasonable (<7 days), set a timer
    if(delta < 7*24*3600*1000){ // schedule only up to 7 days
      setTimeout(()=> {
        showNotification(`Task due: ${task.text}`, `Due ${due.toLocaleString()}`);
        task.lastNotified = nowISO(); ls('pro_todo_tasks', tasks);
      }, Math.max(1000, delta));
    }
  }catch(e){ }
}
function showNotification(title, body){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'granted') new Notification(title, { body });
  else console.log('Notification:', title, body);
}

// schedule reminders for all tasks with due date
function scheduleAllReminders(){ tasks.forEach(t=>scheduleRemindersForTask(t)); }
scheduleAllReminders();

// --- Calendar rendering
function renderCalendar(){
  calendarEl.innerHTML='';
  const year = calendarState.year;
  const month = calendarState.month;
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0..6
  const daysInMonth = new Date(year, month+1, 0).getDate();
  monthLabel.textContent = first.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  // render blanks for start
  for(let i=0;i<startDay;i++){ const blank = document.createElement('div'); blank.className='cal-cell'; blank.innerHTML=''; calendarEl.appendChild(blank); }

  for(let d=1; d<=daysInMonth; d++){
    const cell = document.createElement('div'); cell.className='cal-cell';
    const dateStr = new Date(year,month,d).toISOString().slice(0,10);
    cell.innerHTML = `<div class="date-num">${d}</div>`;
    const count = tasks.filter(t=> t.due && t.due.slice(0,10)===dateStr ).length;
    if(count) cell.innerHTML += `<div class="has-task">${count} task(s)</div>`;
    cell.onclick = ()=> showDayTasks(dateStr);
    calendarEl.appendChild(cell);
  }
}
function changeMonth(delta){ calendarState.month += delta; if(calendarState.month<0){calendarState.month=11;calendarState.year--;} if(calendarState.month>11){calendarState.month=0;calendarState.year++} renderCalendar(); }

function showDayTasks(dateStr){
  const day = new Date(dateStr);
  const list = tasks.filter(t=> t.due && t.due.slice(0,10)===dateStr);
  dayTasks.innerHTML = `<h4>Tasks on ${day.toLocaleDateString()}</h4>`;
  if(!list.length){ dayTasks.innerHTML += '<div>No tasks</div>'; return; }
  list.forEach(t=>{
    const el = document.createElement('div'); el.style.padding='6px 0'; el.innerHTML = `<b>${t.text}</b><div style="font-size:12px;color:#666">${t.categories?.join(', ')||''} • ${t.priority}</div>`;
    dayTasks.appendChild(el);
  });
}

// --- Export / Import
function exportJSON(){ const data = JSON.stringify(tasks, null, 2); const blob = new Blob([data],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='pro_todo_export.json'; a.click(); }
function exportCSV(){
  const rows = [['id','text','created','due','priority','categories','completed','repeat']];
  tasks.forEach(t=> rows.push([t.id, `"${(t.text||'').replace(/"/g,'""')}"`, t.created, t.due||'', t.priority, `"${(t.categories||[]).join('|')}"`, t.completed, t.repeat||'none']));
  const csv = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='pro_todo_export.csv'; a.click();
}
function handleImportFile(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=> {
    try{
      const json = JSON.parse(ev.target.result);
      if(Array.isArray(json)) { tasks = tasks.concat(json); ls('pro_todo_tasks', tasks); renderTasks(); renderCalendar(); alert('Imported tasks'); }
      else alert('Invalid JSON format (must be an array of tasks).');
    }catch(err){ alert('Failed to parse JSON'); }
  }
  reader.readAsText(file);
}

// --- Voice input (Web Speech API)
function startVoice(){
  if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)){ return alert('Voice not supported in this browser'); }
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new Rec(); r.lang='en-US'; r.interimResults=false; r.maxAlternatives=1;
  r.onresult = (ev) => {
    const txt = ev.results[0][0].transcript;
    titleInput.value = txt;
    prioritySel.value = suggestPriority(txt);
  };
  r.onerror = (e)=> console.log('voice error', e);
  r.start();
}

// --- Progress
function updateProgress(){
  const total = tasks.length;
  if(total===0){ progressPct.innerText = '0%'; progressFill.style.width='0%'; return; }
  const done = tasks.filter(t=>t.completed).length;
  const pct = Math.round(done/total*100);
  progressPct.innerText = pct + '%';
  progressFill.style.width = pct + '%';
}

// --- Settings
function saveSettings(){ ls('pro_todo_settings', settings); }
function applySettings(){
  document.body.classList.toggle('dark', !!settings.dark);
  themeSelect.value = settings.theme || 'default';
  // apply theme accent
  if(settings.theme==='green'){ document.documentElement.style.setProperty('--accent','#16a34a'); document.documentElement.style.setProperty('--bg','linear-gradient(135deg,#11998e,#38ef7d)'); }
  else if(settings.theme==='orange'){ document.documentElement.style.setProperty('--accent','#ff7a00'); document.documentElement.style.setProperty('--bg','linear-gradient(135deg,#f8a17a,#ff7a00)'); }
  else { document.documentElement.style.setProperty('--accent','#6a11cb'); document.documentElement.style.setProperty('--bg','linear-gradient(135deg,#6a11cb,#2575fc)'); }
  document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg');
}

// --- Pomodoro Timer
function updateTimerDisplay(){
  const mm = Math.floor(timer.remaining/60).toString().padStart(2,'0');
  const ss = (timer.remaining%60).toString().padStart(2,'0');
  timerMinute.innerText = mm; timerSecond.innerText = ss;
}
function startPomodoro(){
  if(timer.running) return;
  timer.running = true;
  if(!timer.intervalId) timer.intervalId = setInterval(()=> {
    timer.remaining -= 1;
    if(timer.remaining <= 0){
      clearInterval(timer.intervalId); timer.intervalId = null; timer.running = false;
      // switch mode
      if(timer.isWork){
        showNotification('Pomodoro complete','Time for a break!');
        timer.isWork = false; timer.remaining = parseInt(breakMins.value || 5) * 60;
      } else {
        showNotification('Break over','Back to work!');
        timer.isWork = true; timer.remaining = parseInt(workMins.value || 25) * 60;
      }
      startPomodoro();
    }
    updateTimerDisplay();
  }, 1000);
}
function pausePomodoro(){ if(timer.intervalId) clearInterval(timer.intervalId); timer.intervalId=null; timer.running=false; }
function resetPomodoro(){ pausePomodoro(); timer.isWork=true; timer.remaining = parseInt(workMins.value || 25) * 60; updateTimerDisplay(); }

// init timer values
timer.remaining = parseInt(workMins.value || 25) * 60;
updateTimerDisplay();

// --- Misc helpers
function deleteAllTasks(){
  if(confirm('Delete all tasks?')){ tasks=[]; ls('pro_todo_tasks', tasks); renderTasks(); renderCalendar(); }
}

// schedule any newly added tasks reminders too
function scheduleRemindersForAll(){
  tasks.forEach(scheduleRemindersForTask);
}

// initial scheduling for existing tasks
scheduleRemindersForAll();

