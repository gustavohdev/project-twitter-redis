const express = require('express')
const app = express()
const path = require('path')
const redis = require('redis')
const client = redis.createClient()
const bcrypt = require('bcrypt')
const session = require('express-session')
const RedisStore = require('connect-redis')(session)

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
app.get('/', (req,res) => {
  if(req.session.userid){
    client.hkeys("users", (err, users) => {
      console.log(users)
      res.render("dashboard", {
        users,
      })
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


