export const RUN_SECONDS=420;
export const MAX_SPEED=100/3.6;
// Curbside lane spans x=5 to x=9.5; align the stop and spawn to its center.
export const STOP_LANE_X=7.25;
export const STOP_SPACING=400;
const TURN_START=290,TURN_LENGTH=110;
const directions=[1,-1,1,-1,1,-1,1,-1];
const segments=[];let x=0,z=0,heading=0;
for(let i=0;i<8;i++){
 segments.push({start:i*400,length:290,x,z,heading,k:0});
 x+=Math.sin(heading)*290;z+=Math.cos(heading)*290;
 const k=directions[i]*Math.PI/2/TURN_LENGTH;
 segments.push({start:i*400+290,length:110,x,z,heading,k});
 x+=(Math.cos(heading)-Math.cos(heading+k*110))/k;
 z+=(Math.sin(heading+k*110)-Math.sin(heading))/k;heading+=k*110;
}
export function routeAt(distance){
 let seg=segments.find(s=>distance<s.start+s.length)||segments.at(-1);
 if(distance<0)seg=segments[0];
 let d=distance-seg.start;
 if(distance>=3200){const end=routeAt(3199.999);const h=end.heading;return{x:end.x+Math.sin(h)*(distance-3199.999),z:end.z+Math.cos(h)*(distance-3199.999),heading:h,k:0};}
 const h=seg.heading,k=seg.k;
 return {x:seg.x+(k?(Math.cos(h)-Math.cos(h+k*d))/k:Math.sin(h)*d),z:seg.z+(k?(Math.sin(h+k*d)-Math.sin(h))/k:Math.cos(h)*d),heading:h+k*d,k};
}
export function roadPoint(lateral,distance){const p=routeAt(distance);return{x:p.x+Math.cos(p.heading)*lateral,z:p.z-Math.sin(p.heading)*lateral,heading:p.heading};}
export function turnGuide(distance){let i=Math.max(0,Math.floor(distance/400));if(i>=8)return '직진';const offset=distance-i*400;if(offset>=TURN_START)return `${directions[i]>0?'우회전 →':'← 좌회전'} · 감속 후 조향`;return `${Math.ceil(TURN_START-offset)}m 앞 ${directions[i]>0?'우회전 →':'← 좌회전'}`;}
