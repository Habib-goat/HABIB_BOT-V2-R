/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * fbinfo command for Facebook Messenger Bot
 * Developed by Riyad
 * 
 * Show user Facebook profile details and download/attach their avatar.
 */

module.exports = {
  config: {
    name: "fbinfo",
    aliases: ["facebook", "fbi", "profile"],
    version: "1.0.0",
    author: "Riyad",
    credits: "Riyad",
    cooldown: 5,
    countDown: 5,
    role: 0,
    permission: "0",
    description: "Show Facebook profile information.",
    category: "Utility",
    guide: {
  en: "{pn} [reply/@mention/uid]"
}
  },

  onStart: async function ({ api, event, args, usersData, threadsData }) {
    const fs = require("fs");
    const path = require("path");
    const https = require("https");
    
    // Attempt to dynamically load axios if available
    let axios;
    try {
      axios = require("axios");
    } catch (e) {
      axios = null;
    }

    // Safely retrieve the cookie session string from the Facebook Chat API
    function getCookieString() {
      try {
        if (api && typeof api.getAppState === "function") {
          const appState = api.getAppState();
          if (Array.isArray(appState)) {
            return appState.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');
          }
        }
      } catch (e) {
        // Ignore errors
      }
      return "";
    }

    // Fetch basic user profile metadata using FCA getUserInfo
    function getUserInfo(uid) {
      return new Promise((resolve) => {
        try {
          if (api && typeof api.getUserInfo === "function") {
            api.getUserInfo(uid, (err, data) => {
              if (err || !data) {
                resolve(null);
              } else {
                resolve(data[uid] || null);
              }
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }

    // Robust file downloader with redirect handling and axios fallback
    function downloadFile(url, dest) {
      return new Promise((resolve, reject) => {
        if (axios) {
          axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            },
            timeout: 10000
          })
          .then(response => {
            const writer = fs.createWriteStream(dest);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', (err) => {
              fs.unlink(dest, () => {});
              reject(err);
            });
          })
          .catch(() => {
            downloadFileFallback(url, dest).then(resolve).catch(reject);
          });
        } else {
          downloadFileFallback(url, dest).then(resolve).catch(reject);
        }
      });
    }

    function downloadFileFallback(url, dest) {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const request = (targetUrl) => {
          https.get(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
          }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              request(response.headers.location);
            } else if (response.statusCode === 200) {
              response.pipe(file);
              file.on('finish', () => {
                file.close(resolve);
              });
            } else {
              fs.unlink(dest, () => {});
              reject(new Error(`Status code: ${response.statusCode}`));
            }
          }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        };
        request(url);
      });
    }

    // Scrapes additional public/private metrics from public profile page
    async function getExtraFBInfo(uid, cookieStr) {
      const extraInfo = {
        followers: "N/A",
        following: "N/A",
        posts: "N/A",
        created: "N/A",
        profileType: "N/A",
        verified: "N/A"
      };

      try {
        const url = `https://www.facebook.com/profile.php?id=${uid}`;
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        };
        if (cookieStr) {
          headers['Cookie'] = cookieStr;
        }

        let html = "";
        if (axios) {
          const response = await axios.get(url, { headers, timeout: 8000 });
          html = response.data;
        } else {
          html = await new Promise((resolve, reject) => {
            const options = {
              headers: headers,
              timeout: 8000
            };
            https.get(url, options, (res) => {
              let data = "";
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve(data));
            }).on('error', err => reject(err));
          });
        }

        if (html) {
          // 1. Followers
          const followerMatch = html.match(/"follower_count"\s*:\s*(\d+)/) || 
                                html.match(/"subscriber_count"\s*:\s*(\d+)/) ||
                                html.match(/Followed by ([\d,.]+)/i) ||
                                html.match(/([\d,.]+)\s*followers/i);
          if (followerMatch) {
            extraInfo.followers = followerMatch[1] || followerMatch[0];
          }

          // 2. Following
          const followingMatch = html.match(/"following_count"\s*:\s*(\d+)/) ||
                                 html.match(/Following ([\d,.]+)/i) ||
                                 html.match(/([\d,.]+)\s*following/i);
          if (followingMatch) {
            extraInfo.following = followingMatch[1] || followingMatch[0];
          }

          // 3. Verified
          const verifiedMatch = html.match(/"is_verified"\s*:\s*(true|false)/) ||
                            html.match(/"verification_status"\s*:\s*"([^"]+)"/);
          if (verifiedMatch) {
            const isVerified = verifiedMatch[1] === "true" || verifiedMatch[2] === "VERIFIED";
            extraInfo.verified = isVerified ? "Yes" : "No";
          } else {
            if (html.includes('verification_badge') || html.includes('verified_badge') || html.includes('is_verified":true')) {
              extraInfo.verified = "Yes";
            } else {
              extraInfo.verified = "No";
            }
          }

          // 4. Account Created Date
          const createdMatch = html.match(/"creation_time"\s*:\s*(\d+)/) ||
                               html.match(/"created_time"\s*:\s*(\d+)/);
          if (createdMatch) {
            const timestamp = parseInt(createdMatch[1]) * 1000;
            if (!isNaN(timestamp) && timestamp > 0) {
              extraInfo.created = new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
            }
          }

          // 5. Profile Type
          const typeMatch = html.match(/"profile_type"\s*:\s*"([^"]+)"/) ||
                            html.match(/"type"\s*:\s*"([^"]+)"/);
          if (typeMatch) {
            extraInfo.profileType = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1);
          } else {
            if (html.includes('"is_profile":true') || html.includes('"__typename":"User"')) {
              extraInfo.profileType = "User";
            } else if (html.includes('"__typename":"Page"')) {
              extraInfo.profileType = "Page";
            }
          }

          // 6. Public Posts count
          const postsMatch = html.match(/"post_count"\s*:\s*(\d+)/);
          if (postsMatch) {
            extraInfo.posts = postsMatch[1];
          }
        }
      } catch (error) {
        // Safe catch-all to prevent command crash
      }

      return extraInfo;
    }

    try {
      // Step 1: Extract target UID based on selection rules (Priority: Reply > Mention > Sender)
      let uid;

if (event.messageReply && event.messageReply.senderID) {
  // Reply
  uid = event.messageReply.senderID;

} else if (event.mentions && Object.keys(event.mentions).length > 0) {
  // Mention
  uid = Object.keys(event.mentions)[0];

} else if (args.length > 0 && /^\d+$/.test(args[0])) {
  // UID
  uid = args[0];

} else {
  // Sender
  uid = event.senderID;
}

      if (!uid) {
        return api.sendMessage("❌ Could not determine Facebook UID.", event.threadID, event.messageID);
      }

      // Send a typing/loading indicator so the user knows the command is executing
      const initialMsg = await new Promise((resolve) => {
        api.sendMessage("🔍 Fetching Facebook profile details, please wait...", event.threadID, (err, info) => {
          resolve(info);
        }, event.messageID);
      });

      // Default profile details
      let name = "N/A";
      let username = "N/A";
      let profileLink = `https://www.facebook.com/profile.php?id=${uid}`;
      let avatarUrl = `https://graph.facebook.com/${uid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      // Pull from framework-supplied usersData if available
      if (typeof usersData !== "undefined" && usersData && typeof usersData.get === "function") {
        try {
          const cachedUser = await usersData.get(uid);
          if (cachedUser) {
            name = cachedUser.name || name;
            username = cachedUser.username || username;
          }
        } catch (e) {
          // Ignore cache fetch failures
        }
      }

      // Fetch official details using FCA's API helper
    
      const apiResult = await getUserInfo(uid);
      if (apiResult) {
  name = apiResult.name || name;

  username =
    apiResult.username ||
    apiResult.vanity ||
    apiResult.vanityName ||
    username;

  if (apiResult.profileUrl) {
    profileLink = apiResult.profileUrl;
  }

  //if (apiResult.thumbSrc && apiResult.thumbSrc.startsWith("http")) {
    //avatarUrl = apiResult.thumbSrc;
  //}
}
      console.log(apiResult);
console.log("thumbSrc:", apiResult?.thumbSrc);
console.log("username:", apiResult?.username);
console.log("vanity:", apiResult?.vanity);
      console.log("UID:", uid);
console.log("API RESULT:", apiResult);

      // Download profile image avatar
      const tempPath = path.join(__dirname, `avatar_${uid}_${Date.now()}.jpg`);
      let hasAvatar = false;
      try {
        console.log("Avatar URL:", avatarUrl);

await downloadFile(avatarUrl, tempPath);
        hasAvatar = fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0;
      } catch (err) {
        hasAvatar = false;
      }

      // Build precise template formatting requested
      const responseMessage = `╔═══════════════════╗
║         📘𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸 𝗜𝗻𝗳𝗼📘
║     ✨ 𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 𝗥𝗶𝘆𝗮𝗱 ✨
╚═══════════════════╝

👤 𝗡𝗮𝗺𝗲          ➜ ${name}
🆔 𝗨𝗜𝗗              ➜ ${uid}
🌐 𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲  ➜ ${username}
🔗 𝗣𝗿𝗼𝗳𝗶𝗹𝗲         ➜ ${profileLink}

               🖼️𝗔𝘃𝗮𝘁𝗮𝗿🖼️
${hasAvatar ? "(Profile Picture attached below)" : "(Unable to download Avatar)"}`;

      // Clean up the initial loading message
      if (initialMsg && initialMsg.messageID && api && typeof api.unsendMessage === "function") {
        try {
          api.unsendMessage(initialMsg.messageID);
        } catch (e) {
          // Ignore if unsend is unsupported or fails
        }
      }

      // Send info message
      if (hasAvatar) {
        api.sendMessage({
          body: responseMessage,
          attachment: fs.createReadStream(tempPath)
        }, event.threadID, (err) => {
          if (err) {
            // Fallback: Send raw message without attachment if sending fails
            api.sendMessage(responseMessage, event.threadID, event.messageID);
          }
          // Cleanup temp file
          try {
            fs.unlinkSync(tempPath);
          } catch (e) {}
        }, event.messageID);
      } else {
        api.sendMessage(responseMessage, event.threadID, event.messageID);
      }

    } catch (globalError) {
      console.error("Error running fbinfo command:", globalError);
      api.sendMessage(`❌ An error occurred: ${globalError.message || globalError}`, event.threadID, event.messageID);
    }
  }
};
