import assert from 'node:assert/strict';
import {createEngineSound,engineParameters} from '../src/audio.js';
const listeners={};globalThis.document={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};globalThis.window={addEventListener:(name,fn)=>listeners[name]=fn};
let contexts=0,outputs=[];
const param=()=>({value:0,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;},setValueAtTime(value){this.value=value;}});
const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},start(){}});
globalThis.AudioContext=class{
 constructor(){contexts++;this.currentTime=0;this.sampleRate=100;this.state='suspended';this.destination={};}
 createGain(){const n=node();outputs.push(n);return n;}
 createOscillator(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}
 createBuffer(){return {getChannelData:()=>new Float32Array(200)};}
 async resume(){this.state='running';}async close(){this.state='closed';}
};
const sound=createEngineSound();assert.equal(contexts,0,'Intro must not initialize audio');
sound.unlock();sound.unlock();assert.equal(contexts,1,'Restarts must reuse the audio graph');
const output=outputs[0].gain,state={phase:'playing',v:0,door:false};
sound.update(state,new Set());assert(output.value>0,'Idle engine must be audible');
const idle=engineParameters(5,false),gas=engineParameters(5,true);assert(gas.frequency>idle.frequency&&gas.volume>idle.volume);
assert.deepEqual(engineParameters(-5,true),gas,'Reverse should use absolute road speed');
assert.equal(sound.toggle(),true);sound.update(state,new Set(['w']));assert.equal(output.value,0,'Mute must survive frame updates');
sound.toggle();sound.update(state,new Set());document.hidden=true;listeners.visibilitychange();assert.equal(output.value,0,'Background tab must silence without a frame');
document.hidden=false;sound.update({...state,phase:'success'},new Set());assert.equal(output.value,0,'Results must be silent');
console.log('PASS: lazy audio, reusable graph, throttle, reverse, mute, background and game end');
