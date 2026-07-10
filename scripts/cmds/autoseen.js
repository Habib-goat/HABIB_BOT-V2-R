module.exports = {
  config:{name:"autoseen",aliases:["seen"],version:"1.1.0",author:"Riyad Bot",countDown:0,role:0,category:"system",guide:{en:"{pn} [on/off]"},description:{en:"Toggle auto seen for this thread."}},
  onChat: async function({ api, event, threadsData }) {
  try {
    console.log("[AUTOSEEN] START");

    const thread = threadsData.getThread(event.threadID);

    if (thread.settings?.autoseen === false) return;

    console.log("[AUTOSEEN] markAsRead =", typeof api.markAsRead);
    console.log("[AUTOSEEN] markAsSeen =", typeof api.markAsSeen);

    if (typeof api.markAsRead === "function") {
      await api.markAsRead(event.threadID);
      console.log("[AUTOSEEN] markAsRead OK");
    } else if (typeof api.markAsSeen === "function") {
      await api.markAsSeen();
      console.log("[AUTOSEEN] markAsSeen OK");
    }

  } catch (e) {
    console.log("[AUTOSEEN ERROR]", e);
  }
},
  onStart: async function({api,event,args,threadsData}){
    const thread=threadsData.getThread(event.threadID);
    if(!thread.settings) thread.settings={};
    if(!args[0]){
      return api.sendMessage("👁️ Auto Seen: "+(thread.settings.autoseen!==false?"ON ✅":"OFF ❌")+"\n\n/autoseen on\n/autoseen off",event.threadID,event.messageID);
    }
    const opt=args[0].toLowerCase();
    if(opt==="on"){
      thread.settings.autoseen=true;
      threadsData.updateThread(event.threadID,{settings:thread.settings});
      return api.sendMessage("✅ Auto Seen enabled.",event.threadID,event.messageID);
    }
    if(opt==="off"){
      thread.settings.autoseen=false;
      threadsData.updateThread(event.threadID,{settings:thread.settings});
      return api.sendMessage("❌ Auto Seen disabled.",event.threadID,event.messageID);
    }
    return api.sendMessage("⚠️ Use: /autoseen on or /autoseen off",event.threadID,event.messageID);
  }
};
