import { RUN_SECONDS, MAX_SPEED, STOP_SPACING, STOP_LANE_X, routeAt } from './route.js';
export const names=['천안역','삼도상가','중앙시장','남산중앙시장','청과시장','방죽안오거리','종합터미널','도솔광장'];
export function createState(random=Math.random){return {phase:'menu',time:RUN_SECONDS,x:STOP_LANE_X,z:0,v:0,angle:0,door:false,score:0,safety:100,combo:0,done:0,misses:0,index:0,passengers:12,notice:'',noticeTime:0,cooldown:0,stops:names.map((name,i)=>({name,z:200+i*STOP_SPACING,x:STOP_LANE_X,off:1+Math.floor(random()*4),on:2+Math.floor(random()*7),progress:0,status:'pending',quality:''}))};}
export function quality(s,t){const d=Math.hypot(s.x-t.x,s.z-t.z);return d<=1.5?'Perfect':d<=5?'Good':'Bad'}
export function canBoard(s,t){return !!t&&Math.abs(s.x-t.x)<=2&&Math.abs(s.z-t.z)<=10&&Math.hypot(s.x-t.x,s.z-t.z)<=15&&s.v===0&&s.door;}
export function notify(s,t){s.notice=t;s.noticeTime=2.8}
export function toggleDoor(s){if(s.phase==='playing'&&s.v===0){s.door=!s.door;notify(s,s.door?'도어가 열렸습니다':'도어가 닫혔습니다')}else if(s.phase==='playing')notify(s,'완전히 정지한 후 문을 열어주세요');}
function penalty(s,amount,text){s.safety=Math.max(0,s.safety-amount);s.score=Math.max(0,s.score-amount*10);if(s.cooldown<=0){notify(s,text);s.cooldown=2}}
export function update(s,keys,dt){if(s.phase!=='playing')return;dt=Math.max(0,Math.min(dt,1));s.time=Math.max(0,s.time-dt);s.noticeTime-=dt;s.cooldown-=dt;
const brake=keys.has('s')||keys.has('arrowdown'),gas=keys.has('w')||keys.has('arrowup'),reverse=keys.has('r'),steer=(keys.has('a')||keys.has('arrowleft')?-1:0)+(keys.has('d')||keys.has('arrowright')?1:0);
if(!s.door){if(brake){if(Math.abs(s.v)>10)penalty(s,dt*2,'급브레이크 · 안전도 하락');s.v=Math.sign(s.v)*Math.max(0,Math.abs(s.v)-12*dt)}else if(gas){s.v=Math.min(MAX_SPEED,s.v+6.8*dt)}else if(reverse){s.v=Math.max(-5,s.v-4*dt)}else{s.v=Math.sign(s.v)*Math.max(0,Math.abs(s.v)-1.3*dt)}if(Math.abs(s.v)<.04)s.v=0;
if(Math.abs(s.v)>0){
 const k=routeAt(s.z).k;
 // Heading is relative to the road; curvature rotates the road underneath the bus.
 const yawRate=steer*.65*Math.min(1,Math.abs(s.v)/4)*Math.sign(s.v);
 const ds=Math.cos(s.angle)*s.v*dt/(1-k*s.x);
 s.x+=Math.sin(s.angle)*s.v*dt;s.z+=ds;
 s.angle=Math.max(-1.4,Math.min(1.4,s.angle+yawRate*dt-k*ds));
}

if(Math.abs(s.v)>50/3.6)penalty(s,dt*1.5,'과속 · 제한속도 50 km/h');if(steer&&Math.abs(s.v)>11)penalty(s,dt*2,'급조향 · 안전도 하락');if(s.x>8||s.x<-8){s.x=Math.max(-8,Math.min(8,s.x));s.v*=.35;s.combo=0;penalty(s,8,'연석 충격 · 콤보 초기화');}}
const t=s.stops[s.index];if(t&&canBoard(s,t)){t.quality=quality(s,t);t.progress+=dt*({Perfect:4.5,Good:3,Bad:1.8}[t.quality]);if(t.progress>=t.off+t.on){t.progress=t.off+t.on;t.status='complete';s.done++;s.combo++;s.passengers=Math.max(0,s.passengers-t.off)+t.on;const mult=1+Math.min(s.combo-1,10)*.2;s.score+=Math.round((t.quality==='Perfect'?400:t.quality==='Good'?250:150)*mult);if(t.quality==='Perfect')s.time+=3;notify(s,`${t.quality} · 정차 완료${t.quality==='Perfect'?' +3초':''} · ×${mult.toFixed(1)}`);s.index++;}}
if(t&&t.status==='pending'&&s.z>t.z+16){t.status='skipped';s.misses++;s.combo=0;s.index++;notify(s,'미정차 · 콤보 초기화');}
if(s.done===8){s.phase='success'}else if(s.time<=0||s.misses>=3){s.phase='failed'}
while(s.index<8&&s.stops[s.index].status==='complete')s.index++;
}
export function grade(s){return s.phase!=='success'?'C':s.safety>=90&&s.score>=3000?'S':s.safety>=75?'A':s.safety>=50?'B':'C'}
