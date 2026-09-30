// EventHub backend: Node.js (zero dependencies) + built-in SQLite database (Node 22.5+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=process.env.PORT||3000,DIR=path.join(__dirname,'data');
fs.mkdirSync(DIR,{recursive:true});
const db=new DatabaseSync(path.join(DIR,'eventhub.db'));
db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,full_name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'ATTENDEE' CHECK(role IN('ATTENDEE','ORGANIZER','ADMIN')),is_active INTEGER DEFAULT 1,created_at TEXT DEFAULT (date('now')));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,organizer_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,category TEXT,title TEXT NOT NULL,description TEXT,event_type TEXT DEFAULT 'OFFLINE',venue TEXT,location TEXT,meeting_url TEXT,event_date TEXT NOT NULL,start_time TEXT,end_time TEXT,capacity INTEGER NOT NULL CHECK(capacity>0),price REAL DEFAULT 0 CHECK(price>=0),status TEXT DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','CANCELLED','COMPLETED')),agenda TEXT,created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS registrations(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,attendee_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,status TEXT DEFAULT 'REGISTERED' CHECK(status IN('REGISTERED','CANCELLED','ATTENDED','WAITLISTED')),registered_at TEXT DEFAULT (date('now')),UNIQUE(event_id,attendee_id));
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,title TEXT,message TEXT,is_read INTEGER DEFAULT 0,created_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_activity(id TEXT PRIMARY KEY,admin_id TEXT,action TEXT,target_id TEXT,created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS i_ev ON events(status,event_date);CREATE INDEX IF NOT EXISTS i_reg ON registrations(event_id,status);CREATE INDEX IF NOT EXISTS i_n ON notifications(user_id,is_read);`);
const Q=(s,...a)=>db.prepare(s).all(...a),Q1=(s,...a)=>db.prepare(s).get(...a),X=(s,...a)=>db.prepare(s).run(...a);
const uid=()=>crypto.randomUUID(),iso=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
const hp=p=>{const s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(p,s,32).toString('hex')};
const vp=(p,h)=>{const [s,k]=h.split(':');return crypto.timingSafeEqual(Buffer.from(k,'hex'),crypto.scryptSync(p,s,32))};
const SF=path.join(DIR,'secret.txt');if(!fs.existsSync(SF))fs.writeFileSync(SF,crypto.randomBytes(32).toString('hex'));
const SECRET=process.env.JWT_SECRET||fs.readFileSync(SF,'utf8');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const sign=u=>{const h=b64({alg:'HS256',typ:'JWT'})+'.'+b64({id:u.id,exp:Date.now()+6048e5});return h+'.'+crypto.createHmac('sha256',SECRET).update(h).digest('base64url')};
const verify=t=>{try{const [a,b,c]=t.split('.');if(crypto.createHmac('sha256',SECRET).update(a+'.'+b).digest('base64url')!==c)return null;const p=JSON.parse(Buffer.from(b,'base64url'));return p.exp>Date.now()?p:null}catch{return null}};
const E=(c,m)=>Object.assign(new Error(m),{code:c});
const notify=(u,t,m)=>X('INSERT INTO notifications VALUES(?,?,?,?,0,?)',uid(),u,t,m,Date.now());
function seed(){if(Q1('SELECT 1 x FROM profiles'))return;const P='Password@123';
 [['u1','Admin User','admin@eventhub.demo','ADMIN'],['u2','Kavya Events','organizer@eventhub.demo','ORGANIZER'],['u3','Arjun Kumar','attendee@eventhub.demo','ATTENDEE'],['u4','Meera Nair','meera@eventhub.demo','ATTENDEE'],['u5','Rahul Verma','rahul@eventhub.demo','ATTENDEE']].forEach(u=>X('INSERT INTO profiles(id,full_name,email,password_hash,role) VALUES(?,?,?,?,?)',u[0],u[1],u[2],hp(P),u[3]));
 const ag=JSON.stringify([['09:30','Registration & welcome'],['10:30','Keynote'],['13:00','Lunch & networking'],['14:00','Workshops / panels'],['16:30','Closing & awards']]);const ids=[];
 [['Coimbatore DevCon 2026','Technology','Coimbatore','CODISSIA Trade Fair Complex',12,300,499],['Chennai Build Sprint','Hackathon','Chennai','IIT Madras Research Park',20,120,0],['Bangalore Founders Meetup','Startup','Bangalore','WeWork Indiranagar',8,80,199],['React & TypeScript Masterclass','Workshop','Online','Zoom',15,50,299,'ONLINE'],['Hyderabad Business Summit','Business','Hyderabad','HICC Novotel',30,400,999],['Salem Cultural Fest','Cultural','Salem','Town Hall',25,500,0],['Mumbai Tech Networking Night','Networking','Mumbai','Bandra Kurla Complex',6,3,150],['Delhi Inter-College Cricket Cup','Sports','Delhi','Jawaharlal Nehru Stadium',18,200,100],['AI for Everyone Webinar','Technology','Online','Google Meet',5,300,0,'ONLINE'],['Startup Pitch Draft','Startup','Chennai','T-Hub Annexe',40,60,0,'OFFLINE','DRAFT']].forEach((e,i)=>{const id=uid();ids.push(id);
  X('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',id,'u2',e[1],e[0],e[0]+' brings together practitioners, students and founders for a day of learning and networking in '+e[2]+'.',e[7]||'OFFLINE',e[3],e[2],iso(e[4]),'10:00','17:00',e[5],e[6],e[8]||'PUBLISHED',ag)});
 [[0,'u3'],[0,'u4'],[0,'u5'],[1,'u3'],[1,'u4'],[2,'u4'],[6,'u3'],[6,'u4'],[6,'u5']].forEach(([i,u])=>X('INSERT INTO registrations(id,event_id,attendee_id) VALUES(?,?,?)',uid(),ids[i],u));
 notify('u3','Welcome to EventHub','Explore events near you.')}
seed();
const cnt="(SELECT count(*) FROM registrations r WHERE r.event_id=e.id AND r.status='REGISTERED')";
function state(u){const id=u?u.id:'';const own=u?Q('SELECT event_id FROM registrations WHERE attendee_id=?',id).map(r=>r.event_id):[];
 const vis=u&&u.role==='ADMIN'?'1=1':u&&u.role==='ORGANIZER'?"(e.status='PUBLISHED' OR e.organizer_id=?)":"e.status='PUBLISHED'";
 const events=Q(`SELECT e.id,e.organizer_id org,e.category cat,e.title,e.description "desc",e.event_type type,e.venue,e.location city,e.meeting_url link,e.event_date date,e.start_time "start",e.end_time "end",e.capacity cap,e.price,e.status,e.agenda,${cnt} count FROM events e WHERE ${vis}${vis.includes('?')?'':''} OR e.id IN (${own.map(()=>'?').join(',')||"''"})`,...(vis.includes('?')?[id]:[]),...own).map(e=>({...e,agenda:JSON.parse(e.agenda||'[]')}));
 const rs="SELECT id,event_id ev,attendee_id \"user\",status st,registered_at \"at\" FROM registrations";
 const regs=!u?[]:u.role==='ADMIN'?Q(rs):u.role==='ORGANIZER'?Q(rs+' WHERE attendee_id=? OR event_id IN (SELECT id FROM events WHERE organizer_id=?)',id,id):Q(rs+' WHERE attendee_id=?',id);
 const seen=new Set(regs.map(r=>r.user));
 const users=Q('SELECT id,full_name name,email,role,is_active active,created_at "at" FROM profiles').map(x=>{const o={id:x.id,name:x.name,role:x.role};if(u&&(u.role==='ADMIN'||x.id===id||(u.role==='ORGANIZER'&&seen.has(x.id))))Object.assign(o,{email:x.email,active:!!x.active,at:x.at});return o});
 const notes=u?Q('SELECT id,title,message msg,is_read "read",created_at "at" FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30',id).map(n=>({...n,read:!!n.read,user:id})):[];
 const c=t=>Q1(t).n;return {me:u?{id:u.id,name:u.full_name,email:u.email,role:u.role}:null,events,regs,users,notes,stats:{events:c("SELECT count(*) n FROM events WHERE status='PUBLISHED'"),organizers:c("SELECT count(*) n FROM profiles WHERE role='ORGANIZER'"),users:c('SELECT count(*) n FROM profiles'),regs:c("SELECT count(*) n FROM registrations WHERE status='REGISTERED'")}}}
function valid(f){const s=x=>String(x??'').trim();if(s(f.title).length<3)throw E(400,'Title is too short');if(s(f.desc).length<10)throw E(400,'Description needs 10+ characters');if(!/^\d{4}-\d{2}-\d{2}$/.test(s(f.date)))throw E(400,'Choose a date');if(!f.start||!f.end||f.end<=f.start)throw E(400,'End time must be after start time');
 if(!(+f.cap>=1))throw E(400,'Capacity must be at least 1');if(!(+f.price>=0))throw E(400,'Price cannot be negative');if(!['ONLINE','OFFLINE'].includes(f.type))throw E(400,'Invalid type');if(f.type==='ONLINE'&&!/^https?:\/\//.test(s(f.link)))throw E(400,'Online events need a meeting link');if(!['DRAFT','PUBLISHED','CANCELLED','COMPLETED'].includes(f.status))throw E(400,'Invalid status');
 return [s(f.cat),s(f.title),s(f.desc),f.type,s(f.venue),f.type==='ONLINE'?'Online':s(f.city),s(f.link),s(f.date),f.start,f.end,+f.cap,+f.price,f.status]}
const mine=(u,id)=>{const e=Q1('SELECT * FROM events WHERE id=?',id);if(!e)throw E(404,'Event not found');if(e.organizer_id!==u.id&&u.role!=='ADMIN')throw E(403,'Not your event');return e};
const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}; // BEGIN IMMEDIATE = write lock, so seats cannot be overbooked
function handle(m,url,b,u){let p;
 const need=(...r)=>{if(!u)throw E(401,'Please login first');if(r.length&&!r.includes(u.role))throw E(403,'You do not have permission');return u};
 const tok=x=>({token:sign(x)});
 if(m==='POST'&&url==='/auth/register'){const n=String(b.name||'').trim(),em=String(b.email||'').toLowerCase().trim();if(n.length<2)throw E(400,'Enter your full name');if(!/^\S+@\S+\.\S+$/.test(em))throw E(400,'Enter a valid email');if(String(b.pw||'').length<8)throw E(400,'Password needs 8+ characters');if(Q1('SELECT 1 x FROM profiles WHERE email=?',em))throw E(409,'Email already registered');
  const id=uid();X('INSERT INTO profiles(id,full_name,email,password_hash,role) VALUES(?,?,?,?,?)',id,n,em,hp(b.pw),b.role==='ORGANIZER'?'ORGANIZER':'ATTENDEE');return tok({id})}
 if(m==='POST'&&url==='/auth/login'){const x=Q1('SELECT * FROM profiles WHERE email=?',String(b.email||'').toLowerCase());if(!x||!vp(String(b.pw||''),x.password_hash))throw E(401,'Invalid email or password');if(!x.is_active)throw E(403,'Account suspended');return tok(x)}
 if(m==='GET'&&url==='/state')return state(u);
 if(m==='POST'&&url==='/events'){need('ORGANIZER','ADMIN');const v=valid(b);const id=uid();X('INSERT INTO events(id,organizer_id,category,title,description,event_type,venue,location,meeting_url,event_date,start_time,end_time,capacity,price,status,agenda) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,u.id,...v,'[["10:00","Opening"],["11:00","Main session"],["16:00","Wrap-up"]]');return {id}}
 if(p=url.match(/^\/events\/([\w-]+)$/)){if(m==='PUT'){need('ORGANIZER','ADMIN');mine(u,p[1]);const v=valid(b);X('UPDATE events SET category=?,title=?,description=?,event_type=?,venue=?,location=?,meeting_url=?,event_date=?,start_time=?,end_time=?,capacity=?,price=?,status=? WHERE id=?',...v,p[1]);return {ok:1}}
  if(m==='DELETE'){need('ORGANIZER','ADMIN');mine(u,p[1]);X('DELETE FROM events WHERE id=?',p[1]);return {ok:1}}}
 if(m==='PATCH'&&(p=url.match(/^\/events\/([\w-]+)\/status$/))){need('ORGANIZER','ADMIN');const e=mine(u,p[1]);if(!['DRAFT','PUBLISHED','CANCELLED','COMPLETED'].includes(b.status))throw E(400,'Invalid status');X('UPDATE events SET status=? WHERE id=?',b.status,e.id);
  if(b.status==='CANCELLED')Q("SELECT attendee_id a FROM registrations WHERE event_id=? AND status='REGISTERED'",e.id).forEach(r=>notify(r.a,'Event cancelled',e.title+' was cancelled'));return {ok:1}}
 if(p=url.match(/^\/events\/([\w-]+)\/register$/)){const id=p[1];
  if(m==='POST'){need('ATTENDEE');return tx(()=>{const e=Q1(`SELECT *,${cnt} c FROM events e WHERE id=?`,id);if(!e)throw E(404,'Event not found');if(e.status!=='PUBLISHED')throw E(400,'Event is not open for registration');
   const r=Q1('SELECT * FROM registrations WHERE event_id=? AND attendee_id=?',id,u.id);if(r&&r.status==='REGISTERED')throw E(409,'You are already registered');if(e.c>=e.capacity)throw E(409,'Registration Full');
   r?X("UPDATE registrations SET status='REGISTERED',registered_at=date('now') WHERE id=?",r.id):X('INSERT INTO registrations(id,event_id,attendee_id) VALUES(?,?,?)',uid(),id,u.id);
   notify(u.id,'Registration successful','You are registered for '+e.title);notify(e.organizer_id,'New registration',u.full_name+' registered for '+e.title);if(e.c+1>=e.capacity*.8)notify(e.organizer_id,'Almost full',e.title+' is over 80% full');return {ok:1}})}
  if(m==='DELETE'){need();const r=Q1("SELECT r.id,e.title FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.event_id=? AND r.attendee_id=? AND r.status='REGISTERED'",id,u.id);if(!r)throw E(404,'No active registration');X("UPDATE registrations SET status='CANCELLED' WHERE id=?",r.id);notify(u.id,'Registration cancelled','You cancelled '+r.title);return {ok:1}}}
 if(m==='POST'&&url==='/notifications/read-all'){need();X('UPDATE notifications SET is_read=1 WHERE user_id=?',u.id);return {ok:1}}
 if(m==='PATCH'&&(p=url.match(/^\/admin\/users\/([\w-]+)\/toggle$/))){need('ADMIN');if(p[1]===u.id)throw E(400,'You cannot suspend yourself');X('UPDATE profiles SET is_active=1-is_active WHERE id=?',p[1]);X('INSERT INTO admin_activity(id,admin_id,action,target_id) VALUES(?,?,?,?)',uid(),u.id,'TOGGLE_USER',p[1]);return {ok:1}}
 throw E(404,'Not found')}
const hits={};
http.createServer((req,res)=>{const url=req.url.split('?')[0];const send=(c,o,t='application/json')=>{res.writeHead(c,{'Content-Type':t});res.end(t==='application/json'?JSON.stringify(o):o)};
 if(!url.startsWith('/api/'))return fs.readFile(path.join(__dirname,'public','index.html'),(e,d)=>e?send(404,'Not found','text/plain'):send(200,d,'text/html; charset=utf-8'));
 if(url.startsWith('/api/auth')){const k=req.socket.remoteAddress,n=Date.now();hits[k]=(hits[k]||[]).filter(t=>n-t<6e4);if(hits[k].push(n)>30)return send(429,{error:'Too many attempts, wait a minute'})}
 let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e6)req.destroy()});req.on('end',()=>{try{const b=raw?JSON.parse(raw):{};const t=(req.headers.authorization||'').split(' ')[1],p=t&&verify(t);const u=p?Q1('SELECT * FROM profiles WHERE id=? AND is_active=1',p.id):null;send(200,handle(req.method,url.slice(4),b,u))}catch(e){send(e.code||500,{error:e.code?e.message:'Server error'});if(!e.code)console.error(e)}})
}).listen(PORT,()=>console.log('EventHub running → http://localhost:'+PORT));
