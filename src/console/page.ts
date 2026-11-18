export const consoleHtml = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Our AI Hub Console</title>
<style>
:root{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark;background:#10131b;color:#edf1f8;font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 15% 0%,#253149 0,transparent 38%),#10131b}
main{max-width:1100px;margin:auto;padding:32px 20px 64px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}
h1{font-size:clamp(1.5rem,4vw,2.2rem);margin:0}h2{font-size:1.15rem;margin:0 0 14px}p{color:#aeb8ca;line-height:1.55}
.panel{background:#191f2b;border:1px solid #303a4b;border-radius:16px;padding:20px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.metric{font-size:1.8rem;font-weight:700;margin:8px 0}
label{display:block;font-size:.9rem;margin:12px 0 6px;color:#c8d1df}input,button,textarea{font:inherit;border-radius:9px}input,textarea{width:100%;padding:11px 12px;color:inherit;background:#101620;border:1px solid #46546a}
button{padding:10px 14px;border:1px solid #53637a;background:#29364a;color:#fff;cursor:pointer}button.primary{background:#245caa;border-color:#3979cf}button:focus-visible,input:focus-visible{outline:3px solid #80b7ff;outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.tabs button[aria-pressed=true]{background:#245caa;border-color:#3979cf}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#101620;padding:12px;border-radius:9px;color:#d9e5f5;max-height:340px;overflow:auto}
small,.muted{color:#9eabc0}.hidden{display:none!important}.error{color:#ff9c9c}.success{color:#9ce5b0}ul{padding-left:20px}li{margin:8px 0}
@media(max-width:560px){main{padding:20px 14px 44px}.panel{padding:16px}header{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<main>
<header><div><p class="muted">INDEPENDENT AI PLATFORM</p><h1>Our AI Hub</h1><p>One gateway for agents, skills, tools and tasks.</p></div><button id="signout" class="hidden" type="button">Sign out</button></header>
<section id="auth" class="panel" aria-labelledby="auth-title">
<h2 id="auth-title">Sign in or create an account</h2>
<form id="auth-form">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254">
<label for="password">Password (at least 12 characters)</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required>
<div class="actions"><button class="primary" type="submit">Sign in</button><button id="register" type="button">Create account</button></div>
</form><p id="auth-message" role="status" aria-live="polite"></p>
</section>
<section id="workspace" class="hidden">
<nav class="tabs" aria-label="Console sections">
<button type="button" data-view="overview" aria-pressed="true">Overview</button>
<button type="button" data-view="skills" aria-pressed="false">Skills</button>
<button type="button" data-view="agents" aria-pressed="false">Agents & Tools</button>
<button type="button" data-view="tasks" aria-pressed="false">Tasks</button>
<button type="button" data-view="keys" aria-pressed="false">API Keys</button>
</nav>
<section id="view-overview" class="view">
<div class="grid">
<article class="panel"><h2>Identity</h2><div id="identity" class="metric">—</div><p>Authenticated account</p></article>
<article class="panel"><h2>Skills</h2><div id="skill-count" class="metric">—</div><p>Registered skill documents</p></article>
<article class="panel"><h2>Tasks</h2><div id="task-count" class="metric">—</div><p>Your task history</p></article>
</div><div class="panel"><h2>Platform status</h2><p id="health">Checking service…</p></div>
</section>
<section id="view-skills" class="view hidden"><div class="panel"><h2>Registered Skills</h2><button id="refresh-skills" type="button">Refresh</button><ul id="skills-list"></ul></div></section>
<section id="view-agents" class="view hidden"><div class="panel"><h2>Agent Catalog</h2><ul id="agents-list"></ul></div><div class="panel"><h2>Tool Catalog</h2><ul id="tools-list"></ul></div><div class="panel"><h2>Plan a task</h2><form id="plan-form"><label for="task-input">Task description</label><textarea id="task-input" rows="3" minlength="3" maxlength="4000" required></textarea><div class="actions"><button class="primary" type="submit">Generate plan</button></div></form><pre id="plan-output" aria-live="polite"></pre></div></section>
<section id="view-tasks" class="view hidden"><div class="panel"><h2>Your Tasks</h2><button id="refresh-tasks" type="button">Refresh</button><ul id="tasks-list"></ul></div></section>
<section id="view-keys" class="view hidden"><div class="panel"><h2>API Keys</h2><form id="key-form"><label for="key-name">Key name</label><input id="key-name" required maxlength="80"><div class="actions"><button class="primary" type="submit">Create API key</button></div></form><p id="new-key" role="status" aria-live="polite"></p><ul id="keys-list"></ul></div></section>
</section>
<p id="global-message" role="status" aria-live="polite"></p>
</main>
<script>
(function(){
"use strict";
var token=sessionStorage.getItem("oah_session")||"";
var auth=document.getElementById("auth"), workspace=document.getElementById("workspace");
function message(id,text,kind){var el=document.getElementById(id);el.textContent=text;el.className=kind||"";}
function api(path,options){options=options||{};options.headers=Object.assign({"Content-Type":"application/json"},options.headers||{});if(token)options.headers.Authorization="Bearer "+token;return fetch(path,options).then(function(r){return r.json().catch(function(){return {};}).then(function(data){if(!r.ok)throw new Error(data.error||("HTTP "+r.status));return data;});});}
function showWorkspace(){auth.classList.add("hidden");workspace.classList.remove("hidden");document.getElementById("signout").classList.remove("hidden");loadAll();}
function showAuth(){workspace.classList.add("hidden");auth.classList.remove("hidden");document.getElementById("signout").classList.add("hidden");}
function loadAll(){api("/v1/auth/me").then(function(d){document.getElementById("identity").textContent=d.user.email;}).catch(function(e){token="";sessionStorage.removeItem("oah_session");showAuth();message("auth-message",e.message,"error");});api("/health").then(function(d){document.getElementById("health").textContent=d.service+" · database: "+d.database;}).catch(function(){document.getElementById("health").textContent="Health check unavailable";});loadSkills();loadTasks();loadCatalog();loadKeys();}
function listInto(id,items,formatter){var ul=document.getElementById(id);ul.replaceChildren();if(!items.length){var li=document.createElement("li");li.textContent="No items yet";ul.appendChild(li);return;}items.forEach(function(item){var li=document.createElement("li");li.textContent=formatter(item);ul.appendChild(li);});}
function loadSkills(){api("/v1/skills").then(function(d){document.getElementById("skill-count").textContent=String(d.count);listInto("skills-list",d.skills,function(x){return x.name+" · "+x.id+" · v"+x.version;});}).catch(function(e){message("global-message",e.message,"error");});}
function loadTasks(){api("/v1/tasks").then(function(d){document.getElementById("task-count").textContent=String(d.tasks.length);listInto("tasks-list",d.tasks,function(x){return x.id+" · "+x.status+" · "+x.created_at;});}).catch(function(e){message("global-message",e.message,"error");});}
function loadCatalog(){api("/v1/agents/catalog").then(function(d){listInto("agents-list",d.agents,function(x){return x.id+" · "+x.role+" · execution "+(x.executionEnabled?"enabled":"disabled");});});api("/v1/tools").then(function(d){listInto("tools-list",d.tools,function(x){return x.name+" · "+x.executionMode;});});}
function loadKeys(){api("/v1/auth/api-keys").then(function(d){var ul=document.getElementById("keys-list");ul.replaceChildren();d.keys.forEach(function(k){var li=document.createElement("li");var label=document.createElement("span");label.textContent=k.name+" · "+k.key_prefix+" · created "+k.created_at+" ";var button=document.createElement("button");button.type="button";button.textContent="Revoke";button.addEventListener("click",function(){api("/v1/auth/api-keys/"+encodeURIComponent(k.id),{method:"DELETE"}).then(loadKeys).catch(function(e){message("global-message",e.message,"error");});});li.append(label,button);ul.appendChild(li);});if(!d.keys.length)listInto("keys-list",[],function(){return "";});}).catch(function(e){message("global-message",e.message,"error");});}
document.getElementById("auth-form").addEventListener("submit",function(e){e.preventDefault();var payload={email:document.getElementById("email").value,password:document.getElementById("password").value};api("/v1/auth/login",{method:"POST",body:JSON.stringify(payload)}).then(function(d){token=d.token;sessionStorage.setItem("oah_session",token);message("auth-message","Signed in","success");showWorkspace();}).catch(function(err){message("auth-message",err.message,"error");});});
document.getElementById("register").addEventListener("click",function(){var payload={email:document.getElementById("email").value,password:document.getElementById("password").value};api("/v1/auth/register",{method:"POST",body:JSON.stringify(payload)}).then(function(d){token=d.token;sessionStorage.setItem("oah_session",token);showWorkspace();}).catch(function(err){message("auth-message",err.message,"error");});});
document.getElementById("signout").addEventListener("click",function(){token="";sessionStorage.removeItem("oah_session");showAuth();});
document.querySelectorAll("[data-view]").forEach(function(button){button.addEventListener("click",function(){document.querySelectorAll("[data-view]").forEach(function(b){b.setAttribute("aria-pressed",String(b===button));});document.querySelectorAll(".view").forEach(function(v){v.classList.add("hidden");});document.getElementById("view-"+button.dataset.view).classList.remove("hidden");});});
document.getElementById("refresh-skills").addEventListener("click",loadSkills);document.getElementById("refresh-tasks").addEventListener("click",loadTasks);
document.getElementById("plan-form").addEventListener("submit",function(e){e.preventDefault();api("/v1/agents/plan",{method:"POST",body:JSON.stringify({task:document.getElementById("task-input").value})}).then(function(d){document.getElementById("plan-output").textContent=JSON.stringify(d,null,2);}).catch(function(err){document.getElementById("plan-output").textContent=err.message;});});
document.getElementById("key-form").addEventListener("submit",function(e){e.preventDefault();api("/v1/auth/api-keys",{method:"POST",body:JSON.stringify({name:document.getElementById("key-name").value})}).then(function(d){message("new-key","New key (copy now; it will not be shown again): "+d.key,"success");loadKeys();}).catch(function(err){message("new-key",err.message,"error");});});
if(token)showWorkspace();else showAuth();
})();
</script>
</body>
</html>`;
