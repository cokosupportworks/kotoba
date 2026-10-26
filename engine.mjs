export const median = a => {const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;};
export function features(p,w,h){
 const xy=i=>[p[i].x*w,p[i].y*h];
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const left=xy(33),right=xy(263),scale=dist(left,right);
 if(!Number.isFinite(scale)||scale<w*.12||scale>w*.65)return null;
 // Measure geometry in pixels: normalized x and y have different units on a non-square frame.
 const width=dist(xy(61),xy(291))/scale,height=dist(xy(13),xy(14))/scale;
 const nose=xy(1),center=[(left[0]+right[0])/2,(left[1]+right[1])/2];
 const roll=Math.abs(Math.atan2(right[1]-left[1],right[0]-left[0]));
 const horizontal=Math.abs((nose[0]-center[0])*(right[0]-left[0])+(nose[1]-center[1])*(right[1]-left[1]))/(scale*scale);
 if(roll>.30||horizontal>.20||p.some(q=>q.x<.015||q.x>.985||q.y<.015||q.y>.985))return null;
 return [width,height];
}
export function summarize(samples){const center=[0,1].map(i=>median(samples.map(s=>s[i])));const spread=[0,1].map(i=>median(samples.map(s=>Math.abs(s[i]-center[i])))*1.4826);return {center,spread};}
export const scales = p => p.spread.map((s,i)=>Math.max(i===0?.035:.025,Math.min(s*3,i===0?.07:.06)));
export function distance(f,p){const s=scales(p);return Math.hypot(...f.map((v,i)=>(v-p.center[i])/s[i]));}
export function classify(f,profiles,tolerance=1){
 const ranked=Object.entries(profiles).map(([key,p])=>({key,d:distance(f,p)})).sort((a,b)=>a.d-b.d);
 if(!ranked.length||ranked[0].d>2*tolerance||(ranked[1]&&ranked[1].d-ranked[0].d<.65))return '不確か';
 return ranked[0].key;
}
export class HoldTimer{
 constructor(){this.reset();}
 reset(){this.ms=0;this.last=null;this.miss=null;this.previousGood=false;this.done=false;}
 update(now,good,required){
  if(this.done)return this.ms;
  const delta=this.last===null?0:now-this.last;this.last=now;
  if(delta>250){this.ms=0;this.previousGood=false;this.miss=null;}
  if(good){if(this.previousGood)this.ms+=Math.max(0,delta);this.miss=null;}
  else {if(this.miss===null)this.miss=now;if(now-this.miss>250)this.ms=0;}
  this.previousGood=good;
  if(this.ms>=required){this.ms=required;this.done=true;}
  return this.ms;
 }
}
