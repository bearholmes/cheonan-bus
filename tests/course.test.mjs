import assert from 'node:assert/strict';
import {createState,update,canBoard} from '../src/engine.js';
import {routeAt,MAX_SPEED,STOP_LANE_X,turnGuide,roadPoint} from '../src/route.js';
assert.equal(createState().time,420);
const stops=createState().stops;for(let i=1;i<8;i++)assert.equal(stops[i].z-stops[i-1].z,400);
assert(turnGuide(250).includes('우회전'));assert(turnGuide(650).includes('좌회전'));
for(let boundary of [290,400,690,800,1090,1200,3199.999,3200]){const a=routeAt(boundary-.001),b=routeAt(boundary+.001);assert(Math.hypot(a.x-b.x,a.z-b.z)<.01);assert(Math.abs(a.heading-b.heading)<.001);}
let fast=createState();fast.phase='playing';fast.z=-10000;for(let i=0;i<600;i++)update(fast,new Set(['w']),1/60);assert.equal(fast.v,MAX_SPEED);assert.equal(Math.round(fast.v*3.6),100);
const s=createState(()=>.5);s.phase='playing';let collisions=0;
for(let frame=0;frame<420*60&&s.phase==='playing';frame++){
 const t=s.stops[s.index];const remain=t?t.z-s.z:100;
 if(t&&Math.abs(remain)<1&&s.v===0){s.door=true;}else if(s.door&&!canBoard(s,t))s.door=false;
 const k=routeAt(s.z).k;const soon=routeAt(s.z+20).k;
 let desired= k||soon?8:12;
 if(remain<18)desired=Math.min(desired,Math.sqrt(Math.max(0,remain-.4)*12));
 if(remain<.6)desired=0;
 const keys=new Set();if(s.v>desired+.08)keys.add('s');else if(s.v<desired-.08)keys.add('w');
 const targetAngle=Math.max(-.15,Math.min(.15,(STOP_LANE_X-s.x)*.15));
 const yaw=k*s.v+(targetAngle-s.angle)*3;
 if(yaw>.08)keys.add('d');if(yaw<-.08)keys.add('a');
 const safety=s.safety;update(s,keys,1/60);if(safety-s.safety>7)collisions++;
}
assert.equal(s.phase,'success',JSON.stringify({phase:s.phase,index:s.index,z:s.z,time:s.time,x:s.x}));assert.equal(collisions,0);assert(s.time>0);console.log(`PASS: 100km/h cap, 400m spacing, route continuity, left/right turns, all 8 stops in ${(420-s.time).toFixed(1)}s net of bonuses, no curb impacts`);

// Verify screen-space steering with the reflected chase-camera coordinates.
for(const z of [0,450,850])for(const [key,sign] of [['a',-1],['d',1]]){
 const s=createState();s.phase='playing';s.z=z;s.v=8;const before=roadPoint(s.x,s.z);
 for(let i=0;i<12;i++)update(s,new Set([key]),1/60);
 const after=roadPoint(s.x,s.z),dx=-(after.x-before.x),dz=after.z-before.z;
 assert.equal(Math.sign(dx*-Math.cos(before.heading)+dz*-Math.sin(before.heading)),sign);
}
console.log('PASS: screen-space left/right steering on different road headings');
