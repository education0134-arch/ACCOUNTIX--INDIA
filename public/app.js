const $=s=>document.querySelector(s);
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
function event(kind,id,details=''){api('/api/event',{method:'POST',body:JSON.stringify({kind,item_id:id,details})}).catch(()=>{})}
function waLink(number,service=''){const msg=service?`Hello ACCOUNTIX INDIA, I am interested in your ${service} service.`:'Hello ACCOUNTIX INDIA, I would like to enquire about your services.';return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function load(){
 const data=await api('/api/public');
 $('#serviceGrid').innerHTML=data.services.map(s=>`<article class="item"><span class="tag">BUSINESS SUPPORT</span><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><a class="btn secondary" target="_blank" rel="noopener" href="${waLink(data.whatsapp,s.title)}" onclick="eventTrack('share',${s.id},'WhatsApp enquiry')">Contact on WhatsApp</a></article>`).join('');
 $('#courseGrid').innerHTML=data.courses.map(c=>`<article class="item"><span class="tag">FREE COURSE</span><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="price">Free</div>${c.video_url?`<a class="btn" target="_blank" rel="noopener" href="${esc(c.video_url)}" onclick="eventTrack('view',${c.id})">Watch lesson</a>`:`<button class="btn" onclick="courseInfo(${c.id},'${esc(c.title)}')">View lessons</button>`}<div class="commentbox"><button class="btn secondary" onclick="likeCourse(${c.id})">♥ Like</button> <button class="btn secondary" onclick="shareCourse('${esc(c.title)}',${c.id})">Share</button><div class="comments" id="comments-${c.id}"></div><input id="name-${c.id}" placeholder="Your name (optional)"><textarea id="comment-${c.id}" placeholder="Leave a comment"></textarea><button class="btn secondary" onclick="commentCourse(${c.id})">Post comment</button></div></article>`).join('');
 $('#year').textContent=new Date().getFullYear();
 if(data.adsense && /^ca-pub-\d+$/.test(data.adsense)){const s=document.createElement('script');s.async=true;s.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${data.adsense}`;s.crossOrigin='anonymous';document.head.appendChild(s);}
 if(data.whatsapp){const wa=$('#mainWhatsApp');if(wa)wa.href=waLink(data.whatsapp);}
 data.courses.forEach(c=>{event('view',c.id);loadComments(c.id)});
}
function eventTrack(k,id){event(k,id)}
function courseInfo(id,title){alert(`${title}\n\nCourse lessons will be added by the website admin. Check back soon.`);event('view',id)}
function visitorKey(){let k=localStorage.getItem('ax_visitor');if(!k){k=crypto.randomUUID();localStorage.setItem('ax_visitor',k)}return k}
async function likeCourse(id){const d=await api('/api/like',{method:'POST',body:JSON.stringify({course_id:id,visitor_key:visitorKey()})});event('like',id,`likes ${d.count}`);alert('Thanks for liking this course!')}
async function shareCourse(title,id){const url=location.href.split('#')[0]+'#courses';if(navigator.share)await navigator.share({title:'ACCOUNTIX INDIA - '+title,url});else{await navigator.clipboard.writeText(url);alert('Course link copied!')}event('share',id)}
async function commentCourse(id){const name=$(`#name-${id}`).value||'Guest',comment=$(`#comment-${id}`).value;if(!comment.trim())return alert('Please write a comment');await api('/api/comments',{method:'POST',body:JSON.stringify({course_id:id,name,comment})});$(`#comment-${id}`).value='';loadComments(id);alert('Comment posted')}
async function loadComments(id){try{const d=await api('/api/comments/'+id);const el=$(`#comments-${id}`);if(el)el.innerHTML=d.slice(0,5).map(x=>`<p><b>${esc(x.name)}</b>: ${esc(x.comment)}</p>`).join('')}catch{}}
load().catch(e=>console.error(e));
