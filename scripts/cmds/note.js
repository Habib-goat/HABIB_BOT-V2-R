/**
 * @license
 * Premium Notepad System for Riyad Bot
 * Custom Command: /note
 * Supports: Bangla & English perfectly, Thread-isolation, Reply-system, Pagination, Sorting, Favorites, Pinning, Export & Import, and Duplicate Protection.
 * File: scripts/cmds/note.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// Helper to format date in DD-MM-YYYY hh:mm A
function formatDateTime(date) {
  const pad = (num) => String(num).padStart(2, '0');
  const d = new Date(date);
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strTime = `${pad(hours)}:${minutes} ${ampm}`;
  return `${day}-${month}-${year} ${strTime}`;
}

// Convert numbers or letters to elegant bold sans-serif Unicode (Premium styling)
function toBoldSans(text) {
  if (!text) return "";
  const str = String(text);
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) { // A-Z
      result += String.fromCodePoint(0x1D5E4 + (code - 65));
    } else if (code >= 97 && code <= 122) { // a-z
      result += String.fromCodePoint(0x1D5FE + (code - 97));
    } else if (code >= 48 && code <= 57) { // 0-9
      result += String.fromCodePoint(0x1D7EC + (code - 48));
    } else {
      result += char;
    }
  }
  return result;
}

// Unicode circled numbers for visual list rendering
function getCircleNumber(num) {
  const circles = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  if (num >= 0 && num <= 10) return circles[num];
  return `[${num}]`;
}

// Thread-isolated Database Helpers using threadsData
async function getNotes(threadID, threadsData) {
  try {
    const threadInfo = await threadsData.getThread(threadID) || {};
    if (threadInfo.data && Array.isArray(threadInfo.data.notes)) {
      return threadInfo.data.notes;
    }
    if (Array.isArray(threadInfo.notes)) {
      return threadInfo.notes;
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function saveNotes(threadID, notes, threadsData) {
  try {
    const threadInfo = await threadsData.getThread(threadID) || {};
    if (threadInfo.data) {
      threadInfo.data.notes = notes;
      await threadsData.updateThread(threadID, { data: threadInfo.data });
    } else {
      threadInfo.notes = notes;
      await threadsData.updateThread(threadID, threadInfo);
    }
    return true;
  } catch (e) {
    console.error("Error saving notes in thread " + threadID + ":", e);
    return false;
  }
}

const HEADER = `━━━━━━━━━━━━━━━━━━\n📝 𝗥𝗶𝘆𝗮𝗱'𝘀 𝗡𝗼𝘁𝗲\n━━━━━━━━━━━━━━━━━━`;

module.exports = {
  config: {
    name: "note",
    aliases: ["notes", "notepad", "ns", "na", "nl", "nv", "nd", "nc"],
    version: "1.2.0",
    hasPermission: 0,
    credits: "Riyad Bot Team",
    description: "Premium Group Notepad System with fast interactions",
    commandCategory: "utility",
    usages: "[save/list/view/delete/clear/search/info/edit/pin/unpin/favorite/unfavorite/export/import/sort]",
    cooldowns: 2
  },

  onStart: async function({ api, event, args, usersData, threadsData }) {
    const { threadID, senderID, messageID } = event;
    
    // Normalize shortcut triggers from event body
    const bodyText = (event.body || "").trim();
    const firstWord = bodyText.replace(/^[!\/]/, "").trim().split(/\s+/)[0].toLowerCase();

    let subCommand = "";
    let subArgs = [];

    if (["note", "notes", "notepad"].includes(firstWord)) {
      subCommand = args[0] ? args[0].toLowerCase() : "";
      subArgs = args.slice(1);
    } else if (firstWord === "ns" || firstWord === "na") {
      subCommand = "save";
      subArgs = args;
    } else if (firstWord === "nl") {
      subCommand = "list";
      subArgs = args;
    } else if (firstWord === "nv") {
      subCommand = "view";
      subArgs = args;
    } else if (firstWord === "nd") {
      subCommand = "delete";
      subArgs = args;
    } else if (firstWord === "nc") {
      subCommand = "clear";
      subArgs = args;
    } else {
      // Fallback
      subCommand = args[0] ? args[0].toLowerCase() : "";
      subArgs = args.slice(1);
    }

    // 1. SAVE / ADD NOTE (with Duplicate and Empty protection)
    if (subCommand === "save" || subCommand === "add") {
      const noteContent = subArgs.join(" ").trim();
      if (!noteContent) {
        return api.sendMessage(
          `${HEADER}\n⚠️ Please provide some text to save.\n\nExample:\n/note save আজ রাত ১০টায় মিটিং\n━━━━━━━━━━━━━━━━━━`, 
          threadID, 
          messageID
        );
      }

      const notes = await getNotes(threadID, threadsData);

      // Duplicate Check
      const isDuplicate = notes.some(n => n.content.trim() === noteContent);
      if (isDuplicate) {
        return api.sendMessage(
          `${HEADER}\n⚠️ Duplicate Note found! This exact note is already saved in your notepad.\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      }

      let creatorName = "User";
      try {
        if (usersData && typeof usersData.getName === "function") {
          creatorName = await usersData.getName(senderID) || "User";
        } else if (event.senderName) {
          creatorName = event.senderName;
        }
      } catch (e) {
        creatorName = "User";
      }

      const newNote = {
        id: notes.length + 1,
        content: noteContent,
        creator: creatorName,
        creatorID: senderID,
        time: Date.now(),
        pinned: false,
        favorite: false
      };

      notes.push(newNote);
      const success = await saveNotes(threadID, notes, threadsData);

      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Note saved successfully!\n\n📌 ID: ${getCircleNumber(newNote.id)}\n👤 Creator: ${toBoldSans(creatorName)}\n📅 Time: ${formatDateTime(newNote.time)}\n━━━━━━━━━━━━━━━━━━`, 
          threadID, 
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to save note to database.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 2. LIST ALL NOTES (with Pagination & Pinned notes on top)
    if (subCommand === "list" || !subCommand) {
      const notes = await getNotes(threadID, threadsData);
      if (notes.length === 0) {
        return api.sendMessage(
          `${HEADER}\n📂 No notes saved in this group.\nType "/note save <text>" to save your first note!\n━━━━━━━━━━━━━━━━━━`, 
          threadID, 
          messageID
        );
      }

      // Pagination Setup
      const PAGE_SIZE = 5;
      let targetPage = 1;
      if (subArgs[0]) {
        const parsedPage = parseInt(subArgs[0], 10);
        if (!isNaN(parsedPage) && parsedPage > 0) {
          targetPage = parsedPage;
        }
      }

      // Sort display copy: Pinned notes always at top of the list
      // We map notes with their original index to keep view & reply referencing accurate
      const mappedNotes = notes.map((note, index) => ({
        ...note,
        originalIndex: index + 1
      }));

      mappedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0; // maintain relative order or secondary sorting
      });

      const totalPages = Math.ceil(mappedNotes.length / PAGE_SIZE);
      if (targetPage > totalPages) {
        targetPage = totalPages;
      }

      const startIdx = (targetPage - 1) * PAGE_SIZE;
      const endIdx = startIdx + PAGE_SIZE;
      const pageNotes = mappedNotes.slice(startIdx, endIdx);

      let listMsg = `${HEADER}\n📂 Active Notes: ${toBoldSans(notes.length)} (Page ${toBoldSans(targetPage)}/${toBoldSans(totalPages)})\n\n`;
      
      pageNotes.forEach((note) => {
        const badge = note.pinned ? " 📌" : (note.favorite ? " ❤️" : "");
        const preview = note.content.length > 35 ? note.content.substring(0, 35) + "..." : note.content;
        listMsg += `${getCircleNumber(note.originalIndex)}${badge} ${preview}\n   👤 By: ${toBoldSans(note.creator)} | 📅 ${formatDateTime(note.time).split(" ")[0]}\n`;
      });

      listMsg += `\n━━━━━━━━━━━━━━━━━━\n💡 Reply to this list with a note number (e.g. 1) to view it.`;
      if (totalPages > 1) {
        listMsg += `\n📖 Type "/note list ${targetPage < totalPages ? targetPage + 1 : 1}" for more notes.`;
      }

      // Save reply tracking inside global state with message callbacks
      api.sendMessage(listMsg, threadID, (err, info) => {
        if (!err && info && info.messageID) {
          if (!global.noteReplies) global.noteReplies = {};
          global.noteReplies[info.messageID] = {
            threadID: threadID,
            type: "list",
            notesCount: notes.length,
            page: targetPage,
            time: Date.now()
          };
        }
      }, messageID);
      return;
    }

    // 3. VIEW SINGLE NOTE (Copy Friendly)
    if (subCommand === "view") {
      const noteNum = parseInt(subArgs[0], 10);
      if (isNaN(noteNum)) {
        return api.sendMessage(`${HEADER}\n⚠️ Please provide a valid note number.\nExample: /note view 1\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const notes = await getNotes(threadID, threadsData);
      if (noteNum < 1 || noteNum > notes.length) {
        return api.sendMessage(`${HEADER}\n❌ Note #${noteNum} not found.\nTotal notes available: ${notes.length}\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const note = notes[noteNum - 1];
      const badge = note.pinned ? " 📌 [Pinned]" : (note.favorite ? " ❤️ [Favorite]" : "");
      const metaMsg = `━━━━━━━━━━━━━━━━━━\n📝 👑 𝗥𝗶𝘆𝗮𝗱'𝘀 𝗡𝗼𝘁𝗲 #${toBoldSans(noteNum)}${badge}\n━━━━━━━━━━━━━━━━━━\n👤 Creator: ${toBoldSans(note.creator)}\n📅 Time: ${formatDateTime(note.time)}\n━━━━━━━━━━━━━━━━━━\n\n`;
      
      return api.sendMessage(`${metaMsg}${note.content}`, threadID, messageID);
    }

    // 4. DELETE / REMOVE NOTE
    if (subCommand === "delete" || subCommand === "remove") {
      const noteNum = parseInt(subArgs[0], 10);
      if (isNaN(noteNum)) {
        return api.sendMessage(`${HEADER}\n⚠️ Please provide a valid note number to delete.\nExample: /note delete 1\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      let notes = await getNotes(threadID, threadsData);
      if (noteNum < 1 || noteNum > notes.length) {
        return api.sendMessage(`${HEADER}\n❌ Note #${noteNum} not found in this thread.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const removedNote = notes.splice(noteNum - 1, 1)[0];
      
      // Re-index remaining notes so they are always contiguous (1, 2, 3...)
      notes = notes.map((n, i) => ({
        ...n,
        id: i + 1
      }));

      const success = await saveNotes(threadID, notes, threadsData);
      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Note deleted successfully!\n\n🗑️ Removed Content preview:\n"${removedNote.content.substring(0, 30)}${removedNote.content.length > 30 ? "..." : ""}"\n━━━━━━━━━━━━━━━━━━`, 
          threadID, 
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to update database.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 5. SEARCH NOTES (Bangla + English support)
    if (subCommand === "search") {
      const query = subArgs.join(" ").trim().toLowerCase();
      if (!query) {
        return api.sendMessage(`${HEADER}\n⚠️ Please enter a search query.\nExample: /note search মিটিং\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const notes = await getNotes(threadID, threadsData);
      const matches = notes.filter(n => n.content.toLowerCase().includes(query));

      if (matches.length === 0) {
        return api.sendMessage(`${HEADER}\n🔍 Search query: "${query}"\n❌ No matching notes found.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      let searchMsg = `${HEADER}\n🔍 Matches found: ${toBoldSans(matches.length)} for "${query}"\n\n`;
      matches.forEach((note) => {
        const badge = note.pinned ? " 📌" : (note.favorite ? " ❤️" : "");
        const preview = note.content.length > 40 ? note.content.substring(0, 40) + "..." : note.content;
        searchMsg += `${getCircleNumber(note.id)}${badge} ${preview}\n   👤 By: ${toBoldSans(note.creator)} | 📅 ${formatDateTime(note.time).split(" ")[0]}\n`;
      });
      searchMsg += `━━━━━━━━━━━━━━━━━━`;

      return api.sendMessage(searchMsg, threadID, messageID);
    }

    // 6. EDIT NOTE
    if (subCommand === "edit") {
      const editNum = parseInt(subArgs[0], 10);
      const newText = subArgs.slice(1).join(" ").trim();

      if (isNaN(editNum)) {
        return api.sendMessage(`${HEADER}\n⚠️ Usage: /note edit <number> <new text>\nExample: /note edit 2 Updated info\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
      if (!newText) {
        return api.sendMessage(`${HEADER}\n⚠️ Please provide the new text to edit this note.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const notes = await getNotes(threadID, threadsData);
      if (editNum < 1 || editNum > notes.length) {
        return api.sendMessage(`${HEADER}\n❌ Note #${editNum} not found.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const oldContent = notes[editNum - 1].content;
      notes[editNum - 1].content = newText;
      notes[editNum - 1].time = Date.now(); // update modification time

      const success = await saveNotes(threadID, notes, threadsData);
      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Note #${editNum} edited successfully!\n\n📝 Old Content: "${oldContent.substring(0, 20)}${oldContent.length > 20 ? "..." : ""}"\n✨ New Content: "${newText.substring(0, 20)}${newText.length > 20 ? "..." : ""}"\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to save changes.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 7. PIN / UNPIN NOTE
    if (subCommand === "pin" || subCommand === "unpin") {
      const noteNum = parseInt(subArgs[0], 10);
      if (isNaN(noteNum)) {
        return api.sendMessage(`${HEADER}\n⚠️ Please provide a note number.\nExample: /note pin 2\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const notes = await getNotes(threadID, threadsData);
      if (noteNum < 1 || noteNum > notes.length) {
        return api.sendMessage(`${HEADER}\n❌ Note #${noteNum} not found.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const isPinning = subCommand === "pin";
      notes[noteNum - 1].pinned = isPinning;

      const success = await saveNotes(threadID, notes, threadsData);
      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Note #${noteNum} ${isPinning ? "pinned 📌 to top" : "unpinned 📤"} successfully!\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to update note pin state.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 8. FAVORITE / UNFAVORITE NOTE
    if (subCommand === "favorite" || subCommand === "unfavorite" || subCommand === "fav" || subCommand === "unfav") {
      const noteNum = parseInt(subArgs[0], 10);
      if (isNaN(noteNum)) {
        return api.sendMessage(`${HEADER}\n⚠️ Please provide a note number.\nExample: /note favorite 3\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const notes = await getNotes(threadID, threadsData);
      if (noteNum < 1 || noteNum > notes.length) {
        return api.sendMessage(`${HEADER}\n❌ Note #${noteNum} not found.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const isFavorite = subCommand === "favorite" || subCommand === "fav";
      notes[noteNum - 1].favorite = isFavorite;

      const success = await saveNotes(threadID, notes, threadsData);
      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Note #${noteNum} ${isFavorite ? "added to favorites ❤️" : "removed from favorites 💔"} successfully!\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to update note favorite state.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 9. EXPORT NOTES (Copyable raw .txt file attachment)
    if (subCommand === "export") {
      const notes = await getNotes(threadID, threadsData);
      if (notes.length === 0) {
        return api.sendMessage(`${HEADER}\n⚠️ No notes to export.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      const exportPath = path.join(__dirname, `notes_${threadID}.txt`);
      let fileContent = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📝 RIYAD'S PREMIUM NOTEPAD EXPORT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      fileContent += `Thread ID: ${threadID}\nExport Time: ${formatDateTime(Date.now())}\nTotal Notes: ${notes.length}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      notes.forEach((note, index) => {
        fileContent += `[Note #${index + 1}]\n`;
        fileContent += `ID: ${note.id}\n`;
        fileContent += `Creator: ${note.creator} (${note.creatorID})\n`;
        fileContent += `Date: ${formatDateTime(note.time)}\n`;
        if (note.pinned) fileContent += `Pinned: Yes 📌\n`;
        if (note.favorite) fileContent += `Favorite: Yes ❤️\n`;
        fileContent += `Content:\n${note.content}\n`;
        fileContent += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      });

      try {
        fs.writeFileSync(exportPath, fileContent, "utf8");
        api.sendMessage({
          body: `${HEADER}\n📤 Here is your notepad export file.\n━━━━━━━━━━━━━━━━━━`,
          attachment: fs.createReadStream(exportPath)
        }, threadID, (err) => {
          if (fs.existsSync(exportPath)) {
            try { fs.unlinkSync(exportPath); } catch (e) {}
          }
        }, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\n❌ Error exporting notes: ${err.message}\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
      return;
    }

    // 10. IMPORT NOTES (By replying to a TXT file)
    if (subCommand === "import") {
      const messageReply = event.messageReply;
      if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
        return api.sendMessage(
          `${HEADER}\n⚠️ Please reply to a valid exported notes TXT file with "/note import" to restore.\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      }

      const attachment = messageReply.attachments[0];
      if (attachment.type !== "file") {
        return api.sendMessage(`${HEADER}\n❌ Replied message is not a valid text file.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      return https.get(attachment.url, (res) => {
        let rawData = "";
        res.on("data", (chunk) => { rawData += chunk; });
        res.on("end", async () => {
          let importedNotes = [];
          
          if (rawData.includes("RIYAD'S PREMIUM NOTEPAD EXPORT")) {
            // Parse premium export format
            const blocks = rawData.split(/\[Note #\d+\]/g).slice(1);
            for (const block of blocks) {
              const contentMatch = block.match(/Content:\s*([\s\S]*?)(?=\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━|$)/);
              const creatorMatch = block.match(/Creator:\s*(.*?)(?=\s*\()/);
              
              const content = contentMatch ? contentMatch[1].trim() : "";
              const creator = creatorMatch ? creatorMatch[1].trim() : "Imported User";
              
              if (content) {
                importedNotes.push({
                  id: 0,
                  content: content,
                  creator: creator,
                  creatorID: senderID,
                  time: Date.now(),
                  pinned: block.includes("Pinned: Yes"),
                  favorite: block.includes("Favorite: Yes")
                });
              }
            }
          } else {
            // Simple plain text lines format (each line becomes one note)
            const lines = rawData.split(/\r?\n/);
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith("━━━━━━━━━━━━━━━━━━") && !trimmed.startsWith("📝")) {
                importedNotes.push({
                  id: 0,
                  content: trimmed,
                  creator: "Imported User",
                  creatorID: senderID,
                  time: Date.now(),
                  pinned: false,
                  favorite: false
                });
              }
            }
          }

          if (importedNotes.length === 0) {
            return api.sendMessage(`${HEADER}\n⚠️ No valid notes found in the file.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
          }

          const existingNotes = await getNotes(threadID, threadsData);
          let addedCount = 0;

          for (const imp of importedNotes) {
            // Duplicate Protection
            const isDuplicate = existingNotes.some(n => n.content.trim() === imp.content.trim());
            if (!isDuplicate) {
              imp.id = existingNotes.length + 1;
              existingNotes.push(imp);
              addedCount++;
            }
          }

          if (addedCount > 0) {
            const success = await saveNotes(threadID, existingNotes, threadsData);
            if (success) {
              return api.sendMessage(
                `${HEADER}\n✅ Imported ${toBoldSans(addedCount)} new notes successfully!\n━━━━━━━━━━━━━━━━━━`,
                threadID,
                messageID
              );
            } else {
              return api.sendMessage(`${HEADER}\n❌ Database save error.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
            }
          } else {
            return api.sendMessage(
              `${HEADER}\n⚠️ No new notes added. All notes in the file already exist in your notepad.\n━━━━━━━━━━━━━━━━━━`,
              threadID,
              messageID
            );
          }
        });
      }).on("error", (err) => {
        return api.sendMessage(`${HEADER}\n❌ Failed to download file: ${err.message}\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      });
    }

    // 11. SORT NOTES
    if (subCommand === "sort") {
      const sortType = subArgs[0] ? subArgs[0].toLowerCase() : "";
      let notes = await getNotes(threadID, threadsData);
      
      if (notes.length === 0) {
        return api.sendMessage(`${HEADER}\n⚠️ No notes available to sort.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      if (sortType === "newest") {
        notes.sort((a, b) => b.time - a.time);
      } else if (sortType === "oldest") {
        notes.sort((a, b) => a.time - b.time);
      } else if (sortType === "az") {
        notes.sort((a, b) => a.content.localeCompare(b.content, "bn-BD", { sensitivity: "base" }));
      } else {
        return api.sendMessage(
          `${HEADER}\n⚠️ Please provide a valid sorting type:\n• /note sort newest\n• /note sort oldest\n• /note sort az\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      }

      // Re-index remaining notes contiguous
      notes = notes.map((n, i) => ({
        ...n,
        id: i + 1
      }));

      const success = await saveNotes(threadID, notes, threadsData);
      if (success) {
        return api.sendMessage(
          `${HEADER}\n✅ Sorted notes by [${toBoldSans(sortType)}] successfully!\n━━━━━━━━━━━━━━━━━━`,
          threadID,
          messageID
        );
      } else {
        return api.sendMessage(`${HEADER}\n❌ Failed to save sorted notes.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }
    }

    // 12. CLEAR ALL NOTES (Admin check and confirmation reply)
    if (subCommand === "clear") {
      let isGroupAdmin = false;
      try {
        const threadInfo = await api.getThreadInfo(threadID);
        const adminIDs = threadInfo.adminIDs || [];
        isGroupAdmin = adminIDs.some(admin => admin.id === senderID);
      } catch (e) {
        isGroupAdmin = false;
      }

      // Highly compatible admin list checks
      const isBotAdmin = (global.config?.ownerIDs && global.config.ownerIDs.includes(senderID)) || 
                         (global.config?.adminIDs && global.config.adminIDs.includes(senderID)) ||
                         (global.config?.ADMINBOT && global.config.ADMINBOT.includes(senderID)) ||
                         process.env.BOT_ADMIN_ID === senderID;

      if (!isGroupAdmin && !isBotAdmin) {
        return api.sendMessage(`${HEADER}\n❌ Only Group Admins or Bot Admins can clear all notes.\n━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

      // Send premium prompt
      const confirmMsg = `${HEADER}\n⚠️ Confirm Clear All Notes\n\nThis will permanently delete ALL notes in this group chat.\n\n👉 Reply "yes" or "confirm" to wipe everything.\n👉 Reply anything else to cancel.\n━━━━━━━━━━━━━━━━━━`;
      
      api.sendMessage(confirmMsg, threadID, (err, info) => {
        if (!err && info && info.messageID) {
          if (!global.noteReplies) global.noteReplies = {};
          global.noteReplies[info.messageID] = {
            threadID: threadID,
            type: "clear",
            adminID: senderID,
            time: Date.now()
          };
        }
      }, messageID);
      return;
    }

    // 13. STATISTICS
    if (subCommand === "info") {
      const notes = await getNotes(threadID, threadsData);
      if (notes.length === 0) {
        return api.sendMessage(
          `${HEADER}\n📊 Notepad Statistics:\n\n📝 Total Notes: 𝟬\n💾 Storage Used: ~𝟬 Bytes\n━━━━━━━━━━━━━━━━━━`, 
          threadID, 
          messageID
        );
      }

      const firstNoteDate = formatDateTime(notes[0].time).split(" ")[0];
      const latestNoteDate = formatDateTime(notes[notes.length - 1].time).split(" ")[0];
      const pinnedCount = notes.filter(n => n.pinned).length;
      const favCount = notes.filter(n => n.favorite).length;
      const approxBytes = JSON.stringify(notes).length;
      const formattedStorage = approxBytes > 1024 ? `${(approxBytes / 1024).toFixed(2)} KB` : `${approxBytes} Bytes`;

      const infoMsg = `${HEADER}\n📊 Notepad Statistics:\n\n` +
        `📝 Total Notes: ${toBoldSans(notes.length)}\n` +
        `📌 Pinned Notes: ${toBoldSans(pinnedCount)}\n` +
        `❤️ Favorite Notes: ${toBoldSans(favCount)}\n` +
        `📅 First Note: ${toBoldSans(firstNoteDate)}\n` +
        `📅 Latest Note: ${toBoldSans(latestNoteDate)}\n` +
        `💾 Storage: ~${toBoldSans(formattedStorage)}\n━━━━━━━━━━━━━━━━━━`;
      return api.sendMessage(infoMsg, threadID, messageID);
    }

    // Default: Show premium helper layout
    const helpMsg = `${HEADER}\n💡 Available Notepad Commands:\n\n` +
      `🔹 /note save <text> ➜ Save note\n` +
      `🔹 /note list [page] ➜ List notes\n` +
      `🔹 /note view <index> ➜ Read note\n` +
      `🔹 /note edit <index> <text> ➜ Edit note\n` +
      `🔹 /note delete <index> ➜ Delete note\n` +
      `🔹 /note pin <index> ➜ Pin to top\n` +
      `🔹 /note unpin <index> ➜ Unpin note\n` +
      `🔹 /note favorite <index> ➜ Favorite note\n` +
      `🔹 /note unfavorite <index> ➜ Unfavorite\n` +
      `🔹 /note sort <newest/oldest/az>\n` +
      `🔹 /note search <text> ➜ Search notes\n` +
      `🔹 /note info ➜ Notepad stats\n` +
      `🔹 /note clear ➜ Erase all notes\n` +
      `🔹 /note export ➜ Get TXT backup\n` +
      `🔹 /note import ➜ Restore from txt\n\n` +
      `⚡ Shortcut commands trigger directly:\n` +
      `• ns <text>  • na <text>  • nl [page]\n` +
      `• nv <index>  • nd <index>  • nc\n━━━━━━━━━━━━━━━━━━`;
    return api.sendMessage(helpMsg, threadID, messageID);
  },

  onChat: async function({ api, event, usersData, threadsData }) {
    const { threadID, senderID, messageReply, body } = event;
    if (!body) return;

    // Direct reply tracking check
    if (messageReply && global.noteReplies && global.noteReplies[messageReply.messageID]) {
      const replyContext = global.noteReplies[messageReply.messageID];
      
      // A. LIST REPLY HANDLER (Opens specified note)
      if (replyContext.type === "list") {
        const replyText = body.trim();
        const noteNum = parseInt(replyText, 10);

        if (!isNaN(noteNum) && /^\d+$/.test(replyText)) {
          const notes = await getNotes(threadID, threadsData);
          if (noteNum >= 1 && noteNum <= notes.length) {
            const note = notes[noteNum - 1];
            const badge = note.pinned ? " 📌 [Pinned]" : (note.favorite ? " ❤️ [Favorite]" : "");
            const metaMsg = `━━━━━━━━━━━━━━━━━━\n📝 𝗥𝗶𝘆𝗮𝗱'𝘀 𝗡𝗼𝘁𝗲 #${toBoldSans(noteNum)}${badge}\n━━━━━━━━━━━━━━━━━━\n👤 Creator: ${toBoldSans(note.creator)}\n📅 Time: ${formatDateTime(note.time)}\n━━━━━━━━━━━━━━━━━━\n\n`;
            return api.sendMessage(`${metaMsg}${note.content}`, threadID);
          } else {
            return api.sendMessage(`❌ Note #${noteNum} does not exist. Choose between 1 and ${notes.length}.`, threadID);
          }
        }
      }

      // B. CONFIRM WIPE REPLIER
      if (replyContext.type === "clear" && senderID === replyContext.adminID) {
        if (Date.now() - replyContext.time < 60000) {
          const replyText = body.trim().toLowerCase();
          
          if (replyText === "yes" || replyText === "confirm" || replyText === "হ্যাঁ") {
            const success = await saveNotes(threadID, [], threadsData);
            delete global.noteReplies[messageReply.messageID];
            if (success) {
              return api.sendMessage(`${HEADER}\n✅ All notes cleared successfully!\n━━━━━━━━━━━━━━━━━━`, threadID);
            } else {
              return api.sendMessage(`${HEADER}\n❌ Database error. Could not clear notes.\n━━━━━━━━━━━━━━━━━━`, threadID);
            }
          } else if (replyText === "no" || replyText === "cancel" || replyText === "না") {
            delete global.noteReplies[messageReply.messageID];
            return api.sendMessage(`${HEADER}\n🚫 Clear command cancelled.\n━━━━━━━━━━━━━━━━━━`, threadID);
          }
        } else {
          delete global.noteReplies[messageReply.messageID];
          return api.sendMessage(`${HEADER}\n⏱️ Confirmation timed out. Please trigger clear again.\n━━━━━━━━━━━━━━━━━━`, threadID);
        }
      }
    }
  }
};
