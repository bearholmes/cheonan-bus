// A small synthesized diesel engine: combustion harmonics, intake noise and rumble.
// One graph is reused across runs; no audio is created until a user gesture.
export function engineParameters(speed, accelerating) {
 const kmh=Math.min(100,Math.abs(speed)*3.6);
 const gear=Math.min(4,Math.floor(kmh/22));
 const revs=Math.min(1,(kmh-gear*22)/26);
 return {frequency:30+revs*42+(accelerating?10:0),cutoff:230+revs*550+(accelerating?160:0),volume:.10+Math.min(kmh/100,1)*.035+(accelerating?.025:0)};
}
export function createEngineSound(onUnavailable=()=>{}) {
 let context,master,engine,intake,filter,noiseFilter,pulse,muted=false,unavailable=false;
 const target=(param,value,time)=>{param.cancelScheduledValues(time);param.setTargetAtTime(value,time,.10);};
 function silence(){if(context&&master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);}}
 function initialize(){
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!AudioContext)throw Error('Audio is not supported');
  context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);
  filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=230;filter.Q.value=.5;filter.connect(master);
  const mix=context.createGain();mix.gain.value=.42;mix.connect(filter);
  engine=context.createOscillator();engine.type='sawtooth';engine.frequency.value=30;engine.connect(mix);
  intake=context.createOscillator();intake.type='triangle';intake.frequency.value=15;
  const low=context.createGain();low.gain.value=.28;intake.connect(low);low.connect(filter);
  pulse=context.createOscillator();pulse.frequency.value=8;
  const flutter=context.createGain();flutter.gain.value=.06;pulse.connect(flutter);flutter.connect(mix.gain);
  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.3;
  const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
  noiseFilter=context.createBiquadFilter();noiseFilter.type='bandpass';noiseFilter.frequency.value=180;noiseFilter.Q.value=.7;
  const noiseLevel=context.createGain();noiseLevel.gain.value=.18;noise.connect(noiseFilter);noiseFilter.connect(noiseLevel);noiseLevel.connect(master);
  engine.start();intake.start();pulse.start();noise.start();
 }
 function unlock(){
  if(unavailable||muted)return;
  try{if(!context)initialize();if(context.state!=='running')context.resume().catch(()=>{});}
  catch{silence();context?.close().catch(()=>{});unavailable=true;onUnavailable();}
 }
 function update(state,keys){
  if(!context||unavailable)return;
  if(muted||state.phase!=='playing'||document.hidden){silence();return;}
  const accelerating=!state.door&&!keys.has('s')&&!keys.has('arrowdown')&&(keys.has('w')||keys.has('arrowup')||keys.has('r'));
  const p=engineParameters(state.v,accelerating),time=context.currentTime;
  target(engine.frequency,p.frequency,time);target(intake.frequency,p.frequency/2,time);
  target(pulse.frequency,p.frequency/4,time);target(filter.frequency,p.cutoff,time);target(noiseFilter.frequency,p.cutoff*.7,time);
  target(master.gain,p.volume,time);
 }
 function toggle(){muted=!muted;if(muted)silence();else unlock();return muted;}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});
 window.addEventListener('pagehide',silence);
 return {unlock,update,toggle};
}
