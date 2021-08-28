const express = require('express')
const app = express()
const path = require('path')
const redis = require('redis')
const client = redis.createClient()
const bcrypt = require('bcrypt')
const session = require('express-session')
const RedisStore = require('connect-redis')(session)
const { promisify } = require('util')

const ahget = promisify(client.hget).bind(client)
const asmembers = promisify(client.smembers).bind(client)
const ahkeys = promisify(client.hkeys).bind(client)
const aincr = promisify(client.incr).bind(client)
const alrange = promisify(client.lrange).bind(client)

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, "views"))

app.use(express.urlencoded({ extended: true }))

app.use(
  session({
    store: new RedisStore({ client: client }),
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 36000000, //10 hours, in milliseconds
      httpOnly: false,
      secure: false,
    },
    secret: 'bM80SARMxlq4fiWhulfNSeUFURWLTY8vyf',
  })
)

//app.get('/', (req,res) => res.send('Hello World'))
app.get('/', async (req,res) => {

    if (req.session.userid) {
      const currentUserName = await ahget(`user:${req.session.userid}`, 'username')
      const following = await asmembers(`following:${currentUserName}`)    
      const users = await ahkeys('users')
      
      res.render('dashboard', {
        users: users.filter((user) => user !== currentUserName && following.indexOf(user) === -1)
      })

  }else{
    res.render('login')
  }
})

app.get("/post", (req, res) => {
  if (req.session.userid) {
    res.render("post")
  } else {
    res.render("login")
  }
})

app.post("/post", (req, res) => {
  if (!req.session.userid) {
    res.render("login")
    return
  }

  const { message } = req.body

  client.incr("postid", async (err, postid) => {
    client.hmset(
      `post:${postid}`,
      "userid",
      req.session.userid,
      "message",
      message,
      "timestamp",
      Date.now()
    )
    res.render("dashboard")
  })
})

app.post("/follow", (req, res) => {
  if (!req.session.userid) {
    res.render("login")
    return
  }

  const { username } = req.body

  client.hget(
    `user:${req.session.userid}`,
    "username",
    (err, currentUserName) => {
      client.sadd(`following:${currentUserName}`, username)
      client.sadd(`followers:${username}`, currentUserName)
    }
  )

  res.redirect("/")
})



app.post("/", (req, res) => {
    const { username, password } = req.body

    const saveSessionAndRenderDashboard = (userid) => {
      req.session.userid = userid
      req.session.save()
      client.hkeys("users", (err, users) => {
        res.render("dashboard", {
          users,
        })
      })
    }

    console.log(req.body, username, password)

    if (!username || !password) {
      res.render("error", {
        message: "Please set both username and password",
      })
      return
    }

    const handleSignup = (username,password) => {
      //user does not exist, signup procedure
        client.incr('userid', async (err, userid) => {
          client.hset('users', username, userid)

          const saltRounds = 10
          const hash = await bcrypt.hash(password, saltRounds)

          client.hset(`user:${userid}`, 'hash', hash, 'username', username)

          saveSessionAndRenderDashboard(userid)
        
      })
    }

    const handleLogin = (userid, password) =>{
      //user exists, login procedure
      client.hget(`user:${userid}`, 'hash', async (err, hash) => {
        const result = await bcrypt.compare(password, hash)
        if (result) {
          //password ok
          saveSessionAndRenderDashboard(userid)
        } else {
          //wrong password
          res.render("error", {
            message: "Incorrect password",
          })
          return
        }
      })
    }

    client.hget('users', username, async (err, userid) => {
      if (!userid) { //signup procedure
        handleSignup(username,password)
      } else { //login procedure
        handleLogin(userid, password)
      }
    })
  })

app.listen(3000, () => console.log('Server Ready'))


