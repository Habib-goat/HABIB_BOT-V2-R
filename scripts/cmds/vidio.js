const axios=require("axios");
const fs=require("fs");
const path=require("path");

let cachedApi=null;
async function baseApiUrl(){
 if(cachedApi) return cachedApi;
 try{
   const r=await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",{timeout:5000});
   if(r.data&&r.data.mahmud){cachedApi=r.data.mahmud;return cachedApi;}
 }catch(e){}
 return "https://mahmud-rest-api-v9.onrender.com";
}

module.exports={
 config:{
   name:"vidio",
   aliases:["video","vid","ভিডিও"],
   version:"3.0.0",
   author:"Riyad",
   countDown:5,
   role:0,
   category:"media",
   description:{en:"Download YouTube videos"},
   guide:{en:"{pn} <name/link>"}
 },

 onStart:async function({api,event,args}){
   try{
     if(!args.length)
       return api.sendMessage("📺 ভিডিওর নাম বা YouTube লিংক দিন।",event.threadID,event.messageID);

     if(typeof api.setMessageReaction==="function")
       api.setMessageReaction("⏳",event.messageID,()=>{},true);

     const apiUrl=await baseApiUrl();

     const yt=/^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})/;
     let videoID;

     if(yt.test(args[0])){
       videoID=args[0].match(yt)[1];
     }else{
       const search=await axios.get(`${apiUrl}/api/video/search?songName=${encodeURIComponent(args.join(" "))}`,{timeout:10000});
       console.log("[VIDIO] SEARCH:",JSON.stringify(search.data));
       if(!Array.isArray(search.data)||!search.data.length)
         return api.sendMessage("❌ কোনো ভিডিও পাওয়া যায়নি।",event.threadID,event.messageID);
       videoID=search.data[0].id;
     }

     const info=await axios.get(`${apiUrl}/api/video/download?link=${videoID}&format=mp4`,{timeout:15000});
     console.log("[VIDIO] DOWNLOAD:",JSON.stringify(info.data));

     if(!info.data||!info.data.downloadLink)
       return api.sendMessage("❌ API থেকে download link পাওয়া যায়নি। Railway log দেখুন।",event.threadID,event.messageID);

     const cache=path.join(__dirname,"cache");
     if(!fs.existsSync(cache)) fs.mkdirSync(cache,{recursive:true});
     const file=path.join(cache,`video_${Date.now()}.mp4`);

     const vid=await axios.get(info.data.downloadLink,{responseType:"arraybuffer",timeout:30000});
     fs.writeFileSync(file,vid.data);

     api.sendMessage({
       body:`🎬 ${info.data.title||"YouTube Video"}`,
       attachment:fs.createReadStream(file)
     },event.threadID,()=>{
       fs.unlink(file,()=>{});
     },event.messageID);

   }catch(err){
     console.error("[VIDIO ERROR]",err);
     api.sendMessage(`❌ ${err.message}`,event.threadID,event.messageID);
   }
 }
};
