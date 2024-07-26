const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

// Register user
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const userQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(userQuery)

  if (dbUser === undefined) {
    if (password.length <= 5) {
      response.status(400).send('Password is too short')
    } else {
      const createUserQuery = `
        INSERT INTO user (name,username, password, gender)
        VALUES ('${username}','${name}','${hashedPassword}','${gender}');
      `
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400).send('User already exists')
  }
})

// LOGIN API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const loginQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(loginQuery)

  if (dbUser === undefined) {
    response.status(400).send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const payload = {username: username}
      const jsonToken = jwt.sign(payload, 'secret')
      response.send({jwtToken: jsonToken})
    } else {
      response.status(400).send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'secret', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}
//api 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}';`
  const ResultuserId = await db.get(getUserId)
  const userId = ResultuserId.user_id
  const gettweetsQuery = `SELECT u.username AS username, t.tweet, t.date_time AS dateTime
  FROM user AS u
  INNER JOIN follower AS f ON u.user_id = f.following_user_id
  INNER JOIN tweet AS t ON f.following_user_id = t.user_id
  WHERE f.follower_user_id = ${userId}
  ORDER BY t.date_time DESC
  LIMIT 4;
`
  const tweet = await db.all(gettweetsQuery)
  response.send(tweet)
})
//api4

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}';`
  const ResultuserId = await db.get(getUserId)
  const userId = ResultuserId.user_id

  // Corrected SQL Query for fetching following users
  const getFollowingQuery = `
    SELECT u2.name
    FROM user AS u1
    INNER JOIN follower AS f ON u1.user_id = f.follower_user_id
    INNER JOIN user AS u2 ON f.following_user_id = u2.user_id
    WHERE u1.user_id = ${userId}
    ORDER BY u2.name;
  `
  const following = await db.all(getFollowingQuery)
  response.send(following)
})

//api5// API 5

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}';`
  const ResultuserId = await db.get(getUserId)
  const userId = ResultuserId.user_id

  // Corrected SQL Query for fetching followers
  const getFollowersQuery = `
    SELECT u1.name
    FROM user AS u1
    INNER JOIN follower AS f ON u1.user_id = f.follower_user_id
    INNER JOIN user AS u2 ON f.following_user_id = u2.user_id
    WHERE u2.user_id = ${userId}
    ORDER BY u1.name;
  `
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

//api6
// API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request

  // Get the user_id of the logged-in user
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const resultUserId = await db.get(getUserIdQuery)
  const userId = resultUserId.user_id

  // Check if the tweet belongs to someone the user is following
  const getFollowingUserIdsQuery = `
    SELECT DISTINCT f.following_user_id
    FROM follower AS f
    WHERE f.follower_user_id = ${userId};
  `
  const followingUserIds = await db.all(getFollowingUserIdsQuery)
  const followingUserIdsList = followingUserIds.map(
    row => row.following_user_id,
  )

  // Check if the tweet belongs to one of the following users
  const getTweetOwnerQuery = `
    SELECT t.user_id
    FROM Tweet AS t
    WHERE t.tweet_id = ${tweetId};
  `
  const tweetOwner = await db.get(getTweetOwnerQuery)

  if (
    tweetOwner === undefined ||
    !followingUserIdsList.includes(tweetOwner.user_id)
  ) {
    response.status(401).send('Invalid Request')
  } else {
    // If the tweet belongs to a user the logged-in user is following, get the tweet details
    const getTweetDetailsQuery = `
      SELECT 
        t.tweet,
        (SELECT COUNT(*) FROM like L WHERE L.tweet_id = t.tweet_id) AS likes,
        (SELECT COUNT(*) FROM reply R WHERE R.tweet_id = t.tweet_id) AS replies,
        t.date_time AS dateTime
      FROM Tweet t
      WHERE t.tweet_id = ${tweetId};
    `
    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  }
})

//api7
// API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    // Get the user_id of the logged-in user
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const resultUserId = await db.get(getUserIdQuery)
    const userId = resultUserId.user_id
    // Get the user_id of the tweet owner
    const getTweetOwnerQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const tweetOwner = await db.get(getTweetOwnerQuery)

    if (!tweetOwner) {
      return response.status(404).send({error: 'Tweet not found'})
    }

    const tweetOwnerId = tweetOwner.user_id

    // Check if the logged-in user is following the tweet owner
    const checkFollowingQuery = `
        SELECT *
        FROM follower
        WHERE follower_user_id = ${userId} AND following_user_id = ${tweetOwnerId};
      `
    const isFollowing = await db.get(checkFollowingQuery)

    if (!isFollowing) {
      return response.status(401).send('Invalid Request')
    }

    // Get the list of users who liked the tweet
    const getLikesQuery = `
        SELECT username
        FROM like INNER JOIN user ON like.user_id = user.user_id
        WHERE like.tweet_id = ${tweetId};
      `
    const likes = await db.all(getLikesQuery)

    const usernames = likes.map(like => like.username)

    response.send({likes: usernames})
  },
)

//api8

// API 8
// API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    // Get the user_id of the logged-in user
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const resultUserId = await db.get(getUserIdQuery)
    const userId = resultUserId.user_id

    const getTweetOwnerQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const tweetOwner = await db.get(getTweetOwnerQuery)

    if (!tweetOwner) {
      return response.status(404).send({error: 'Tweet not found'})
    }

    const tweetOwnerId = tweetOwner.user_id

    // Check if the logged-in user is following the tweet owner
    const checkFollowingQuery = `
        SELECT *
        FROM follower
        WHERE follower_user_id = ${userId} AND following_user_id = ${tweetOwnerId};
      `
    const isFollowing = await db.get(checkFollowingQuery)

    if (!isFollowing) {
      return response.status(401).send('Invalid Request')
    }

    // Get the list of replies for the tweet
    const getRepliesQuery = `
        SELECT user.name, reply.reply
        FROM reply INNER JOIN user ON reply.user_id = user.user_id
        WHERE reply.tweet_id = ${tweetId}
      `
    const replies = await db.all(getRepliesQuery)

    response.send({replies: replies})
  },
)

//api9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const ResultuserId = await db.get(getUserId)
  const userId = ResultuserId.user_id
  const getUserTweetsQuery = `
      SELECT
        tweet.tweet AS tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
      FROM
        tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE
        tweet.user_id = ${userId}
      GROUP BY
        tweet.tweet_id
      ORDER BY
        tweet.date_time DESC
    `

  const userTweets = await db.all(getUserTweetsQuery)

  response.send(userTweets)
})
//api10

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const ResultuserId = await db.get(getUserId)
  const userId = ResultuserId.user_id
  const getfollowingQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
            VALUES ('${tweet}',${userId},CURRENT_TIMESTAMP);`
  await db.run(getfollowingQuery)
  response.send('Created a Tweet')
})

//delete API
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
    const ResultuserId = await db.get(getUserId)
    const userId = ResultuserId.user_id
    const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
    const tweet = await db.get(getTweetQuery)

    if (!tweet) {
      return response.status(404).send({error: 'Tweet not found'})
    }

    // Check if the requesting user is the owner of the tweet
    if (tweet.user_id !== userId) {
      return response.status(401).send('Invalid Request')
    }

    // Delete the tweet
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`
    await db.run(deleteTweetQuery)

    response.send({message: 'Tweet Removed'})
  },
)
module.exports = app;