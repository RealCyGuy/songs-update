async function update() {
  require("dotenv").config();
  const google = require("@googleapis/youtube");
  const { createClient } = require("redis");
  const { parse } = require("tinyduration");
  const axios = require("axios");
  const client = new google.youtube({
    version: "v3",
    auth: process.env.API_KEY,
  });
  const redis = createClient({ url: process.env.REDIS_URL });
  var items = [];
  var nextPageToken = true;
  var duration = 0;
  while (nextPageToken) {
    if (nextPageToken === true) {
      nextPageToken = "";
    }
    res = await client.playlistItems.list({
      part: ["contentDetails,snippet,status"],
      maxResults: 50,
      playlistId: "PLRct1-5In-8Ewg5Kq-0JP8wh3ZweOXH9A",
      pageToken: nextPageToken,
    });
    let ids = res.data.items
      .map((item) => item.contentDetails.videoId)
      .join(",");
    res2 = await client.videos.list({
      part: ["contentDetails,snippet,statistics"],
      maxResults: 50,
      id: ids,
    });
    let i2 = 0;
    for (let i = 0; i < res.data.items.length; i++) {
      // if (res.data.items[i].status.privacyStatus != "public") {
      //   console.log(res.data.items[i].contentDetails.videoId + res.data.items[i].snippet.title + " " + res.data.items[i].status.privacyStatus);
      // }
      if ("videoPublishedAt" in res.data.items[i].contentDetails) {
        d = parse(res2.data.items[i2].contentDetails.duration);
        let seconds = 0;
        if ("seconds" in d) {
          seconds = d.seconds;
        } else {
          d.seconds = 0;
        }
        if ("minutes" in d) {
          seconds += d.minutes * 60;
        } else {
          d.minutes = 0;
        }
        if (res2.data.items[i2].statistics.likeCount) {
          likes = parseInt(
            res2.data.items[i2].statistics.likeCount
          ).toLocaleString("en-US");
        } else {
          likes = "0";
        }
        items.push({
          id: res.data.items[i].contentDetails.videoId,
          title: res.data.items[i].snippet.title,
          thumbnail: res.data.items[i].snippet.thumbnails.high.url,
          channel: res.data.items[i].snippet.videoOwnerChannelTitle,
          channelId: res.data.items[i].snippet.videoOwnerChannelId,
          duration: d.minutes + ":" + d.seconds.toString().padStart(2, "0"),
          privacyStatus: res.data.items[i].status.privacyStatus,
          views: parseInt(
            res2.data.items[i2].statistics.viewCount
          ).toLocaleString("en-US"),
          likes: likes,
        });
        duration += seconds;
        i2++;
      }
    }
    nextPageToken = res.data.nextPageToken;
  }
  await redis.connect();
  var oldItems = await redis.get("items");
  oldItems = JSON.parse(oldItems);
  var newItems = items.reverse().filter((value) => {
    return !oldItems.some((oldItem) => oldItem.id === value.id);
  });
  newItems.forEach((item) => {
    axios
      .post(process.env.WEBHOOK_URL, {
        embeds: [
          {
            description: `[${item.title}](https://youtube.com/?watch=${item.id}&list=PLRct1-5In-8Ewg5Kq-0JP8wh3ZweOXH9A)
By: [${item.channel}](https://youtube.com/channel/${item.channelId})`,
            fields: [
              {
                name: "Duration",
                value: item.duration,
                inline: true,
              },
              {
                name: "Views",
                value: item.views,
                inline: true,
              },
              {
                name: "Likes",
                value: item.likes,
                inline: true,
              },
            ],
            color: 7990062,
            author: {
              name: "New song!",
              url: "https://songsyt.netlify.app/",
            },
            image: {
              url: `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`,
            },
          },
        ],
      })
      .catch((err) => {
        console.log(err);
      });
  });
  await redis.set("items", JSON.stringify(items));
  await redis.set("last updated", Date.now().toString());
  await redis.set("duration", duration.toString());
  await redis.quit();
}
update();
