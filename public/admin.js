let token=localStorage.getItem('ax_admin_token')||'',services=[],courses=[];
const $=s=>document.querySelector(s);
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed');return d}
$('#request').onclick=async()=>{try{const d=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({email:$('#email').value,phone:$('#phone').value})});$('#otpFields').hidden=false;$('#loginMsg').textContent=d.message}catch(e){$('#loginMsg').textContent=e.message}};
$('#verify').onclick=async()=>{try{const d=await api('/api/auth/verify-otp',{method:'POST',body:JSON.stringify({email:$('#email').value,phone:$('#phone').value,emailCode:$('#emailCode').value,phoneCode:$('#phoneCode').value})});token=d.token;localStorage.setItem('ax_admin_token',token);showDashboard()}catch(e){$('#loginMsg').textContent=e.message}};
function logout(){localStorage.removeItem('ax_admin_token');token='';location.reload()}
function showDashboard(){ $('#loginBox').hidden=true;$('#dashboard').hidden=false;refresh().catch(e=>alert(e.message))}
async function refresh(){const o=await api('/api/admin/overview');$('#stats').innerHTML=Object.entries(o.counts).map(([k,v])=>`<div class="item"><span class="tag">${k.toUpperCase()}</span><h2>${v}</h2></div>`).join('');$('#activity').innerHTML=o.recent.map(x=>`<p>${x.created_at} — <b>${x.kind}</b> #${x.item_id||''} ${x.details||''}</p>`).join('');
services=await api('/api/admin/services');$('#servicesAdmin').innerHTML=services.map(s=>`<div class="item"><h3>${s.title}</h3><p>${s.description}</p><div><button class="btn secondary" onclick="editService(${s.id})">Edit</button> <button class="btn secondary" onclick="deleteService(${s.id})">Delete</button></div></div>`).join('');
courses=await api('/api/admin/courses');$('#coursesAdmin').innerHTML=courses.map(c=>`<div class="item"><h3>${c.title}</h3><p>${c.description}</p><b>Free course</b><div><button class="btn secondary" onclick="editCourse(${c.id})">Edit</button> <button class="btn secondary" onclick="deleteCourse(${c.id})">Delete</button></div></div>`).join('');
const settings=await api('/api/admin/settings');$('#adsense').value=settings.adsense_client;
const comments=await api('/api/admin/comments');$('#commentsAdmin').innerHTML=comments.map(c=>`<p>${c.name}: ${c.comment} <button onclick="deleteComment(${c.id})">Delete</button></p>`).join('')}
function newService(){serviceForm({})}function editService(id){serviceForm(services.find(s=>s.id===id))}
async function serviceForm(s){const title=prompt('Service title',s.title||'');if(title===null)return;const description=prompt('Description',s.description||'')||'';await api('/api/admin/services',{method:'POST',body:JSON.stringify({id:s.id,title,description,active:true})});refresh()}
async function deleteService(id){if(confirm('Delete service?')){await api('/api/admin/services/'+id,{method:'DELETE'});refresh()}}
function newCourse(){courseForm({})}function editCourse(id){courseForm(courses.find(c=>c.id===id))}
async function courseForm(c){const title=prompt('Course title',c.title||'');if(title===null)return;const description=prompt('Description',c.description||'')||'',video_url=prompt('Video URL (YouTube/Vimeo/unlisted link)',c.video_url||'')||'';await api('/api/admin/courses',{method:'POST',body:JSON.stringify({id:c.id,title,description,video_url,active:true})});refresh()}
async function deleteCourse(id){if(confirm('Delete course?')){await api('/api/admin/courses/'+id,{method:'DELETE'});refresh()}}
async function saveSettings(){await api('/api/admin/settings',{method:'POST',body:JSON.stringify({adsense_client:$('#adsense').value})});alert('Settings saved')}
async function deleteComment(id){await api('/api/admin/comments/'+id,{method:'DELETE'});refresh()}
if(token)showDashboard();
