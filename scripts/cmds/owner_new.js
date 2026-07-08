const config=require("../../config.json");
const fs=require("fs-extra");
const axios=require("axios");
const path=require("path");

module.exports={
config:{name:"owner",aliases:["admin","developer","creator","info"],version:"1.0.0",author:"Riyad Bot",countDown:3,role:0,category:"info",guide:{en:"{pn}"},description:{en:"View developer and project contact links."}},
onStart:async function({api,event}){
const cacheDir=path.join(__dirname,"cache");
const imgPath=path.join(cacheDir,"owner.jpg");
if(!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
const imgLink="https://i.imgur.com/QoryGQW.jpeg";
const ownerInfo=`👑 OWNER INFO

👤 Name: Bad Boy Riyad
🧸 Nick: Riyad
🌐 GitHub: https://github.com/namebdmy/Riyad_Pro/
📧 Email: hasanriyad761@gmail.com
💬 Messenger ID: ${config.ownerIDs[0]}`;

try{
 const res=await axios({url:imgLink,method:"GET",responseType:"stream"});
 const w=fs.createWriteStream(imgPath);
 res.data.pipe(w);
 w.on("finish",()=>api.sendMessage({body:ownerInfo,attachment:fs.createReadStream(imgPath)},event.threadID,()=>{if(fs.existsSync(imgPath))fs.unlinkSync(imgPath);},event.messageID));
 w.on("error",async()=>await api.sendMessage(ownerInfo,event.threadID,event.messageID));
}catch(e){
 await api.sendMessage(ownerInfo,event.threadID,event.messageID);
}
}
};