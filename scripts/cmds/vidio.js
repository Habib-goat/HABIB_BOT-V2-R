const axios=require("axios");
const fs=require("fs");
const path=require("path");

let cachedBaseApiUrl=null;
async function baseApiUrl(){
 if(cachedBaseApiUrl) return cachedBaseApiUrl;
 try{
  const base=await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",{timeout:5000});
  if(base.data?.mahmud){cachedBaseApiUrl=base.data.mahmud;return cachedBaseApiUrl;}
 }catch(e){}
 return "https://mahmud-rest-api-v9.onrender.com";
}

module.exports={
config:{
name:"vidio",
aliases:["ভিডিও","video","vid"],
version:"2.1.0",
author:"Riyad",
countDown:5,
role:0,
category:"media",
description:{en:"Download YouTube videos"},
guide:{en:"{pn} <name/link>"}
},
langs:{en:{noInput:"Please provide a video name.",noResult:"No result.",success:"🎬 %1",error:"Error: %1"}},
onStart:async function({api,event,args,message,getLang}){
if(!args.length) return message.reply(getLang?getLang("noInput"):"Please provide a video name.");
try{
if(typeof api.setMessageReaction==="function") api.setMessageReaction("🐤",event.messageID,()=>{},true);
const apiUrl=await baseApiUrl();
const yt=/^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})/;
let videoID;
if(yt.test(args[0])) videoID=args[0].match(yt)[1];
else{
const s=await axios.get(`${apiUrl}/api/video/search?songName=${encodeURIComponent(args.join(" "))}`,{timeout:10000});
if(!Array.isArray(s.data)||!s.data.length) return message.reply(getLang?getLang("noResult"):"No result.");
videoID=s.data[0].id;
}
const cache=path.join(__dirname,"cache");
if(!fs.existsSync(cache)) fs.mkdirSync(cache,{recursive:true});
const file=path.join(cache,`video_${Date.now()}.mp4`);
const info=await axios.get(`${apiUrl}/api/video/download?link=${videoID}&format=mp4`,{timeout:15000});
const vid=await axios.get(info.data.downloadLink,{responseType:"arraybuffer",timeout:30000});
fs.writeFileSync(file,vid.data);
await message.reply({body:getLang?getLang("success",info.data.title):info.data.title,attachment:fs.createReadStream(file)});
fs.unlink(file,()=>{});
}catch(err){
console.error(err);
api.sendMessage(getLang?getLang("error",err.message):err.message,event.threadID);
}
}
};
