import {features,registerProfile,classify,HoldTimer} from './engine.mjs?v=3';
const $=id=>document.getElementById(id);
const profiles={};const timer=new HoldTimer();
let target='あ',model=null,stream=null,audioStream=null,audioContext=null,analyser=null,audioData=null;
let active=false,starting=false,raf=0,lastVideo=-1,lastInference=0,latest=null,capture=null,count=0,level=0,lastAudio=0;
const hints={'あ':'おくちを たてに あけよう','い':'おくちを よこに ひこう','う':'おくちを すぼめよう','お':'おくちを まるく あけよう','べー':'したを べーっと だしてみよう'};
let teacherConfirmed=false;
function teacherButton(){ $('teacherHold').setAttribute('aria-pressed',String(teacherConfirmed));say('teacherHold',teacherConfirmed?'先生：形が変わったので計測を止める':'先生：舌を確認して計測を始める');$('teacherHold').disabled=timer.done;}
function modeUI(){const tongue=target==='べー';$('teacherControls').hidden=!tongue;$('tongue').style.display=tongue?'':'none';$('tongue').removeAttribute('hidden');$('mode').disabled=tongue;say('modeLabel',tongue?'舌を保つ・先生確認':$('mode').selectedOptions[0].textContent);}
$('teacherHold').onclick=()=>{if(!active||!latest){say('feedback','かおを カメラに うつしてね');return;}if(timer.done)return;teacherConfirmed=!teacherConfirmed;teacherButton();};
function say(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function reset(){teacherConfirmed=false;timer.reset();teacherButton();document.body.classList.remove('success');paintProgress();}
function paintProgress(){const seconds=Number($('seconds').value);const percent=Math.min(100,timer.ms/(seconds*10));$('progress').style.width=percent+'%';$('progress').setAttribute('aria-valuenow',Math.round(percent));say('time',`${(timer.ms/1000).toFixed(1)} / ${seconds} 秒`);}
function ready(){return target==='べー'||['安静',target].every(k=>profiles[k]);}
function profileStatus(){say('calibrationStatus',['安静','あ','い','う','お'].map(k=>`${k}：${profiles[k]?'登録済み':'未登録'}`).join(' ／ '));}
function registrationMessage(text){say('registrationMessage',text);say('message',text);}
function select(value){target=value;reset();document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target===target)));say('targetText',target);say('instruction',hints[target]);$('face').setAttribute('aria-label',target+'の口型のイメージ');const [rx,ry]={'あ':[26,34],'い':[49,12],'う':[16,19],'お':[24,28],'べー':[34,23]}[target];$('mouth').setAttribute('rx',rx);$('mouth').setAttribute('ry',ry);modeUI();say('feedback',active?'おてほんを みてみよう':'まずは カメラを はじめよう');}
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{if(!capture)select(b.dataset.target);});
$('settingsButton').onclick=()=>{const open=$('settings').hidden;$('settings').hidden=!open;$('settingsButton').setAttribute('aria-expanded',String(open));};
['mode','seconds','tolerance','threshold'].forEach(id=>$(id).onchange=()=>{reset();modeUI();});
$('retry').onclick=()=>{reset();say('feedback',active?'もういちど やってみよう':'カメラを はじめよう');};
$('clear').onclick=()=>{capture=null;for(const k of Object.keys(profiles))delete profiles[k];reset();profileStatus();registrationMessage('登録を消しました。使用する子の安静・口型を登録してください。');};
document.querySelectorAll('[data-capture]').forEach(b=>b.onclick=()=>{
 if(!active||!latest){registrationMessage('カメラに顔を正面から映してから登録してください。');return;}
 if(capture){registrationMessage('登録が終わるまで、そのまま待ってください。');return;}
 const key=b.dataset.capture;
 if(key!=='安静'&&!profiles['安静']){registrationMessage('先に安静の形を登録してください。');return;}
 reset();const now=performance.now();capture={key,start:now+600,lastValid:now,samples:[]};registrationMessage(`${key}の形を先生が確認してください。準備のあと約2秒記録します。`);
});
function sample(f,now){
 if(!capture)return;
 if(!f){
  if(now-capture.lastValid>500){capture=null;profileStatus();registrationMessage('顔を続けて確認できなかったため登録を中止しました。正面を向いて登録し直してください。');}
  return;
 }
 capture.lastValid=now;
 if(now<capture.start)return;
 capture.samples.push(f);
 if(now-capture.start<2000){say('calibrationStatus',`${capture.key} を登録中… ${Math.min(100,Math.round((now-capture.start)/20))}%`);return;}
 const {key,samples}=capture;capture=null;
 const result=registerProfile(key,samples,profiles);profileStatus();
 registrationMessage(result.error||result.warning||`${key}を登録しました。${ready()?'練習できます。':'続けて目標の口型を登録してください。'}`);
}
async function start(){
 if(active||starting)return;starting=true;$('start').disabled=true;say('message','認識モデルを読み込み中です。初回は少し時間がかかります。');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('カメラを利用できません。localhost または HTTPS で開いてください。');
  if(!model){const {FaceLandmarker,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');model=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},runningMode:'VIDEO',numFaces:2,outputFaceBlendshapes:true,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6});}
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  if(document.hidden){stream.getTracks().forEach(t=>t.stop());stream=null;throw Error('画面に戻ってから、カメラを開始してください。');}
  $('video').srcObject=stream;await $('video').play();active=true;latest=null;lastVideo=-1;lastInference=0;$('stop').disabled=false;$('placeholder').hidden=true;say('cameraStatus','カメラ 使用中');say('message','先生の設定で、安静と練習する口型を登録してください。');
  stream.getVideoTracks()[0].onended=()=>stop();raf=requestAnimationFrame(loop);
 }catch(e){stop();say('message',`開始できませんでした。カメラの許可とネット接続を確認してください。 ${e.message}`);}finally{starting=false;$('start').disabled=active;}
}
function stop(){active=false;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;latest=null;capture=null;reset();stopMic();$('overlay').getContext('2d').clearRect(0,0,$('overlay').width,$('overlay').height);$('placeholder').hidden=false;$('start').disabled=starting;$('stop').disabled=true;say('cameraStatus','カメラ おやすみ中');say('feedback','ひとやすみ。また はじめよう');say('message','カメラとマイクを停止しました。');profileStatus();}
function stopMic(){audioStream?.getTracks().forEach(t=>t.stop());audioStream=null;audioContext?.close().catch(()=>{});audioContext=null;analyser=null;audioData=null;level=0;lastAudio=0;$('soundMeter').value=0;say('mic','マイクを はじめる');}
let micStarting=false;
$('mic').onclick=async()=>{
 if(micStarting)return;if(audioStream){stopMic();reset();return;}
 if(!active){say('message','先にカメラを開始してください。');return;}
 micStarting=true;$('mic').disabled=true;
 try{const pending=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});if(!active||document.hidden){pending.getTracks().forEach(t=>t.stop());return;}audioStream=pending;audioContext=new(window.AudioContext||window.webkitAudioContext)();await audioContext.resume();analyser=audioContext.createAnalyser();analyser.fftSize=2048;audioContext.createMediaStreamSource(audioStream).connect(analyser);audioData=new Float32Array(analyser.fftSize);audioStream.getAudioTracks()[0].onended=()=>{stopMic();reset();};say('mic','マイクを とめる');say('message','周囲が静かな状態で、音の検出しきい値を調整してください。');reset();}catch(e){stopMic();say('message','マイクを開始できませんでした。ブラウザのマイク許可を確認してください。');}finally{micStarting=false;$('mic').disabled=false;}
};
function sound(now){
 if(analyser&&audioContext?.state==='running'&&audioStream?.getAudioTracks().some(t=>t.readyState==='live'&&!t.muted)){analyser.getFloatTimeDomainData(audioData);level=Math.sqrt(audioData.reduce((s,v)=>s+v*v,0)/audioData.length);lastAudio=now;}else{level=0;lastAudio=0;}$('soundMeter').value=level;
}
function process(result,now){
 const video=$('video'),canvas=$('overlay');if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 const faces=result.faceLandmarks;let f=null;
 if(faces.length===1){const pucker=result.faceBlendshapes?.[0]?.categories.find(c=>c.categoryName==='mouthPucker')?.score;f=Number.isFinite(pucker)?features(faces[0],canvas.width,canvas.height,pucker):null;if(f){const outline=[61,40,37,0,267,270,291,321,314,17,84,91,61];ctx.beginPath();outline.forEach((i,n)=>{const p=faces[0][i];ctx[n?'lineTo':'moveTo'](p.x*canvas.width,p.y*canvas.height);});ctx.strokeStyle='#f9d880';ctx.lineWidth=3;ctx.stroke();}}
 latest=f;const wasCapturing=!!capture;sample(f,now);sound(now);
 let detected=f?classify(f,profiles,Number($('tolerance').value)):'見えません';
 say('debug',f?`口幅 / 目の間隔：${f[0].toFixed(3)}\n開口 / 目の間隔：${f[1].toFixed(3)}\nすぼめる指標：${f[2].toFixed(3)}\n登録との比較：${detected}\n音量 RMS：${level.toFixed(4)}`:'顔が1人、正面で映るようにしてください。');
 if(!f&&teacherConfirmed){teacherConfirmed=false;teacherButton();}
 const shape=!!f&&ready()&&(target==='べー'?teacherConfirmed:detected===target);
 const needsSound=target!=='べー'&&$('mode').value==='sound';const hasSound=lastAudio>0&&now-lastAudio<200&&level>=Number($('threshold').value);
 const wasDone=timer.done;timer.update(now,shape&&(!needsSound||hasSound)&&!wasCapturing,Number($('seconds').value)*1000);
 if(!wasDone&&timer.done){teacherConfirmed=false;teacherButton();count++;say('count',`できた！ ${count} 回`);document.body.classList.add('success');}
 let text=timer.done?(target==='べー'?'できた！ せんせいと キープできたね':'できた！ よく がんばったね'):wasCapturing?'せんせいと かたちを とうろく中':!f?(faces.length>1?'ひとりで うつしてね':'かおを まっすぐ うつそう'):!ready()?'せんせいと かたちを とうろくしよう':target==='べー'&&!teacherConfirmed?'せんせいに したを みてもらおう':!shape?'おてほんの かたちに してみよう':needsSound&&!audioStream?'せんせいに マイクを つけてもらおう':needsSound&&!hasSound?'その かたちで こえを だそう':'いいね！ そのまま そのまま';
 say('feedback',text);paintProgress();
}
function loop(now){if(!active)return;try{if($('video').readyState>=2&&$('video').currentTime!==lastVideo&&now-lastInference>=65){lastVideo=$('video').currentTime;lastInference=now;process(model.detectForVideo($('video'),now),now);}else if(now-lastInference>300){latest=null;if(capture){capture=null;profileStatus();registrationMessage('映像が途切れたため登録を中止しました。カメラを確認して登録し直してください。');}reset();paintProgress();say('feedback','カメラの えいぞうを かくにんしよう');}}catch(e){stop();say('message','認識処理が停止しました。カメラを開始し直してください。');return;}raf=requestAnimationFrame(loop);}
$('start').onclick=start;$('stop').onclick=stop;document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop();});window.addEventListener('pagehide',stop);profileStatus();modeUI();
