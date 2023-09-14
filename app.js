const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndResponse = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Started at http://locaalhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndResponse();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "myToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = username;
        request.tweet = payload.tweet;
        request.tweetId = payload.tweetId;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO 
       user (name, username, password, gender)
       VALUES ("${name}", "${username}","${hashedPassword}","${gender}")`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status = 400;
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const jwtToken = jwt.sign(dbUser, "myToken");
      response.send({ jwtToken });
    } else {
      response.status = 400;
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getFeedQuery = `
    SELECT 
        username,
        tweet,
        date_time
    FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id 
    WHERE
     follower.following_user_id = ${user_id}
     ORDER BY 
     date_time DESC
     LIMIT 4;`;
  const dbResponse = await db.all(getFeedQuery);
  response.send(dbResponse);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getUserFollowQuery = `
    SELECT 
        username
    FROM  user INNER JOIN follower ON user.user_id = follower.follower_user_id  
    WHERE
     follower.following_user_id = ${user_id};`;
  const dbResponse = await db.all(getUserFollowQuery);
  response.send(dbResponse);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getUserFollowersQuery = `
    SELECT 
        name
    FROM  user INNER JOIN follower ON user.user_id = follower.follower_user_id  
    WHERE
     follower.following_user_id = ${user_id};`;
  const dbResponse = await db.all(getUserFollowersQuery);
  response.send(dbResponse);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikesQuery = `
    SELECT 
        *
    FROM  follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
            INNER JOIN user ON user.user_id = like.user_id
    WHERE
      tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const likedUsers = await db.all(getUserFollowersQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getReplyQuery = `
    SELECT 
        *
    FROM  follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
            INNER JOIN user ON user.user_id = reply.user_id
    WHERE
      tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const replyUsers = await db.all(getReplyQuery);
    if (replyUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (replyUsers) => {
        for (let item of replyUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(replyUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getUserTweetQuery = `
    SELECT 
        tweet.tweet AS tweet,
        COUNT DISTINCT(like.like_id) AS likes,
        COUNT DISTINCT(reply.reply_id) AS replies,
        tweet.date_time AS dateTime
    FROM  user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
          INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
     user.user_id = ${user_id}
     GROUP BY
     tweet.tweet_id;`;
  const dbResponse = await db.all(getUserTweetQuery);
  response.send(dbResponse);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `
    INSERT INTO
    tweet (tweet, user_id)
    VALUES (
        "${tweet}",
        ${user_id}
    )
        ;`;
  const dbResponse = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const userQuery = `
    SELECT 
        *
    FROM  tweet 
    WHERE
      tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
    const tweetUsers = await db.all(userQuery);
    if (tweetUsers.length !== 0) {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE 
          tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
