require('dotenv').config()
const express = require('express')
const app = express()
const port =3000 

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/home', (req,res)=>{
    res.send("This is the home page")
})

app.get('/login', (req,res)=>{
    res.send('<h1>This is the login page</h1>'
        
    )
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


app.get('/hello/:name', (req, res) => {
  res.send(`Hello, ${req.params.name}!`);
});

// 🔹 Query string example
app.get('/search', (req, res) => {
  const query = req.query.q;
  res.send(`You searched for: ${query}`);
});


app.listen(process.env.PORT, () => {
  console.log(`Example app listening on port ${port}`)
})