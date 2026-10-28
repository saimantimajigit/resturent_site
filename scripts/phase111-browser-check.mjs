import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const cdp='http://127.0.0.1:9222';
const version=await fetch(`${cdp}/json/version`).then(response=>response.json());
const ws=new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
let id=0;const pending=new Map();let sessionId;
ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result)}});
function call(method,params={}){const current=++id;return new Promise((resolve,reject)=>{pending.set(current,{resolve,reject});ws.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}))})}
const target=await call('Target.createTarget',{url:'about:blank'});const attached=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});sessionId=attached.sessionId;
await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function navigate(url){await call('Page.navigate',{url});await wait(2500)}
async function screenshot(name){const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const path=join(tmpdir(),name);await writeFile(path,Buffer.from(result.data,'base64'));return path}
function pass(label){console.log(`PASS ${label}`)}

await navigate('http://localhost:3001/order-online');
await evaluate(`(()=>{localStorage.removeItem('savore-cart-v1');localStorage.removeItem('savore-checkout-key')})()`);
await call('Page.reload');await wait(1200);
const desktop=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,images:[...document.images].map(i=>({src:i.currentSrc,ok:i.complete&&i.naturalWidth>0}))})`);
if(desktop.scrollWidth>desktop.width)throw new Error(`Desktop horizontal overflow: ${desktop.scrollWidth}/${desktop.width}`);
if(!desktop.title?.toLowerCase().includes('order online'))throw new Error('Order online heading missing');
if(!desktop.images.length||desktop.images.some(image=>!image.ok))throw new Error('Broken or missing dish image in order menu');
console.log(`INFO desktop image checks ${JSON.stringify(desktop.images)}`);
const desktopShot=await screenshot('savore-phase111-desktop.png');pass(`desktop order menu loads without horizontal overflow (${desktop.width}px)`);
await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.innerText.toLowerCase().includes('add to order')&&!x.disabled);if(!button)throw new Error('No available Add to order button');button.click()})()`);
await wait(800);if(await evaluate('location.pathname')!=='/cart')throw new Error('Add to order did not navigate to cart');
const cart=(await evaluate(`document.body.innerText`)).toLowerCase();if(!cart.includes('your cart')||!cart.includes('demo checkout')||!cart.includes('estimated total'))throw new Error('Cart/checkout content or live estimate missing');pass('Add to order navigates to cart with live estimated pricing and demo checkout');
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('http://localhost:3001/order-online');
const mobile=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,nav:!!document.querySelector('.mobile-nav')})`);
if(mobile.scrollWidth>mobile.width)throw new Error(`Mobile horizontal overflow: ${mobile.scrollWidth}/${mobile.width}`);
if(!mobile.nav)throw new Error('Mobile navigation missing');
await evaluate(`document.querySelector('.mobile-nav summary')?.click()`);if(!(await evaluate(`document.querySelector('.mobile-nav nav')?.getBoundingClientRect().height>0`)))throw new Error('Mobile navigation did not open');
const mobileShot=await screenshot('savore-phase111-mobile.png');pass(`mobile menu and navigation work without horizontal overflow (${mobile.width}px)`);
console.log(`SCREENSHOTS ${desktopShot} ${mobileShot}`);
await call('Target.closeTarget',{targetId:target.targetId});ws.close();
