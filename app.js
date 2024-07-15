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
        VALUES ('${username}','${hashedPassword}','${name}','${gender}');
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
        next()
      }
    })
  }
}
//api 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const userId = await db.get(getUserId)
  const gettweetsQuery = `
    SELECT u.username, t.tweet, t.date_time
FROM User AS u
INNER JOIN Follower AS f ON u.user_id = f.follower_user_id
INNER JOIN Tweet AS t ON f.following_user_id = t.user_id
WHERE f.follower_user_id= '${userId}'
ORDER BY t.date_time DESC 
LIMIT 4;`
  const tweet = await db.all(gettweetsQuery)
  response.send(tweet)
})
//api4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const userId = await db.get(getUserId)
  const getfollowingQuery = `
    SELECT u2.name
FROM User AS u1
INNER JOIN Follower AS f ON u1.user_id = f.follower_user_id
INNER JOIN User AS u2 ON f.following_user_id = u2.user_id
WHERE u2.user_id= '${userId}'
ORDER BY u1.name;`
  const query = await db.all(getfollowingQuery)
  response.send(query)
})
//api5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const userId = await db.get(getUserId)
  const getfollowingQuery = `
    SELECT u1.name
FROM User AS u1
INNER JOIN Follower AS f ON u1.user_id = f.following_user_id
INNER JOIN User AS u2 ON f.follower_user_id = u2.user_id
WHERE u2.user_id='${userId}'
ORDER BY u2.name;`
  const query = await db.all(getfollowingQuery)
  response.send(query)
})
//api6
//api5
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params

  const getfollowingQuery = `
SELECT t.tweet,
             (SELECT COUNT(*) FROM like L WHERE L.tweet_id = t.tweet_id) AS likes,
             (SELECT COUNT(*) FROM reply R WHERE R.tweet_id = t.tweet_id) AS replies,
             t.date_time AS dateTime
      FROM Tweet t
      WHERE
    t.tweet_id = '${tweetId}'
     ;

`
  const query = await db.get(getfollowingQuery)
  response.send(query)
})
//api7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params

    const getfollowingQuery = `
SELECT u.username
FROM User u
INNER JOIN Like l ON u.user_id = l.user_id
WHERE l.tweet_id = '${tweetId}'
     ;
`
    const query = await db.all(getfollowingQuery)
    response.send({likes: [query.username]})
  },
)
//api8

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params

    const getfollowingQuery = `
SELECT u.name, r.reply
      FROM Reply r
      INNER JOIN User u ON r.user_id = u.user_id
      WHERE r.tweet_id = '${tweetId}';
     ORDER BY r.created_at ASC;
`
    const repiles = await db.all(getfollowingQuery)
    response.send({repiles})
  },
)

//api9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const getTweetsQuery = `
      SELECT t.tweet, COUNT(l.like_id) AS likes_count, COUNT(r.reply_id) AS replies_count, t.date_time
      FROM Tweet t
      LEFT JOIN Like l ON l.tweet_id = t.tweet_id
      LEFT JOIN Reply r ON r.tweet_id = t.tweet_id
      GROUP BY t.tweet_id, t.tweet, t.date_time;
    `
  const repiles = await db.all(getTweetsQuery)
  response.send({repiles})
})

//api10

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`
  const userId = await db.get(getUserId)
  const getfollowingQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
            VALUES ('${tweet}',${userId},CURRENT_TIMESTAMP);`
  await db.run(getfollowingQuery)
  response.send('Created a Tweet')
})

//delete API
app.delete('/tweets/:tweetId/', async (request, response) => {
  const {tweetId} = request.params
  const deleteTweetQuery = `
    DELETE FROM
       tweet
    WHERE
        tweet_id  = ${tweetId}`
  await db.run(deleteTweetQuery)
  response.send('Tweet Deleted')
})

module.exports = app
