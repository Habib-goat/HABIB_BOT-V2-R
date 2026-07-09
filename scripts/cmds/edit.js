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

async function progress(api, msgId, p, t) {
  console.log("Progress:", p);

  if (!api.editMessage || !msgId) {
    console.log("editMessage not found");
    return;
  }

  const bars = {
    10:"▓░░░░░░░░░",20:"▓▓░░░░░░░░",30:"▓▓▓░░░░░░░",40:"▓▓▓▓░░░░░░",
    50:"▓▓▓▓▓░░░░░",60:"▓▓▓▓▓▓░░░░",70:"▓▓▓▓▓▓▓░░░",80:"▓▓▓▓▓▓▓▓░░",
    90:"▓▓▓▓▓▓▓▓▓░",100:"▓▓▓▓▓▓▓▓▓▓"
  };

  const body = `🖌️ Editing Image...

${bars[p]} ${p}%
${t}`;

  try {
    await new Promise((resolve, reject) => {
      api.editMessage(msgId, body, (err) => err ? reject(err) : resolve());
    });
    console.log("Updated:", p);
  } catch (e1) {
    console.log("Method-1 Failed:", e1);
    try {
      await new Promise((resolve, reject) => {
        api.editMessage(body, msgId, (err) => err ? reject(err) : resolve());
      });
      console.log("Updated (Method-2):", p);
    } catch (e2) {
      console.log("Method-2 Failed:", e2);
    }
  }
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

const id=wait.messageID;
const timers=[
setTimeout(()=>progress(api,id,20,"📥 Uploading image..."),2000),
setTimeout(()=>progress(api,id,30,"🧠 Analyzing image..."),4000),
setTimeout(()=>progress(api,id,40,"🎨 Applying changes..."),6000),
setTimeout(()=>progress(api,id,50,"✨ Enhancing details..."),8000),
setTimeout(()=>progress(api,id,60,"🪄 Rendering..."),10000),
setTimeout(()=>progress(api,id,70,"✨ Enhancing details..."),12000),
setTimeout(()=>progress(api,id,80,"🔍 Final touches..."),14000),
setTimeout(()=>progress(api,id,90,"📦 Preparing result..."),16000)
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
 await progress(api,id,100,"✅ Uploading image...");
 await fs.writeFile(out,Buffer.from(resp.data));
 timers.forEach(clearTimeout);
 if(id) try{await api.unsendMessage(id);}catch{}
 api.sendMessage({body:`✅ Image edited successfully!\n📝 ${prompt}`,attachment:fs.createReadStream(out)},event.threadID,event.messageID);
}catch(e){
 timers.forEach(clearTimeout);
 if(id) try{await api.unsendMessage(id);}catch{}
 api.sendMessage("❌ Failed to edit image.\n"+(e.message||""),event.threadID,event.messageID);
}finally{
 if(await fs.pathExists(out)) await fs.remove(out);
}
}
};
