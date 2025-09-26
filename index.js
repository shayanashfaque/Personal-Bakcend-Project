require('dotenv').config()
const express = require('express')
const app = express()

// Always pull PORT from env (fallback to 3000 if not set)
const port = process.env.PORT || 3000

app.use(express.static('public'));

app.get('/home', (req,res)=>{
    res.send("This is the home page")
})

app.get('/login', (req,res)=>{
    res.send('<h1>This is the login page</h1>')
})

app.get('/aboutus', (req,res)=>{
    res.send("This is a first app made by yours truly")
})

app.get('/api/user',(req,res)=>{
  res.json({
    name:"Shayan",
    age:24, 
    role:"Developer"
  })
})

// 🔹 Route parameter example
app.get('/hello/:name', (req, res) => {
  res.send(`Hello, ${req.params.name}!`);
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

