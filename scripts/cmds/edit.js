const axios=require("axios");
const fs=require("fs-extra");
const path=require("path");
const http=require("http");
const https=require("https");

const apiUrl="https://raw.githubusercontent.com/Saim-x69x/sakura/main/ApiUrl.json";
let API_CACHE=null;

const client=axios.create({
  timeout:180000,
  httpAgent:new http.Agent({keepAlive:true}),
  httpsAgent:new https.Agent({keepAlive:true})
});

async function getApiUrl(){
  if(API_CACHE) return API_CACHE;
  const r=await client.get(apiUrl);
  API_CACHE=r.data.apiv3;
  return API_CACHE;
}

async function urlToBase64(url){
  const r=await client.get(url,{responseType:"arraybuffer"});
  return Buffer.from(r.data).toString("base64");
}

async function progress(api, state, p, t, threadID) {
  const bars={
    10:"▓░░░░░░░░░",20:"▓▓░░░░░░░░",30:"▓▓▓░░░░░░░",40:"▓▓▓▓░░░░░░",
    50:"▓▓▓▓▓░░░░░",60:"▓▓▓▓▓▓░░░░",70:"▓▓▓▓▓▓▓░░░",80:"▓▓▓▓▓▓▓▓░░",
    90:"▓▓▓▓▓▓▓▓▓░",100:"▓▓▓▓▓▓▓▓▓▓"
  };
  const body=`🖌️ Editing Image...

${bars[p]} ${p}%
${t}`;
  try{
    if(state.messageID){
      try{ await api.unsendMessage(state.messageID);}catch{}
    }
    const info=await new Promise(r=>api.sendMessage(body,threadID,(e,i)=>r(i||{})));
    state.messageID=info.messageID;
  }catch{}
}

module.exports={
config:{
name:"edit",
version:"2.0",
author:"Saimx69x + ChatGPT",
countDown:5,
role:0,
shortDescription:"Edit image",
longDescription:"Reply to an image",
category:"ai",
guide:"{p}edit <prompt>"
},

onStart:async function({api,event,args}){
const img=event.messageReply?.attachments?.[0];
const prompt=args.join(" ").trim();

if(!img||img.type!=="photo")
 return api.sendMessage("❌ Reply to an image first.",event.threadID,event.messageID);

if(!prompt)
 return api.sendMessage("❌ Please provide a prompt.",event.threadID,event.messageID);

const wait=await new Promise(res=>{
 api.sendMessage("🖌️ Editing Image...\n\n▓░░░░░░░░░ 10%\n⏳ Initializing AI...",event.threadID,(e,i)=>res(i||{}),event.messageID);
});

const state={messageID:wait.messageID};
const timers=[
setTimeout(()=>progress(api,state,20,"📥 Uploading image...",event.threadID),2000),
setTimeout(()=>progress(api,state,30,"🧠 Analyzing image...",event.threadID),4000),
setTimeout(()=>progress(api,state,40,"🎨 Applying changes...",event.threadID),6000),
setTimeout(()=>progress(api,state,50,"✨ Enhancing details...",event.threadID),8000),
setTimeout(()=>progress(api,state,60,"🪄 Rendering...",event.threadID),10000),
setTimeout(()=>progress(api,state,70,"✨ Enhancing details...",event.threadID),12000),
setTimeout(()=>progress(api,state,80,"🔍 Final touches...",event.threadID),14000),
setTimeout(()=>progress(api,state,90,"📦 Preparing result...",event.threadID),16000)
];

const cache=path.join(__dirname,"cache");
await fs.ensureDir(cache);
const out=path.join(cache,Date.now()+"_edit.jpg");

try{
 const payload={
   prompt:`Edit the given image based on this description:\n${prompt}`,
   images:[await urlToBase64(img.url)],
   format:"jpg"
 };
 const resp=await client.post(await getApiUrl(),payload,{responseType:"arraybuffer"});
 await progress(api,state,100,"✅ Uploading image...",event.threadID);
 await fs.writeFile(out,Buffer.from(resp.data));
 timers.forEach(clearTimeout);
 if(state.messageID) try{await api.unsendMessage(state.messageID);}catch{}
 api.sendMessage({body:`✅ Image edited successfully!\n📝 ${prompt}`,attachment:fs.createReadStream(out)},event.threadID,event.messageID);
}catch(e){
 timers.forEach(clearTimeout);
 if(state.messageID) try{await api.unsendMessage(state.messageID);}catch{}
 api.sendMessage("❌ Failed to edit image.\n"+(e.message||""),event.threadID,event.messageID);
}finally{
 if(await fs.pathExists(out)) await fs.remove(out);
}
}
};
